/**
 * Teilzahlungs-Verwaltung (Phase 16, D1).
 *
 * Vorher: Invoice hatte nur boolean status=PAID. Eine 800€-Zahlung auf
 * eine 1.000€-Rechnung verschwand entweder ganz oder galt fälschlich als
 * voll bezahlt. Jetzt protokollieren wir jede Zahlung als InvoicePayment
 * und aktualisieren Invoice.paidAmount + Invoice.status atomar.
 *
 * Status-Übergänge:
 *   SENT       → paidAmount > 0 && paidAmount < grossAmount → PARTIALLY_PAID
 *   PARTIALLY_PAID → paidAmount >= grossAmount → PAID
 *
 * Bei Überzahlung (paidAmount > grossAmount) wirft die Funktion einen
 * Error — der Caller sollte das als Geschäftsvorgang separat behandeln
 * (z.B. Gutschrift oder Rückzahlung).
 */

import { InvoicePaymentMethod } from "@prisma/client";
import { Decimal } from "@prisma/client-runtime-utils";
import type { TxClient } from "@/lib/invoices/numberGenerator";
import { getTenantSettings } from "@/lib/tenant-settings";
import {
  assertPeriodOpen,
  PeriodLockedError,
  reverseJournalEntry,
} from "./period-lock";
import { createPaymentPosting } from "./auto-posting";

export class OverpaymentError extends Error {
  constructor(
    public readonly grossAmount: number,
    public readonly paidAfter: number,
  ) {
    super(
      `Zahlung führt zu Überzahlung: Rechnungsbetrag ${grossAmount.toFixed(2)} € < gezahlt ${paidAfter.toFixed(2)} €. Bitte als separate Gutschrift abwickeln.`,
    );
    this.name = "OverpaymentError";
  }
}

/**
 * Finding 2.2: Summe der zu dieser Rechnung tatsächlich angemahnten
 * Nebenforderungen (Mahngebühren, Verzugszinsen, §288-Abs.-5-Pauschale).
 *
 * Rechenregel:
 *  - Mahngebühren ADDIEREN sich über die Stufen (jede Stufe hat eine eigene
 *    Gebühr, die mit der Mahnung angefallen ist).
 *  - Verzugszinsen tun das NICHT: jede Stufe rechnet die Zinsen erneut ab
 *    Fälligkeit — der höchste Wert ist der aktuelle Anspruch.
 *  - Die 40-€-Pauschale ist einmalig (§288 Abs. 5 BGB) → Maximum.
 *
 * Ergebnis ist eine Obergrenze für zulässige Mehrzahlung, kein gebuchter
 * Forderungsbetrag.
 */
async function sumOpenDunningCharges(
  tx: TxClient,
  invoiceId: string,
): Promise<Decimal> {
  const items = await tx.dunningItem.findMany({
    where: { invoiceId },
    select: {
      feeAmount: true,
      interestAmount: true,
      interestLumpSumEur: true,
    },
  });

  if (items.length === 0) return new Decimal(0);

  let fees = new Decimal(0);
  let maxInterest = new Decimal(0);
  let maxLumpSum = new Decimal(0);

  for (const it of items) {
    fees = fees.plus(new Decimal(it.feeAmount ?? 0));
    const interest = new Decimal(it.interestAmount ?? 0);
    if (interest.greaterThan(maxInterest)) maxInterest = interest;
    const lump = new Decimal(it.interestLumpSumEur ?? 0);
    if (lump.greaterThan(maxLumpSum)) maxLumpSum = lump;
  }

  return fees.plus(maxInterest).plus(maxLumpSum).toDecimalPlaces(2);
}

export class InvoiceNotPayableError extends Error {
  constructor(public readonly status: string) {
    super(`Rechnung im Status "${status}" kann keine Zahlungen entgegennehmen`);
    this.name = "InvoiceNotPayableError";
  }
}

export interface RecordPaymentParams {
  tenantId: string;
  invoiceId: string;
  amount: number;
  paymentDate: Date;
  paymentMethod?: InvoicePaymentMethod;
  bankTransactionId?: string | null;
  /**
   * Vorab erzeugte Buchung. Wenn gesetzt, wird sie nur verlinkt und KEINE
   * automatische Zahlungsbuchung erzeugt (Caller hat selbst gebucht).
   */
  journalEntryId?: string | null;
  /**
   * Setzt die automatische Zahlungsbuchung (Bank an Forderung) aus.
   * Nur für Migrations-/Import-Fälle, in denen die Gegenbuchung bereits
   * anderweitig im Hauptbuch steht.
   */
  skipPosting?: boolean;
  notes?: string;
  userId: string;
}

export interface RecordPaymentResult {
  paymentId: string;
  newPaidAmount: number;
  newStatus: "SENT" | "PARTIALLY_PAID" | "PAID";
  isFullyPaid: boolean;
  /**
   * ID der erzeugten Zahlungsbuchung (Bank an Forderung), oder null wenn
   * keine erzeugt wurde (skipPosting, oder Konto-Konfiguration unbrauchbar).
   * Caller sollten bei != null den Reports-Cache invalidieren.
   */
  journalEntryId: string | null;
}

/**
 * Erzeugt eine InvoicePayment-Row und aktualisiert die Invoice atomar.
 * Caller MUSS in einer Transaktion laufen.
 *
 * Invarianten:
 *  - SELECT ... FOR UPDATE sperrt die Invoice-Row bis Ende der TX → keine
 *    Race-Condition zwischen parallelen recordPayment-Calls.
 *  - Decimal-Arithmetik durchgehend (kein Number() für Beträge).
 */
export async function recordPayment(
  tx: TxClient,
  params: RecordPaymentParams,
): Promise<RecordPaymentResult> {
  if (params.amount <= 0) {
    throw new Error("Zahlbetrag muss > 0 sein");
  }

  // F7-Compliance (GoBD §146 AO): Zahlungen dürfen nicht in einen bereits
  // geschlossenen Buchungsmonat wandern. Sonst könnte man nachträglich Umsätze
  // in eine gesperrte Periode buchen und §146-"Unveränderbarkeit" verletzen.
  // Innerhalb der TX gelesen — kein Race zwischen Lock-Anlage und Buchung.
  await assertPeriodOpen(params.tenantId, params.paymentDate, tx);

  // SELECT FOR UPDATE: blockiert die Row für andere parallele TX bis Commit.
  // Wir nutzen den Lock zuerst, dann die typsichere findUnique darunter.
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "invoices" WHERE id = ${params.invoiceId} FOR UPDATE
  `;
  if (locked.length === 0) {
    const err = new Error("Rechnung nicht gefunden");
    err.name = "EntityNotFoundError";
    throw err;
  }

  const invoice = await tx.invoice.findUnique({
    where: { id: params.invoiceId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      grossAmount: true,
      paidAmount: true,
      invoiceNumber: true,
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

  // DRAFT / CANCELLED / WRITTEN_OFF nehmen keine Zahlungen mehr an.
  if (
    invoice.status === "DRAFT" ||
    invoice.status === "CANCELLED" ||
    invoice.status === "WRITTEN_OFF"
  ) {
    throw new InvoiceNotPayableError(invoice.status);
  }

  const invoiceNumber = invoice.invoiceNumber;

  // Decimal-Arithmetik (kein Number()-Cast für Cent-genaue Berechnung).
  const grossAmount = new Decimal(invoice.grossAmount);
  const paidBefore = new Decimal(invoice.paidAmount);
  const amountDec = new Decimal(params.amount);
  const newPaidDec = paidBefore.plus(amountDec).toDecimalPlaces(2);

  // Toleranz aus TenantSettings (Default 0,02 €).
  const settings = await getTenantSettings(params.tenantId);
  const toleranceDec = new Decimal(settings.bankMatchToleranceEur);

  // Finding 2.2: Mahngebühren, Verzugszinsen und die §288-Abs.-5-Pauschale
  // werden ausschließlich auf DunningItem geführt und erhöhen den
  // Rechnungsbetrag nicht. Zahlte ein Kunde korrekt "Rechnung + Mahngebühr",
  // lag paidAmount über grossAmount und recordPayment lehnte die vollkommen
  // richtige Zahlung mit OverpaymentError ab — sie war schlicht nicht
  // erfassbar.
  //
  // Warum kein eigener Forderungs-Beleg: eine zweite Invoice für die Gebühr
  // bräuchte Nummernkreis, Steuerbehandlung (Mahngebühren sind
  // nicht steuerbarer Schadensersatz, keine Leistung i.S.d. §1 UStG),
  // Auto-Posting-Mapping und Mahn-Ausschluss für sich selbst — das geht
  // ohne Schema- und Prozessänderung nicht sauber. Bis dahin ist die
  // Überzahlungsgrenze um die tatsächlich angemahnten Nebenforderungen zu
  // erweitern die minimale korrekte Lösung: die Zahlung ist erfassbar, ohne
  // dass irgendwo ein Betrag erfunden wird.
  //
  // ACHTUNG: die Nebenforderung wird dadurch NICHT zur gebuchten Forderung.
  // paidAmount kann über grossAmount liegen; die Differenz ist der
  // vereinnahmte Gebühren-/Zinsanteil.
  //
  // F9-Rest (Audit 2026-07): Dieser Anteil musste bisher manuell auf ein
  // Ertragskonto gebucht werden — in der Praxis also nie. Schlimmer: die
  // Zahlungsbuchung lief mit dem VOLLEN Betrag gegen das Forderungskonto, die
  // Forderung wurde damit um die Gebühr überkreditiert. `openInvoiceAmount`
  // unten teilt die Buchung, sofern ein Ertragskonto konfiguriert ist.
  const dunningExtras = await sumOpenDunningCharges(tx, params.invoiceId);
  const upperLimit = grossAmount.plus(toleranceDec).plus(dunningExtras);

  if (newPaidDec.greaterThan(upperLimit)) {
    throw new OverpaymentError(grossAmount.toNumber(), newPaidDec.toNumber());
  }

  const isFullyPaid = newPaidDec.greaterThanOrEqualTo(
    grossAmount.minus(toleranceDec),
  );
  const newStatus: "SENT" | "PARTIALLY_PAID" | "PAID" = isFullyPaid
    ? "PAID"
    : "PARTIALLY_PAID";

  const payment = await tx.invoicePayment.create({
    data: {
      tenantId: params.tenantId,
      invoiceId: params.invoiceId,
      paymentDate: params.paymentDate,
      amount: amountDec,
      paymentMethod: params.paymentMethod ?? "BANK",
      bankTransactionId: params.bankTransactionId ?? null,
      journalEntryId: params.journalEntryId ?? null,
      notes: params.notes ?? null,
      createdById: params.userId,
    },
    select: { id: true },
  });

  await tx.invoice.update({
    where: { id: params.invoiceId },
    data: {
      paidAmount: newPaidDec,
      status: newStatus,
      paidAt: isFullyPaid ? params.paymentDate : null,
    },
  });

  // Finding 1.1: bis hierher war die Zahlung nur im Nebenbuch (InvoicePayment
  // + Invoice.paidAmount) sichtbar. Ohne diese Buchung bleibt das
  // Forderungskonto ewig belastet und das Geldkonto leer — Bilanz/SuSa/BWA
  // driften dauerhaft von der OP-Sicht ab.
  //
  // Es wird ausschließlich `amountDec` gebucht (die tatsächliche Teilzahlung),
  // NICHT der Rechnungsbetrag. Skonto ist hier bewusst nicht enthalten: die
  // Entgeltminderung bucht der Caller separat über createUStAdjustment()
  // (§17 UStG) — sonst würde die Minderung doppelt in der GuV landen.
  let journalEntryId: string | null = params.journalEntryId ?? null;
  if (!journalEntryId && !params.skipPosting) {
    const posting = await createPaymentPosting(tx, {
      tenantId: params.tenantId,
      invoiceId: params.invoiceId,
      paymentId: payment.id,
      amount: amountDec,
      // Buchungsdatum == Zahlungsdatum. Die Periodenprüfung oben lief gegen
      // exakt dieses Datum, die Buchung kann also nicht in einen gesperrten
      // Monat fallen.
      bookingDate: params.paymentDate,
      paymentMethod: params.paymentMethod ?? "BANK",
      userId: params.userId,
      reference: invoiceNumber,
      // F9-Rest: offener Rechnungsbetrag VOR dieser Zahlung. Alles darüber ist
      // Mahngebühr/Verzugszins und gehört nicht aufs Forderungskonto.
      openInvoiceAmount: Decimal.max(grossAmount.minus(paidBefore), 0),
    });
    journalEntryId = posting.journalEntryId;
  }

  if (journalEntryId) {
    await tx.invoicePayment.update({
      where: { id: payment.id },
      data: { journalEntryId },
    });
  }

  return {
    paymentId: payment.id,
    newPaidAmount: newPaidDec.toNumber(),
    newStatus,
    isFullyPaid,
    journalEntryId,
  };
}

// ---------------------------------------------------------------------------
// Rückabwicklung (Finding 1.2)
// ---------------------------------------------------------------------------

export interface RevertPaymentsParams {
  tenantId: string;
  /** Alle Zahlungen zu dieser Bank-Transaktion zurückrollen. */
  bankTransactionId: string;
  userId: string;
  /** Grund für den Storno-Trail. */
  reason: string;
}

export interface RevertPaymentsResult {
  /** Anzahl entfernter InvoicePayment-Zeilen. */
  revertedCount: number;
  /** IDs der erzeugten Storno-Buchungen. */
  reversalJournalEntryIds: string[];
  /** Betroffene Rechnungen mit neuem Stand. */
  invoices: Array<{
    invoiceId: string;
    newPaidAmount: number;
    newStatus: string;
  }>;
}

/**
 * Rollt alle Zahlungen zurück, die an einer Bank-Transaktion hängen.
 *
 * Wird beim `unmatch` gebraucht: vorher wurde nur der Match-Status der
 * Bank-Zeile zurückgesetzt, während InvoicePayment, Invoice.paidAmount und
 * Invoice.status stehen blieben. Dieselbe Bank-Zeile ließ sich danach auf
 * eine zweite Rechnung matchen → ein Geldeingang tilgte zwei Forderungen.
 *
 * Ablauf je Zahlung (alles im übergebenen `tx`):
 *  1. Zahlungsbuchung per Generalumkehr stornieren (GoBD §146 Abs. 4 —
 *     das Original bleibt stehen, es entsteht eine Spiegelbuchung im
 *     AKTUELLEN Monat). Periodensperre gilt für den Storno-Monat.
 *  2. InvoicePayment-Zeile entfernen (Nebenbuch; der Beleg-Trail bleibt über
 *     die Storno-Buchung und den AuditLog-Eintrag des Callers erhalten —
 *     das Modell hat kein `deletedAt`, ein Schema-Change wäre nötig).
 *  3. Invoice.paidAmount aus den VERBLIEBENEN Zahlungen neu summieren und
 *     den Status daraus ableiten.
 *
 * Status-Ableitung: nur PAID/PARTIALLY_PAID werden zurückgesetzt. Eine
 * inzwischen stornierte oder ausgebuchte Rechnung (CANCELLED/WRITTEN_OFF)
 * behält ihren Status — dort ist die Zahlungshistorie nicht mehr die
 * bestimmende Größe.
 *
 * @throws PeriodLockedError wenn der aktuelle Monat gesperrt ist.
 */
export async function revertPaymentsForBankTransaction(
  tx: TxClient,
  params: RevertPaymentsParams,
): Promise<RevertPaymentsResult> {
  const payments = await tx.invoicePayment.findMany({
    where: {
      tenantId: params.tenantId,
      bankTransactionId: params.bankTransactionId,
    },
    select: { id: true, invoiceId: true, amount: true, journalEntryId: true },
  });

  if (payments.length === 0) {
    return { revertedCount: 0, reversalJournalEntryIds: [], invoices: [] };
  }

  const reversalJournalEntryIds: string[] = [];

  for (const p of payments) {
    if (p.journalEntryId) {
      try {
        const { reversalId } = await reverseJournalEntry(tx, {
          tenantId: params.tenantId,
          originalEntryId: p.journalEntryId,
          userId: params.userId,
          reason: params.reason,
        });
        reversalJournalEntryIds.push(reversalId);
      } catch (err) {
        // Bereits storniert / DRAFT / nicht gefunden → kein Grund, die
        // Rückabwicklung des Nebenbuchs zu blockieren. Periodensperre schon.
        if (err instanceof PeriodLockedError) throw err;
        const name = err instanceof Error ? err.name : "";
        if (
          name !== "AlreadyReversedError" &&
          name !== "EntityNotFoundError" &&
          name !== "InvalidStateError"
        ) {
          throw err;
        }
      }
    }
  }

  await tx.invoicePayment.deleteMany({
    where: {
      tenantId: params.tenantId,
      bankTransactionId: params.bankTransactionId,
    },
  });

  // paidAmount je betroffener Rechnung aus den VERBLIEBENEN Zahlungen neu
  // bilden (nicht subtrahieren — Neuberechnung ist gegen Drift immun).
  const settings = await getTenantSettings(params.tenantId);
  const toleranceDec = new Decimal(settings.bankMatchToleranceEur);
  const affectedInvoiceIds = [...new Set(payments.map((p) => p.invoiceId))];
  const invoices: RevertPaymentsResult["invoices"] = [];

  for (const invoiceId of affectedInvoiceIds) {
    const remaining = await tx.invoicePayment.findMany({
      where: { tenantId: params.tenantId, invoiceId },
      select: { amount: true, paymentDate: true },
    });

    const newPaid = remaining
      .reduce((sum, r) => sum.plus(new Decimal(r.amount)), new Decimal(0))
      .toDecimalPlaces(2);

    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { status: true, grossAmount: true },
    });
    if (!invoice) continue;

    const gross = new Decimal(invoice.grossAmount);
    const stillFullyPaid =
      newPaid.greaterThan(0) &&
      newPaid.greaterThanOrEqualTo(gross.minus(toleranceDec));

    // Nur zahlungsgetriebene Status anfassen.
    const statusIsPaymentDriven =
      invoice.status === "PAID" || invoice.status === "PARTIALLY_PAID";
    const newStatus = !statusIsPaymentDriven
      ? invoice.status
      : stillFullyPaid
        ? "PAID"
        : newPaid.greaterThan(0)
          ? "PARTIALLY_PAID"
          : "SENT";

    const latestPaymentDate = remaining.reduce<Date | null>(
      (acc, r) => (acc === null || r.paymentDate > acc ? r.paymentDate : acc),
      null,
    );

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount: newPaid,
        status: newStatus,
        paidAt: stillFullyPaid ? latestPaymentDate : null,
      },
    });

    invoices.push({
      invoiceId,
      newPaidAmount: newPaid.toNumber(),
      newStatus,
    });
  }

  return {
    revertedCount: payments.length,
    reversalJournalEntryIds,
    invoices,
  };
}
