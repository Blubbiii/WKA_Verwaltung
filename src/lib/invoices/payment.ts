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
import { assertPeriodOpen } from "@/lib/validation/period-lock";

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
  /**
   * Vereinbarte Entgeltminderung, die NICHT als Geld fliesst — praktisch immer
   * Skonto.
   *
   * Sie zaehlt fuer die Frage „ist die Rechnung beglichen?" wie gezahltes
   * Geld. Ohne sie blieb eine korrekt mit Skonto bezahlte Rechnung auf
   * PARTIALLY_PAID stehen, waehrend die Oberflaeche „vollstaendig bezahlt"
   * meldete — und der Mahnlauf sucht seine Kandidaten genau nach diesem
   * Status. Der Kunde zahlte richtig und bekam eine Mahnung.
   */
  minderung?: number;
  paymentDate: Date;
  paymentMethod?: InvoicePaymentMethod;
  bankTransactionId?: string | null;
  /**
   * Vorab erzeugte Buchung. Wenn gesetzt, wird sie nur verlinkt und KEINE
   * automatische Zahlungsbuchung erzeugt (Caller hat selbst gebucht).
   */
  journalEntryId?: string | null;
  notes?: string;
  userId: string;
}

export interface RecordPaymentResult {
  paymentId: string;
  newPaidAmount: number;
  newStatus: "SENT" | "PARTIALLY_PAID" | "PAID";
  isFullyPaid: boolean;
  /**
   * Immer `null` bei neuen Zahlungen.
   *
   * Das Feld gab es, solange die Buchhaltung im Haus lag: hier stand die ID
   * der Zahlungsbuchung. Die Spalte bleibt, weil Altzahlungen sie gefuellt
   * haben — vergeben wird sie nicht mehr.
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
  /*
    Die Minderung senkt die Obergrenze mit: wer nach Skonto den vollen
    Bruttobetrag ueberweist, hat zu viel gezahlt — und das soll auffallen.
  */
  const minderungDec = new Decimal(params.minderung ?? 0);
  const upperLimit = grossAmount
    .plus(toleranceDec)
    .plus(dunningExtras)
    .minus(minderungDec);

  if (newPaidDec.greaterThan(upperLimit)) {
    throw new OverpaymentError(grossAmount.toNumber(), newPaidDec.toNumber());
  }

  // Gezahltes Geld PLUS vereinbarte Minderung gegen den Bruttobetrag.
  const isFullyPaid = newPaidDec
    .plus(minderungDec)
    .greaterThanOrEqualTo(grossAmount.minus(toleranceDec));
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

  /*
    Hier stand die Verbuchung der Zahlung auf Forderungs- und Geldkonto.

    Sie ist mit dem Buchhaltungsmodul entfallen: die Buecher fuehrt der
    Steuerberater in DATEV, wir liefern ihm die Belege. Was bleibt, ist die
    OP-Sicht — welche Rechnung ist zu welchem Teil bezahlt. Genau die braucht
    das Mahnwesen, und genau die stand auch vorher schon hier; die Buchung war
    das Zusaetzliche.

    `journalEntryId` bleibt als Feld erhalten, weil die Spalte in der Datenbank
    steht und alte Zahlungen sie gefuellt haben. Neue Zahlungen setzen sie
    nicht mehr.
  */
  return {
    paymentId: payment.id,
    newPaidAmount: newPaidDec.toNumber(),
    newStatus,
    isFullyPaid,
    journalEntryId: params.journalEntryId ?? null,
  };
}
