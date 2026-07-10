import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client-runtime-utils";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { handleApiError } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import {
  recordPayment,
  OverpaymentError,
  InvoiceNotPayableError,
} from "@/lib/accounting/invoice-payment";

const matchSchema = z.object({
  action: z.enum(["match", "ignore", "unmatch"]),
  invoiceId: z.uuid().optional(),
});

// PATCH /api/buchhaltung/bank/transactions/[id] — Match/Ignore/Unmatch
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("accounting:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const { action, invoiceId } = matchSchema.parse(body);

    // Match: alles in EINER Transaktion — Bank-TX Update + InvoicePayment
    // + Invoice-Status (via recordPayment). Verhindert dass eine
    // MATCHED-Bank-TX ohne dazugehörigen InvoicePayment-Row entsteht.
    if (action === "match") {
      if (!invoiceId) {
        return apiError("BAD_REQUEST", 400, { message: "invoiceId erforderlich" });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          const bt = await tx.bankTransaction.findFirst({
            where: { id, tenantId: check.tenantId! },
          });
          if (!bt) {
            const err = new Error("Transaktion nicht gefunden");
            err.name = "EntityNotFoundError";
            throw err;
          }
          const invoice = await tx.invoice.findFirst({
            where: { id: invoiceId, tenantId: check.tenantId! },
            select: {
              id: true,
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

          // Betragsvergleich zur Diagnose. Wir markieren trotzdem als MATCHED,
          // aber loggen die Abweichung — Über-/Unterzahlung wird von
          // recordPayment als PARTIALLY_PAID abgebildet, kein Silent-PAID.
          const grossDec = new Decimal(invoice.grossAmount);
          const paidBefore = new Decimal(invoice.paidAmount ?? 0);
          const amountDec = new Decimal(bt.amount);
          const remainingDec = grossDec.minus(paidBefore);
          if (!amountDec.equals(remainingDec)) {
            logger.warn(
              {
                bankTxId: bt.id,
                invoiceId,
                invoiceRemaining: remainingDec.toString(),
                bankAmount: amountDec.toString(),
              },
              "Payment amount mismatch — Bank-TX vs. offener Rechnungsbetrag",
            );
          }

          // recordPayment schreibt InvoicePayment + setzt paidAmount +
          // Status (PARTIALLY_PAID / PAID) korrekt. Bei negativem Bank-TX
          // (z.B. Rücklastschrift) überspringen wir die Zahlung.
          if (amountDec.greaterThan(0)) {
            await recordPayment(tx, {
              tenantId: check.tenantId!,
              invoiceId,
              amount: amountDec.toNumber(),
              paymentDate: bt.bookingDate,
              paymentMethod: "BANK",
              bankTransactionId: bt.id,
              userId: check.userId!,
              notes: `Bank-Match ${bt.bankReference ?? bt.id}`,
            });
          }

          // GoBD: matchSource=MANUAL + matchedBy/At dokumentieren die
          // User-Zuordnung. TODO: Auto-Journal (Bank an Forderung) via
          // separatem Buchungs-Service — recordPayment schreibt bereits die
          // InvoicePayment-Row; die Bank-Konto-Gegenbuchung folgt beim
          // nächsten Auto-Posting-Lauf.
          const updated = await tx.bankTransaction.update({
            where: { id, tenantId: check.tenantId! },
            data: {
              matchStatus: "MATCHED",
              matchedInvoiceId: invoiceId,
              matchConfidence: 1.0,
              matchSource: "MANUAL",
              matchedById: check.userId!,
              matchedAt: new Date(),
            },
          });

          return updated;
        });

        return NextResponse.json({ data: result });
      } catch (err) {
        if (err instanceof OverpaymentError) {
          return apiError("BAD_REQUEST", 400, { message: err.message });
        }
        if (err instanceof InvoiceNotPayableError) {
          return apiError("OPERATION_NOT_ALLOWED", 400, { message: err.message });
        }
        if (err instanceof Error && err.name === "EntityNotFoundError") {
          return apiError("NOT_FOUND", 404, { message: err.message });
        }
        throw err;
      }
    }

    // ignore / unmatch: reine Status-Änderung auf Bank-TX. TODO: wenn schon
    // ein InvoicePayment für diesen Bank-TX existiert, bleibt der aktuell
    // stehen. Sauber wäre: bei unmatch InvoicePayment mit dieser
    // bankTransactionId ebenfalls löschen + paidAmount zurückrechnen.
    const bt = await prisma.bankTransaction.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: { id: true },
    });
    if (!bt) {
      return apiError("NOT_FOUND", 404, { message: "Transaktion nicht gefunden" });
    }

    const updateData: Record<string, unknown> =
      action === "ignore"
        ? { matchStatus: "IGNORED", matchedInvoiceId: null, matchConfidence: null }
        : { matchStatus: "UNMATCHED", matchedInvoiceId: null, matchConfidence: null };

    const updated = await prisma.bankTransaction.update({
      where: { id, tenantId: check.tenantId! },
      data: updateData,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error, "Fehler beim Aktualisieren der Banktransaktion");
  }
}
