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
  journalEntryId?: string | null;
  notes?: string;
  userId: string;
}

export interface RecordPaymentResult {
  paymentId: string;
  newPaidAmount: number;
  newStatus: "SENT" | "PARTIALLY_PAID" | "PAID";
  isFullyPaid: boolean;
}

/**
 * Erzeugt eine InvoicePayment-Row und aktualisiert die Invoice atomar.
 * Caller MUSS in einer Transaktion laufen.
 */
export async function recordPayment(
  tx: TxClient,
  params: RecordPaymentParams,
): Promise<RecordPaymentResult> {
  if (params.amount <= 0) {
    throw new Error("Zahlbetrag muss > 0 sein");
  }

  const invoice = await tx.invoice.findUnique({
    where: { id: params.invoiceId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      grossAmount: true,
      paidAmount: true,
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

  const grossAmount = Number(invoice.grossAmount);
  const paidBefore = Number(invoice.paidAmount);
  const newPaid = roundCent(paidBefore + params.amount);

  if (newPaid > grossAmount + 0.005) {
    throw new OverpaymentError(grossAmount, newPaid);
  }

  const isFullyPaid = newPaid >= grossAmount - 0.005;
  const newStatus: "SENT" | "PARTIALLY_PAID" | "PAID" = isFullyPaid
    ? "PAID"
    : "PARTIALLY_PAID";

  const payment = await tx.invoicePayment.create({
    data: {
      tenantId: params.tenantId,
      invoiceId: params.invoiceId,
      paymentDate: params.paymentDate,
      amount: new Decimal(params.amount),
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
      paidAmount: new Decimal(newPaid),
      status: newStatus,
      paidAt: isFullyPaid ? params.paymentDate : null,
    },
  });

  return {
    paymentId: payment.id,
    newPaidAmount: newPaid,
    newStatus,
    isFullyPaid,
  };
}

function roundCent(v: number): number {
  return Math.round(v * 100) / 100;
}
