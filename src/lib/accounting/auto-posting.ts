/**
 * Auto-Posting: Creates JournalEntry records automatically when invoice status changes.
 * Maps invoice items to SKR03/SKR04 accounts from tenant settings.
 *
 * P11: Zwei Engines parallel verfügbar.
 *  - Alt (2-Lines): Brutto auf Erlös-/Aufwand-Konto, Brutto auf Gegenkonto.
 *    USt wird NICHT separat ausgewiesen → UStVA strukturell unbrauchbar.
 *  - Neu (3-Lines): Netto auf Erlös-/Aufwand-Konto, USt separat auf
 *    1776/1771 (Output) bzw. 1576/1571 (Input), Brutto auf Gegenkonto.
 *
 * Umschaltung via TenantSettings.useTaxSplit (Default: false). Sanfter
 * Rollout — Tenants opten ein, nach Validierung wird der Default geflippt.
 *
 * Bei Kleinunternehmer (§19 UStG, settings.kleinunternehmer=true) oder
 * tax=0 fällt die USt-Line weg (es gibt nichts zu splitten).
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  getTenantSettings,
  resolvePaymentAccount,
  type TenantSettings,
} from "@/lib/tenant-settings";
import type { Prisma } from "@prisma/client";
import type { Decimal } from "@prisma/client-runtime-utils";
import type { TxClient } from "@/lib/invoices/numberGenerator";
import { assertPeriodOpen, PeriodLockedError } from "./period-lock";
import { invalidateReportsCache } from "@/lib/cache/reports";

interface AutoPostingResult {
  success: boolean;
  journalEntryId?: string;
  error?: string;
  /** Set when the failure was due to a locked accounting period. */
  periodLocked?: { year: number; month: number };
}

/**
 * Randfall 5/6: Feldlängen der Buchungszeilen respektieren.
 *
 * JournalEntryLine.description ist `@db.VarChar(200)`, JournalEntry.reference
 * ist `@db.VarChar(100)`. InvoiceItem.description ist dagegen ein
 * unbegrenztes TEXT-Feld. Die Kopie erfolgte an mehreren Stellen ungeslict —
 * eine Rechnungsposition mit langem Beschreibungstext ließ Prisma mit P2000
 * abbrechen, die Rechnung war damit nicht buchbar (und ein Storno an der
 * Feldgrenze nicht durchführbar). Die Nachbarzeilen slicen längst, hier war
 * es schlicht vergessen worden.
 */
const JOURNAL_DESCRIPTION_MAX = 200;
const JOURNAL_REFERENCE_MAX = 100;

function clampDescription(value: string): string {
  return value.slice(0, JOURNAL_DESCRIPTION_MAX);
}

function clampReference(value: string): string {
  return value.slice(0, JOURNAL_REFERENCE_MAX);
}

function lineDescription(
  itemDescription: string | null | undefined,
  invoiceNumber: string | null | undefined,
): string {
  return clampDescription(itemDescription || invoiceNumber || "");
}

/** Build account map from tenant settings (no more hardcoded accounts) */
function buildAccountMap(s: TenantSettings): Record<string, { debit: string; credit: string }> {
  return {
    ENERGY: { debit: s.datevAccountReceivables, credit: s.datevAccountEinspeisung },
    ENERGY_DIRECT: { debit: s.datevAccountReceivables, credit: s.datevAccountDirektvermarktung },
    LEASE: { debit: s.datevAccountPachtAufwand, credit: s.datevAccountReceivables },
    SERVICE: { debit: s.datevAccountWartung, credit: s.datevAccountReceivables },
    MANAGEMENT_FEE: { debit: s.datevAccountBF, credit: s.datevAccountReceivables },
  };
}

/**
 * Wählt das USt-Konto für eine Item-Line abhängig von der Buchungsrichtung
 * (Output USt = Verkäufer schuldet, Input Vorsteuer = Käufer kann ziehen)
 * und vom Steuersatz (19% oder 7%).
 *
 * Buchungsrichtung wird heuristisch über die Position des Forderungs-Kontos
 * erkannt: liegt es auf debit → Standard Outgoing (Tenant verkauft);
 *          liegt es auf credit → Incoming-Form (z.B. LEASE: Tenant zahlt Pacht).
 *
 * @returns USt-Kontonummer ODER null wenn kein Standard-Satz erkannt
 */
function pickTaxAccount(
  s: TenantSettings,
  taxRate: number,
  debitAccount: string,
  creditAccount: string,
): { account: string; side: "debit" | "credit" } | null {
  // Toleranz für Decimal-Rundung
  const isStandard = Math.abs(taxRate - 19) < 0.01;
  const isReduced = Math.abs(taxRate - 7) < 0.01;

  if (!isStandard && !isReduced) return null;

  const isOutgoing = debitAccount === s.datevAccountReceivables;
  const isIncoming = creditAccount === s.datevAccountReceivables;

  if (isOutgoing) {
    return {
      account: isStandard ? s.datevAccountOutputTax19 : s.datevAccountOutputTax7,
      side: "credit", // USt-Schuld → Haben
    };
  }
  if (isIncoming) {
    return {
      account: isStandard ? s.datevAccountInputTax19 : s.datevAccountInputTax7,
      side: "debit", // Vorsteuer → Soll
    };
  }
  return null;
}

/**
 * Create a JournalEntry when an invoice is finalized (status → SENT).
 * Only creates if no auto-entry for this invoice already exists.
 */
export async function createAutoPosting(
  invoiceId: string,
  userId: string,
  tenantId: string
): Promise<AutoPostingResult> {
  try {
    // M-9 Perf: existing-Check + invoice-Load + tenant-Settings parallelisieren
    // (vorher 3 sequenzielle awaits). Kosten bei early-exit (existing!=null):
    // 2 unnötige Queries — Optimierung nur wenn der Normalfall ist, dass kein
    // auto-entry existiert, was hier zutrifft (erste Postings beim Send-Flow).
    const [existing, invoice, settings] = await Promise.all([
      prisma.journalEntry.findFirst({
        where: {
          tenantId,
          referenceType: "Invoice",
          referenceId: invoiceId,
          source: "AUTO",
        },
      }),
      prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          items: true,
          fund: { select: { name: true } },
        },
      }),
      getTenantSettings(tenantId),
    ]);

    if (existing) {
      return { success: true, journalEntryId: existing.id };
    }

    if (!invoice) {
      return { success: false, error: "Invoice not found" };
    }

    const accountMap = buildAccountMap(settings);

    // Build journal entry lines from invoice items
    const lines: Prisma.JournalEntryLineCreateWithoutJournalEntryInput[] = [];
    let lineNumber = 1;

    // P11: Flag entscheidet zwischen alter 2-Lines und neuer 3-Lines Engine.
    // Bei Kleinunternehmer fällt die USt-Logik weg → alte Engine reicht.
    const useTaxSplit = settings.useTaxSplit && !settings.kleinunternehmer;

    for (const item of invoice.items) {
      const mapping = accountMap[item.referenceType || ""] || accountMap.ENERGY;
      const debitAccount = item.datevKonto || mapping.debit;
      const creditAccount = item.datevGegenkonto || mapping.credit;
      const gross = item.grossAmount;
      const net = item.netAmount;
      const tax = item.taxAmount;

      if (useTaxSplit && Number(tax) > 0) {
        // ---------- 3-Lines-Engine (Netto + USt + Gegenkonto) ----------
        const taxRate = Number(item.taxRate);
        const taxAcct = pickTaxAccount(settings, taxRate, debitAccount, creditAccount);

        // Forderung/Aufwand-Konto (Soll): Brutto
        lines.push({
          lineNumber: lineNumber++,
          account: debitAccount,
          description: lineDescription(item.description, invoice.invoiceNumber),
          debitAmount: gross,
          creditAmount: null,
          costCenter: item.datevKostenstelle || null,
        });

        // Erlös/Aufwand-Gegenkonto (Haben): Netto
        lines.push({
          lineNumber: lineNumber++,
          account: creditAccount,
          description: lineDescription(item.description, invoice.invoiceNumber),
          debitAmount: null,
          creditAmount: net,
          costCenter: item.datevKostenstelle || null,
        });

        // USt-Konto: Haben bei Outgoing (Schuld) / Soll bei Incoming (Vorsteuer)
        if (taxAcct && taxAcct.account) {
          lines.push({
            lineNumber: lineNumber++,
            account: taxAcct.account,
            description: `USt ${taxRate.toFixed(0)}% — ${item.description || invoice.invoiceNumber || ""}`.slice(0, 200),
            debitAmount: taxAcct.side === "debit" ? tax : null,
            creditAmount: taxAcct.side === "credit" ? tax : null,
            costCenter: null,
          });
        } else {
          // Kein USt-Konto erkennbar (Sonderfall) — Fallback auf 2-Lines.
          // Buchung bleibt ausgeglichen, aber USt landet implizit im Gegenkonto.
          // Korrigieren wir, indem wir die Netto-Line auf Brutto erhöhen.
          // Statt das nachträglich zu fixen: wir loggen + benutzen Brutto auf
          // dem Gegenkonto.
          lines.pop(); // letzte Netto-Line entfernen
          lines.push({
            lineNumber: lineNumber - 1,
            account: creditAccount,
            description: lineDescription(item.description, invoice.invoiceNumber),
            debitAmount: null,
            creditAmount: gross,
            costCenter: item.datevKostenstelle || null,
          });
          logger.warn(
            { invoiceId, itemId: item.id, debitAccount, creditAccount, taxRate },
            "Auto-posting tax-split fallback: USt-Konto nicht erkennbar — Brutto auf Gegenkonto",
          );
        }
      } else {
        // ---------- 2-Lines-Engine (Brutto/Brutto — bewährtes Verhalten) ----------
        lines.push({
          lineNumber: lineNumber++,
          account: debitAccount,
          description: lineDescription(item.description, invoice.invoiceNumber),
          debitAmount: gross,
          creditAmount: null,
          costCenter: item.datevKostenstelle || null,
        });
        lines.push({
          lineNumber: lineNumber++,
          account: creditAccount,
          description: lineDescription(item.description, invoice.invoiceNumber),
          debitAmount: null,
          creditAmount: gross,
          costCenter: item.datevKostenstelle || null,
        });
      }
    }

    if (lines.length === 0) {
      return { success: false, error: "No invoice items to post" };
    }

    // P9: GoBD §146 AO Period-Gate. Wenn der Buchungs-Monat (= invoice.invoiceDate)
    // gesperrt ist, darf das Auto-Posting NICHT laufen. Caller (invoice send-Flow)
    // muss damit umgehen — z.B. Rechnung in offener Periode neu datieren.
    try {
      await assertPeriodOpen(invoice.tenantId, invoice.invoiceDate);
    } catch (err) {
      if (err instanceof PeriodLockedError) {
        return {
          success: false,
          error: err.message,
          periodLocked: { year: err.periodYear, month: err.periodMonth },
        };
      }
      throw err;
    }

    // Create the journal entry
    const entry = await prisma.journalEntry.create({
      data: {
        tenantId: invoice.tenantId,
        entryDate: invoice.invoiceDate,
        description: `Auto: ${invoice.invoiceNumber} - ${invoice.fund?.name || ""}`.slice(0, 200),
        reference: invoice.invoiceNumber,
        status: "POSTED",
        source: "AUTO",
        referenceType: "Invoice",
        referenceId: invoiceId,
        createdById: userId,
        lines: {
          create: lines,
        },
      },
    });

    logger.info(
      { invoiceId, journalEntryId: entry.id },
      "Auto-posting created for invoice"
    );

    // Reports-Cache invalidieren — neue POSTED-Buchung ändert Saldi
    // (Bilanz/GuV/BWA/SuSa/UStVA). Fire-and-forget, damit Caller nicht blockt.
    invalidateReportsCache(invoice.tenantId).catch((err) => {
      logger.warn(
        { err, invoiceId },
        "[Reports-Cache] Invalidation failed after auto-posting create",
      );
    });

    return { success: true, journalEntryId: entry.id };
  } catch (error) {
    logger.error({ err: error, invoiceId }, "Auto-posting failed");
    return { success: false, error: String(error) };
  }
}

// ---------------------------------------------------------------------------
// Zahlungsbuchung (Bank an Forderung) — Finding 1.1
// ---------------------------------------------------------------------------

export interface PaymentPostingParams {
  tenantId: string;
  invoiceId: string;
  /** InvoicePayment.id — dient als Referenz und Idempotenz-Schlüssel. */
  paymentId: string;
  /** Tatsächlich geflossener Brutto-Betrag (immer positiv, nur die Teilzahlung). */
  amount: Decimal;
  /** Buchungsdatum des JournalEntry. Muss in einer offenen Periode liegen. */
  bookingDate: Date;
  /** BANK/SEPA → Bankkonto, CASH → Kassenkonto, OTHER → Bankkonto. */
  paymentMethod: "BANK" | "CASH" | "SEPA" | "OTHER";
  userId: string;
  /** Rechnungsnummer o.ä. für JournalEntry.reference. */
  reference?: string | null;
}

export interface PaymentPostingResult {
  journalEntryId: string | null;
  /** Gesetzt wenn bewusst nicht gebucht wurde (mit Grund im Log). */
  skippedReason?: "ACCOUNT_COLLISION" | "ALREADY_POSTED_RESOLVED";
}

/**
 * Erzeugt die Zahlungsbuchung zu einer InvoicePayment-Zeile.
 *
 * Buchungssatz Ausgangsrechnung (Regelfall):
 *   Bank (Soll)  an  Forderungen (Haben)   — gezahlter Bruttobetrag
 *
 * Buchungssatz "Incoming-Form" (z.B. LEASE — der Mandant zahlt Pacht, das
 * Forderungskonto steht in der Ursprungsbuchung im HABEN):
 *   Forderungen/Verbindlichkeit (Soll)  an  Bank (Haben)
 *
 * Die Richtung wird NICHT geraten, sondern aus der Ursprungsbuchung des
 * Belegs abgeleitet (auf welcher Seite steht dort das Forderungskonto?).
 * Damit bleibt die Zahlungsbuchung automatisch konsistent zu dem, was
 * createAutoPosting() über buildAccountMap() tatsächlich gebucht hat —
 * inklusive item-spezifischer Konto-Overrides.
 *
 * Bewusst NICHT enthalten:
 *  - Skonto/§17: Entgeltminderungen laufen über createUStAdjustment()
 *    (ust-adjustment.ts). Hier wird ausschließlich der GEFLOSSENE Betrag
 *    gebucht, damit nichts doppelt in der GuV landet.
 *  - Teilzahlung: es wird immer nur `amount` gebucht, nie der Rechnungsbetrag.
 *
 * Komponiert in eine bestehende Transaktion (Caller MUSS `tx` übergeben),
 * damit InvoicePayment, Invoice.paidAmount und JournalEntry atomar sind.
 *
 * @returns journalEntryId, oder null wenn bewusst nicht gebucht wurde.
 * @throws PeriodLockedError wenn bookingDate in einem geschlossenen Monat liegt.
 */
export async function createPaymentPosting(
  tx: TxClient,
  params: PaymentPostingParams,
): Promise<PaymentPostingResult> {
  // Idempotenz: existiert bereits eine Buchung zu genau dieser Zahlung,
  // wird sie zurückgegeben statt eine zweite anzulegen. Innerhalb einer TX
  // ist das per Konstruktion unmöglich (paymentId ist frisch), schützt aber
  // Caller, die eine bestehende paymentId nachbuchen.
  const existing = await tx.journalEntry.findFirst({
    where: {
      tenantId: params.tenantId,
      referenceType: "InvoicePayment",
      referenceId: params.paymentId,
      source: "AUTO",
    },
    select: { id: true },
  });
  if (existing) {
    return { journalEntryId: existing.id, skippedReason: "ALREADY_POSTED_RESOLVED" };
  }

  // GoBD §146 AO: die Zahlung darf nicht in einen geschlossenen Monat buchen.
  await assertPeriodOpen(params.tenantId, params.bookingDate, tx);

  const settings = await getTenantSettings(params.tenantId);
  const receivableAccount = settings.datevAccountReceivables;
  const moneyAccount = resolvePaymentAccount(
    settings,
    params.paymentMethod === "CASH" ? "CASH" : "BANK",
  );

  // Schutz vor der Selbstauflösung "Bank an Bank": tritt auf, wenn ein
  // SKR03-Tenant das Forderungskonto nicht umgestellt hat (SKR04-Default
  // 1200 == SKR03-Bank 1200). Lieber gar nicht buchen als eine wirkungslose
  // Buchung ins Hauptbuch schreiben.
  if (moneyAccount === receivableAccount) {
    logger.error(
      {
        invoiceId: params.invoiceId,
        paymentId: params.paymentId,
        moneyAccount,
        receivableAccount,
        chartOfAccountsVersion: settings.chartOfAccountsVersion,
      },
      "Zahlungsbuchung übersprungen: Geldkonto == Forderungskonto. " +
        "datevAccountBank / datevAccountReceivables in den Mandanten-Einstellungen korrigieren.",
    );
    return { journalEntryId: null, skippedReason: "ACCOUNT_COLLISION" };
  }

  // Richtung aus der Ursprungsbuchung ableiten. orderBy createdAt asc, damit
  // bei mehreren AUTO-Buchungen zum Beleg die ERSTE (die Umsatzbuchung)
  // gewinnt und nicht z.B. eine spätere §17-Korrektur.
  const original = await tx.journalEntry.findFirst({
    where: {
      tenantId: params.tenantId,
      referenceType: "Invoice",
      referenceId: params.invoiceId,
      source: "AUTO",
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: {
      lines: { select: { account: true, debitAmount: true, creditAmount: true } },
    },
  });

  const receivableLine = original?.lines.find((l) => l.account === receivableAccount);
  // Default (auch ohne Ursprungsbuchung): Ausgangsrechnung → Geld kommt rein.
  const moneyIsDebit = receivableLine ? receivableLine.debitAmount !== null : true;

  if (!original) {
    logger.warn(
      { invoiceId: params.invoiceId, paymentId: params.paymentId },
      "Zahlungsbuchung ohne Ursprungsbuchung — Richtung auf Ausgangsrechnung (Bank im Soll) angenommen",
    );
  }

  const desc = `Zahlung ${params.reference ?? params.invoiceId}`.slice(0, 200);
  const entry = await tx.journalEntry.create({
    data: {
      tenantId: params.tenantId,
      entryDate: params.bookingDate,
      description: desc,
      reference: params.reference ?? null,
      status: "POSTED",
      source: "AUTO",
      referenceType: "InvoicePayment",
      referenceId: params.paymentId,
      createdById: params.userId,
      lines: {
        create: [
          {
            lineNumber: 1,
            account: moneyIsDebit ? moneyAccount : receivableAccount,
            description: desc,
            debitAmount: params.amount,
            creditAmount: null,
          },
          {
            lineNumber: 2,
            account: moneyIsDebit ? receivableAccount : moneyAccount,
            description: desc,
            debitAmount: null,
            creditAmount: params.amount,
          },
        ],
      },
    },
    select: { id: true },
  });

  logger.info(
    {
      invoiceId: params.invoiceId,
      paymentId: params.paymentId,
      journalEntryId: entry.id,
      debitAccount: moneyIsDebit ? moneyAccount : receivableAccount,
      creditAccount: moneyIsDebit ? receivableAccount : moneyAccount,
      amount: params.amount.toString(),
    },
    "Zahlungsbuchung erstellt",
  );

  return { journalEntryId: entry.id };
}

/**
 * Reverse an auto-posting (e.g., when invoice is cancelled).
 * Creates a reversal entry (Storno) rather than deleting the original.
 */
export async function reverseAutoPosting(
  invoiceId: string,
  userId: string,
  tenantId: string
): Promise<AutoPostingResult> {
  try {
    // M-9 Perf: original + existingReversal parallel (waren 2 sequenzielle Queries)
    const [original, existingReversal] = await Promise.all([
      prisma.journalEntry.findFirst({
        where: {
          tenantId,
          referenceType: "Invoice",
          referenceId: invoiceId,
          source: "AUTO",
          deletedAt: null,
        },
        include: { lines: true },
      }),
      prisma.journalEntry.findFirst({
        where: {
          tenantId,
          referenceType: "InvoiceReversal",
          referenceId: invoiceId,
          source: "AUTO",
        },
      }),
    ]);

    if (!original) {
      return { success: true }; // Nothing to reverse
    }

    if (existingReversal) {
      return { success: true, journalEntryId: existingReversal.id };
    }

    // Create reversal: swap debit/credit
    const reversalLines = original.lines.map((line, idx) => ({
      lineNumber: idx + 1,
      account: line.account,
      // Randfall 6: ungeslict. Eine Original-Zeile mit 200 Zeichen sprengte
      // durch das "Storno: "-Präfix die VarChar(200) → Generalumkehr unmöglich.
      description: clampDescription(`Storno: ${line.description || ""}`),
      debitAmount: line.creditAmount,
      creditAmount: line.debitAmount,
      costCenter: line.costCenter,
    }));

    // P9: Storno bucht in den AKTUELLEN Monat (new Date()), nicht in die
    // Original-Periode. Wenn auch der aktuelle Monat gesperrt ist (Jahresende
    // im neuen Jahr), kann das Storno nicht laufen → Caller bekommt Fehler.
    const reversalDate = new Date();
    try {
      await assertPeriodOpen(original.tenantId, reversalDate);
    } catch (err) {
      if (err instanceof PeriodLockedError) {
        return {
          success: false,
          error: err.message,
          periodLocked: { year: err.periodYear, month: err.periodMonth },
        };
      }
      throw err;
    }

    const reversal = await prisma.journalEntry.create({
      data: {
        tenantId: original.tenantId,
        entryDate: reversalDate,
        description: `Storno: ${original.description}`.slice(0, 200),
        // Randfall 6: reference ist VarChar(100) — ebenfalls ungeslict.
        reference: clampReference(`ST-${original.reference || ""}`),
        status: "POSTED",
        source: "AUTO",
        referenceType: "InvoiceReversal",
        referenceId: invoiceId,
        createdById: userId,
        lines: {
          create: reversalLines,
        },
      },
    });

    logger.info(
      { invoiceId, journalEntryId: reversal.id },
      "Auto-posting reversal created"
    );

    // Reports-Cache invalidieren — Storno ändert Saldi genauso wie
    // die Original-Buchung. Fire-and-forget, damit Caller nicht blockt.
    invalidateReportsCache(original.tenantId).catch((err) => {
      logger.warn(
        { err, invoiceId },
        "[Reports-Cache] Invalidation failed after auto-posting reverse",
      );
    });

    return { success: true, journalEntryId: reversal.id };
  } catch (error) {
    logger.error({ err: error, invoiceId }, "Auto-posting reversal failed");
    return { success: false, error: String(error) };
  }
}
