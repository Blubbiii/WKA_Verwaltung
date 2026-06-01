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
import { ValueAdjustmentType } from "@prisma/client";
import type { TxClient } from "@/lib/invoices/numberGenerator";
import { createUStAdjustment } from "./ust-adjustment";
import { getTenantSettings } from "@/lib/tenant-settings";

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
  newInvoiceStatus: "WRITTEN_OFF" | "SENT" | "PARTIALLY_PAID" | "PAID";
}

export class InvoiceNotWriteOffableError extends Error {
  constructor(public readonly status: string) {
    super(`Rechnung im Status "${status}" kann nicht abgeschrieben werden`);
    this.name = "InvoiceNotWriteOffableError";
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

  if (
    invoice.status === "DRAFT" ||
    invoice.status === "CANCELLED" ||
    invoice.status === "WRITTEN_OFF"
  ) {
    throw new InvoiceNotWriteOffableError(invoice.status);
  }

  // §17 USt-Korrektur bei DIRECT_WRITEOFF (wenn TaxCode + nicht Kleinunternehmer
  // + explizit angefordert). EWB/PWB lassen USt unberührt.
  let ustAdjustmentId: string | null = null;
  if (
    params.type === ValueAdjustmentType.DIRECT_WRITEOFF &&
    params.createUStAdjustment !== false &&
    invoice.taxCodeId
  ) {
    const settings = await getTenantSettings(params.tenantId);
    if (!settings.kleinunternehmer) {
      const result = await createUStAdjustment(tx, {
        tenantId: params.tenantId,
        originalInvoiceId: params.invoiceId,
        reason: "WRITE_OFF",
        adjustmentDate: params.effectiveDate,
        grossDelta: -params.amount,
        userId: params.userId,
        revenueAccount: settings.datevAccountEinspeisung,
        counterAccount: settings.datevAccountReceivables,
        notes: `Forderungsausfall: ${params.reason}`,
      });
      ustAdjustmentId = result.adjustmentId;
    }
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
    newInvoiceStatus,
  };
}
