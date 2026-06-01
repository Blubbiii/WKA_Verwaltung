/**
 * §17 UStG USt-Korrekturbuchung (Phase 11).
 *
 * Bei Entgeltminderung (Skonto, Gutschrift) oder Uneinbringlichkeit
 * (Forderungsausfall, Teil-Uneinbringlichkeit) muss sowohl der Erlös als
 * auch die USt-Schuld berichtigt werden (§17 Abs. 1/2 UStG). Wir erzeugen
 * dafür eine NEUE Buchung (kein Inplace-Update der Original-Buchung —
 * GoBD §146 Abs. 4 Unveränderbarkeit) und verknüpfen sie über UStAdjustment.
 *
 * Buchungssatz (Skonto auf Ausgangsrechnung mit 19% USt):
 *   Erlöse 19%      an  Forderungen     (Netto-Minderung)
 *   USt 19%         an  Forderungen     (USt-Minderung)
 *   ODER zusammengefasst:
 *   8736 Skonto-Aufwand   84,03   |   1200 Forderungen   100,00
 *   1776 USt 19%          15,97   |
 *
 * Wir wählen die einfache Form (Skonto-Aufwand-Konto + USt-Konto +
 * Forderungen) — das ist DATEV-konform und reduziert die Komplexität.
 *
 * Period-Lock: Die Korrekturbuchung verwendet adjustmentDate (vom Caller
 * angegeben, meist Zahlungseingangsdatum). Sie wird gegen die Periodensperre
 * (P9) geprüft.
 */

import { Prisma, PostingSource, UStAdjustmentReason } from "@prisma/client";
import type { TxClient } from "@/lib/invoices/numberGenerator";
import { assertPeriodOpen } from "./period-lock";
import { splitGrossAmount } from "./tax-split";
import { resolveTaxCode } from "./tax-codes";

export interface CreateUStAdjustmentParams {
  tenantId: string;
  /** Genau EINE der beiden Referenzen MUSS gesetzt sein. */
  originalInvoiceId?: string;
  originalIncomingInvoiceId?: string;
  reason: UStAdjustmentReason;
  /** Datum der Korrekturbuchung (= Zahlungsdatum bei Skonto, Verzichtsdatum
   *  bei Forderungsausfall, Gutschriftsdatum bei Storno). */
  adjustmentDate: Date;
  /** Brutto-Korrekturbetrag (positiv für Erhöhung, negativ für Minderung).
   *  Skonto: negativ (Forderung sinkt). Gutschrift: negativ. */
  grossDelta: number;
  userId: string;
  /** SKR03/04: Erlöskonto (Original) oder Skonto-Aufwand-Konto.
   *  Beispiel SKR04: "8736" Erlösschmälerungen 19% USt. */
  revenueAccount: string;
  /** SKR03/04: Gegenkonto (Forderung 1200 SKR04 / 1400 SKR03 oder Verbindlichkeit). */
  counterAccount: string;
  notes?: string;
}

/**
 * Erzeugt die §17-Korrekturbuchung INNERHALB einer existierenden Transaktion.
 * Der Caller MUSS prisma.$transaction wrappen — wir komponieren rein.
 *
 * Schritte:
 *  1. assertPeriodOpen() für adjustmentDate
 *  2. TaxCode der Original-Rechnung laden (via Invoice.taxCodeId → resolveTaxCode)
 *  3. splitGrossAmount() für den Delta-Betrag
 *  4. JournalEntry (POSTED, source=AUTO) mit 3 Lines:
 *     - revenueAccount  Soll/Haben  netto-Delta
 *     - taxCode.taxAccount  Soll/Haben  ust-Delta (übersprungen bei rate=0)
 *     - counterAccount  Haben/Soll  brutto-Delta
 *  5. UStAdjustment-Record mit Verweis auf den JournalEntry
 *
 * @returns die UStAdjustment-ID + JournalEntry-ID
 */
export async function createUStAdjustment(
  tx: TxClient,
  params: CreateUStAdjustmentParams,
): Promise<{ adjustmentId: string; journalEntryId: string }> {
  if (!params.originalInvoiceId && !params.originalIncomingInvoiceId) {
    throw new Error(
      "createUStAdjustment: originalInvoiceId ODER originalIncomingInvoiceId erforderlich",
    );
  }
  if (params.originalInvoiceId && params.originalIncomingInvoiceId) {
    throw new Error(
      "createUStAdjustment: nur EINE der beiden Referenzen erlaubt",
    );
  }

  await assertPeriodOpen(params.tenantId, params.adjustmentDate, tx);

  // TaxCode der Original-Rechnung laden (für USt-Konto + Rate).
  let taxCodeRaw;
  if (params.originalInvoiceId) {
    const inv = await tx.invoice.findUnique({
      where: { id: params.originalInvoiceId },
      select: {
        tenantId: true,
        invoiceNumber: true,
        taxCode: {
          include: { template: true },
        },
      },
    });
    if (!inv) throw new Error("Original-Rechnung nicht gefunden");
    if (inv.tenantId !== params.tenantId) {
      throw new Error("Original-Rechnung gehört zu anderem Mandanten");
    }
    taxCodeRaw = inv.taxCode;
  } else {
    const inv = await tx.incomingInvoice.findUnique({
      where: { id: params.originalIncomingInvoiceId },
      select: {
        tenantId: true,
        invoiceNumber: true,
        taxCode: { include: { template: true } },
      },
    });
    if (!inv) throw new Error("Original-Eingangsrechnung nicht gefunden");
    if (inv.tenantId !== params.tenantId) {
      throw new Error("Original-Eingangsrechnung gehört zu anderem Mandanten");
    }
    taxCodeRaw = inv.taxCode;
  }

  // Wenn kein TaxCode gesetzt → wir können den Split nicht durchführen.
  // Caller (Skonto-Routine) muss prüfen ob USt-Korrektur überhaupt nötig ist.
  if (!taxCodeRaw) {
    throw new Error(
      "Original-Rechnung hat keinen Tax-Code → §17-Korrektur nicht automatisch möglich",
    );
  }

  const resolved = resolveTaxCode(taxCodeRaw);

  const split = splitGrossAmount(
    { gross: params.grossDelta },
    {
      rate: resolved.rate,
      reverseCharge: resolved.reverseCharge,
      category: resolved.category,
    },
  );

  // Buchungs-Logik:
  // Skonto auf Ausgangsrechnung (grossDelta NEGATIV, also Minderung):
  //   Soll Erlös-Skonto-Konto (Aufwand → Soll)    netto-Betrag (positiv)
  //   Soll USt-Konto (Schuld sinkt → Soll)        ust-Betrag (positiv)
  //   Haben Forderungen                            brutto-Betrag (positiv)
  //
  // Implementierung: wir nehmen die ABS-Werte und buchen je nach Vorzeichen
  // soll/haben entsprechend. Das ist robuster als Minus-Beträge in Lines.
  const sign = params.grossDelta < 0 ? -1 : 1;
  const absNet = Math.abs(split.net);
  const absTax = Math.abs(split.tax);
  const absGross = Math.abs(split.effectiveGross);

  // Bei Minderung (sign=-1, typischer Skonto-Fall):
  //   Erlös-Konto debit (Aufwand-Sicht) | Forderung credit
  //   USt-Konto debit (Schuldminderung) | Forderung credit
  // Bei Erhöhung (sign=+1, selten — z.B. nachträglich höherer Preis):
  //   Erlös-Konto credit | Forderung debit
  //   USt-Konto credit | Forderung debit
  const isReduction = sign < 0;

  type LineInput = NonNullable<
    Prisma.JournalEntryLineCreateWithoutJournalEntryInput
  >;
  const lines: LineInput[] = [];
  let lineNo = 1;

  // Erlös-Korrektur-Line
  lines.push({
    lineNumber: lineNo++,
    account: params.revenueAccount,
    description: `§17 USt-Korrektur (Netto)`.slice(0, 200),
    debitAmount: isReduction ? absNet : null,
    creditAmount: isReduction ? null : absNet,
    taxCode: { connect: { id: taxCodeRaw.id } },
  });

  // USt-Konto-Line (nur wenn tax > 0 und nicht reverse-charge)
  if (absTax > 0 && resolved.taxAccountId) {
    // Wir können das USt-Konto nicht als nur ID übergeben — Line braucht den
    // String "account". Wir laden den Account.
    const taxAcct = await tx.ledgerAccount.findUnique({
      where: { id: resolved.taxAccountId },
      select: { accountNumber: true },
    });
    if (!taxAcct) {
      throw new Error(
        "USt-Konto-Verweis ungültig — taxCode.taxAccountId zeigt ins Leere",
      );
    }
    lines.push({
      lineNumber: lineNo++,
      account: taxAcct.accountNumber,
      description: `§17 USt-Korrektur (Steuer ${(resolved.rate * 100).toFixed(0)}%)`.slice(0, 200),
      debitAmount: isReduction ? absTax : null,
      creditAmount: isReduction ? null : absTax,
      taxCode: { connect: { id: taxCodeRaw.id } },
    });
  }

  // Gegenkonto-Line (Forderung / Verbindlichkeit)
  lines.push({
    lineNumber: lineNo++,
    account: params.counterAccount,
    description: `§17 USt-Korrektur (Brutto)`.slice(0, 200),
    debitAmount: isReduction ? null : absGross,
    creditAmount: isReduction ? absGross : null,
  });

  const journal = await tx.journalEntry.create({
    data: {
      tenantId: params.tenantId,
      entryDate: params.adjustmentDate,
      description: `§17 UStG ${params.reason}: ${params.notes ?? "USt-Korrektur"}`.slice(0, 200),
      status: "POSTED",
      source: PostingSource.AUTO,
      referenceType: params.originalInvoiceId ? "Invoice" : "IncomingInvoice",
      referenceId: params.originalInvoiceId ?? params.originalIncomingInvoiceId ?? null,
      createdById: params.userId,
      lines: { create: lines },
    },
    select: { id: true },
  });

  const adjustment = await tx.uStAdjustment.create({
    data: {
      tenantId: params.tenantId,
      originalInvoiceId: params.originalInvoiceId ?? null,
      originalIncomingInvoiceId: params.originalIncomingInvoiceId ?? null,
      reason: params.reason,
      adjustmentDate: params.adjustmentDate,
      netAmountDelta: sign * absNet,
      taxAmountDelta: sign * absTax,
      journalEntryId: journal.id,
      notes: params.notes ?? null,
      createdById: params.userId,
    },
    select: { id: true },
  });

  return { adjustmentId: adjustment.id, journalEntryId: journal.id };
}
