/**
 * Forderungsausfall & Wertberichtigung (Phase 16, D4/D5).
 *
 * Drei Geschäftsvorgänge:
 *   1. DIRECT_WRITEOFF — Endgültige Ausbuchung uneinbringlicher Forderung
 *      (§17 Abs. 2 UStG: USt-Korrektur fällig). Status der Invoice → WRITTEN_OFF.
 *   2. EWB (Einzelwertberichtigung §253 HGB) — Forderung wird als
 *      zweifelhaft markiert, Wertminderung im EK auf gesondertes Konto
 *      umgebucht. Forderung bleibt offen, USt unberührt.
 *   3. PWB (Pauschalwertberichtigung §253 HGB) — Pauschal-Risikovorsorge
 *      (üblich 1% des offenen Bestands). Reine Buchung — kein
 *      Bezug zu einer einzelnen Invoice.
 *
 * Diese Lib erzeugt ValueAdjustment-Records + optional die §17-USt-
 * Korrekturbuchung. Die echte Erlöskonto-Buchung wird Caller-seitig
 * über JournalEntry-Manager angelegt — wir verlinken nur.
 */

import { Decimal } from "@prisma/client-runtime-utils";
import { ValueAdjustmentType, PostingSource } from "@prisma/client";
import type { TxClient } from "@/lib/invoices/numberGenerator";
import { createUStAdjustment } from "./ust-adjustment";
import { getTenantSettings } from "@/lib/tenant-settings";
import { assertPeriodOpen } from "./period-lock";
import { logger } from "@/lib/logger";

export interface WriteOffParams {
  tenantId: string;
  invoiceId: string;
  type: ValueAdjustmentType;
  amount: number;
  reason: string;
  effectiveDate: Date;
  userId: string;
  /** Bei DIRECT_WRITEOFF + USt-pflichtiger Forderung: erzeuge §17-USt-Korrektur. */
  createUStAdjustment?: boolean;
}

export interface WriteOffResult {
  valueAdjustmentId: string;
  ustAdjustmentId: string | null;
  /** Buchung der Ausbuchung, falls sie nicht schon über §17 erfolgt ist. */
  journalEntryId: string | null;
  newInvoiceStatus: "WRITTEN_OFF" | "SENT" | "PARTIALLY_PAID" | "PAID";
}

export class InvoiceNotWriteOffableError extends Error {
  constructor(public readonly status: string) {
    super(`Rechnung im Status "${status}" kann nicht abgeschrieben werden`);
    this.name = "InvoiceNotWriteOffableError";
  }
}

/** Abschreibungsbetrag übersteigt die noch offene Forderung. */
export class WriteOffExceedsOpenAmountError extends Error {
  constructor(
    public readonly requested: number,
    public readonly openAmount: number,
  ) {
    super(
      `Abschreibung ${requested.toFixed(2)} € übersteigt die offene Forderung ` +
        `von ${openAmount.toFixed(2)} €.`,
    );
    this.name = "WriteOffExceedsOpenAmountError";
  }
}

/**
 * Wertberichtigung / Forderungsausfall buchen. Caller in $transaction.
 */
export async function writeOffReceivable(
  tx: TxClient,
  params: WriteOffParams,
): Promise<WriteOffResult> {
  if (params.amount <= 0) {
    throw new Error("Wertberichtigungs-Betrag muss > 0 sein");
  }

  const invoice = await tx.invoice.findUnique({
    where: { id: params.invoiceId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      grossAmount: true,
      paidAmount: true,
      taxCodeId: true,
    },
  });

  if (!invoice) {
    const err = new Error("Rechnung nicht gefunden");
    err.name = "EntityNotFoundError";
    throw err;
  }
  if (invoice.tenantId !== params.tenantId) {
    const err = new Error("Rechnung gehört zu anderem Mandanten");
    err.name = "TenantMismatchError";
    throw err;
  }

  // Finding 1.8a: PAID fehlte in dieser Liste. Eine vollständig bezahlte
  // Forderung ist vereinnahmt — sie kann per Definition nicht uneinbringlich
  // sein. Ohne den Ausschluss ließ sich eine §17-USt-Korrektur auf bereits
  // vereinnahmtes Geld buchen (unberechtigte USt-Erstattung) und der Status
  // sprang von PAID auf WRITTEN_OFF, obwohl paidAmount == grossAmount blieb.
  if (
    invoice.status === "DRAFT" ||
    invoice.status === "CANCELLED" ||
    invoice.status === "WRITTEN_OFF" ||
    invoice.status === "PAID"
  ) {
    throw new InvoiceNotWriteOffableError(invoice.status);
  }

  // Finding 1.8b: es fehlte jede Obergrenze. Abschreibbar ist höchstens der
  // noch offene Betrag (Brutto abzüglich bereits geleisteter Zahlungen) —
  // sonst entsteht über die §17-Korrektur eine USt-Minderung auf Geld, das
  // nie ausgefallen ist.
  const grossDec = new Decimal(invoice.grossAmount);
  const paidDec = new Decimal(invoice.paidAmount ?? 0);
  const openDec = grossDec.minus(paidDec).toDecimalPlaces(2);
  const amountDec = new Decimal(params.amount).toDecimalPlaces(2);

  if (openDec.lessThanOrEqualTo(0)) {
    throw new WriteOffExceedsOpenAmountError(
      amountDec.toNumber(),
      openDec.toNumber(),
    );
  }
  if (amountDec.greaterThan(openDec)) {
    throw new WriteOffExceedsOpenAmountError(
      amountDec.toNumber(),
      openDec.toNumber(),
    );
  }

  // Die Abschreibung erzeugt Hauptbuchbuchungen mit entryDate =
  // effectiveDate. Fällt dieses Datum in eine festgeschriebene Periode,
  // darf nichts gebucht werden (§146 AO). Die Route fängt PeriodLockedError
  // bereits ab und antwortet mit 409.
  await assertPeriodOpen(params.tenantId, params.effectiveDate, tx);

  const settings = await getTenantSettings(params.tenantId);

  // §17 USt-Korrektur bei DIRECT_WRITEOFF (wenn TaxCode + nicht Kleinunternehmer
  // + explizit angefordert). EWB/PWB lassen USt unberührt.
  //
  // Wichtig: createUStAdjustment bucht die Forderung bereits vollständig aus
  // (Erlös soll / USt soll / Forderung haben über den Bruttobetrag). Läuft
  // dieser Zweig, ist die Ausbuchung im Hauptbuch erledigt.
  let ustAdjustmentId: string | null = null;
  if (
    params.type === ValueAdjustmentType.DIRECT_WRITEOFF &&
    params.createUStAdjustment !== false &&
    invoice.taxCodeId &&
    !settings.kleinunternehmer
  ) {
    const result = await createUStAdjustment(tx, {
      tenantId: params.tenantId,
      originalInvoiceId: params.invoiceId,
      reason: "WRITE_OFF",
      adjustmentDate: params.effectiveDate,
      grossDelta: -amountDec.toNumber(),
      userId: params.userId,
      revenueAccount: settings.datevAccountEinspeisung,
      counterAccount: settings.datevAccountReceivables,
      notes: `Forderungsausfall: ${params.reason}`,
    });
    ustAdjustmentId = result.adjustmentId;
  }

  // Finding 1.8c: Ohne §17-Zweig (kein TaxCode, Kleinunternehmer oder bewusst
  // abgewählt) entstand bisher ÜBERHAUPT KEINE Buchung. Der Header versprach
  // eine "Caller-seitige" Buchung — die Route ruft aber keine. Die Forderung
  // blieb also voll in der Bilanz stehen, während die Rechnung WRITTEN_OFF war.
  //
  // Gegenbuchung ohne USt-Anteil: Forderungsverlust (Soll) an Forderungen
  // (Haben) über den vollen Abschreibungsbetrag.
  let journalEntryId: string | null = null;
  if (
    params.type === ValueAdjustmentType.DIRECT_WRITEOFF &&
    ustAdjustmentId === null
  ) {
    const badDebtAccount =
      settings.datevAccountBadDebt || settings.datevAccountEinspeisung;
    const journal = await tx.journalEntry.create({
      data: {
        tenantId: params.tenantId,
        entryDate: params.effectiveDate,
        description:
          `Forderungsausfall: ${params.reason}`.slice(0, 200),
        status: "POSTED",
        source: PostingSource.AUTO,
        referenceType: "Invoice",
        referenceId: params.invoiceId,
        createdById: params.userId,
        lines: {
          create: [
            {
              lineNumber: 1,
              account: badDebtAccount,
              description: "Forderungsverlust".slice(0, 200),
              debitAmount: amountDec,
              creditAmount: null,
            },
            {
              lineNumber: 2,
              account: settings.datevAccountReceivables,
              description: "Ausbuchung Forderung".slice(0, 200),
              debitAmount: null,
              creditAmount: amountDec,
            },
          ],
        },
      },
      select: { id: true },
    });
    journalEntryId = journal.id;
  } else if (params.type !== ValueAdjustmentType.DIRECT_WRITEOFF) {
    // EWB/PWB sind Risikovorsorge: die Forderung bleibt offen, gebucht wird
    // Aufwand an ein Wertberichtigungskonto (Passivposten). Dafür fehlt in den
    // Tenant-Settings bislang ein eigenes Konto — eine Buchung auf das
    // Bad-Debt-Konto wäre fachlich falsch, weil sie die Forderung mindern
    // würde. Deshalb bewusst keine Buchung.
    // TODO(wertberichtigung): eigenes Konto in TenantSettings ergänzen
    // (SKR03 3070 / SKR04 3090) und hier Aufwand an WB-Konto buchen.
    logger.info(
      {
        invoiceId: params.invoiceId,
        type: params.type,
        amount: amountDec.toNumber(),
      },
      "[WriteOff] EWB/PWB ohne Hauptbuchbuchung - Wertberichtigungskonto nicht konfiguriert",
    );
  }

  const adjustment = await tx.valueAdjustment.create({
    data: {
      tenantId: params.tenantId,
      invoiceId: params.invoiceId,
      type: params.type,
      amountEur: new Decimal(params.amount),
      reason: params.reason.slice(0, 500),
      effectiveDate: params.effectiveDate,
      ustAdjustmentId,
      createdById: params.userId,
    },
    select: { id: true },
  });

  // Bei DIRECT_WRITEOFF: Invoice-Status auf WRITTEN_OFF.
  // Bei EWB/PWB: Status bleibt (Forderung formal noch offen, nur Risikovorsorge).
  let newInvoiceStatus: WriteOffResult["newInvoiceStatus"] = invoice.status as
    | "SENT"
    | "PARTIALLY_PAID"
    | "PAID";
  if (params.type === ValueAdjustmentType.DIRECT_WRITEOFF) {
    await tx.invoice.update({
      where: { id: params.invoiceId },
      data: { status: "WRITTEN_OFF" },
    });
    newInvoiceStatus = "WRITTEN_OFF";
  }

  return {
    valueAdjustmentId: adjustment.id,
    ustAdjustmentId,
    journalEntryId,
    newInvoiceStatus,
  };
}
