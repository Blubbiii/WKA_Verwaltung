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
  revertPaymentsForBankTransaction,
  OverpaymentError,
  InvoiceNotPayableError,
} from "@/lib/accounting/invoice-payment";
import { PeriodLockedError } from "@/lib/accounting/period-lock";
import { invalidateReportsCache } from "@/lib/cache/reports";

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

      let postedJournalEntry = false;
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
          // Status (PARTIALLY_PAID / PAID) korrekt UND erzeugt seit Fix 1.1
          // die Zahlungsbuchung (Bank an Forderung) in derselben Transaktion.
          // Bei negativem Bank-TX (z.B. Rücklastschrift) überspringen wir die
          // Zahlung.
          if (amountDec.greaterThan(0)) {
            const paymentResult = await recordPayment(tx, {
              tenantId: check.tenantId!,
              invoiceId,
              amount: amountDec.toNumber(),
              paymentDate: bt.bookingDate,
              paymentMethod: "BANK",
              bankTransactionId: bt.id,
              userId: check.userId!,
              notes: `Bank-Match ${bt.bankReference ?? bt.id}`,
            });
            postedJournalEntry = paymentResult.journalEntryId !== null;
          }

          // GoBD: matchSource=MANUAL + matchedBy/At dokumentieren die
          // User-Zuordnung.
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

        // Zahlungsbuchung ist POSTED → Report-Saldi neu berechnen lassen.
        if (postedJournalEntry) {
          invalidateReportsCache(check.tenantId!).catch((e) => {
            logger.warn(
              { err: e, bankTxId: id },
              "[Reports-Cache] Invalidation failed after bank match posting",
            );
          });
        }

        return NextResponse.json({ data: result });
      } catch (err) {
        if (err instanceof PeriodLockedError) {
          // F7-Compliance: Bank-Buchungsdatum in gesperrter Periode → 409.
          return apiError("PERIOD_LOCKED", 409, {
            message: err.message,
            details: { periodYear: err.periodYear, periodMonth: err.periodMonth },
          });
        }
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

    // ignore / unmatch: Status-Änderung auf der Bank-Zeile — beim `unmatch`
    // PLUS vollständige Rückabwicklung der daraus entstandenen Zahlung.
    //
    // Vorher wurde nur matchStatus/matchedInvoiceId zurückgesetzt. InvoicePayment,
    // Invoice.paidAmount und Invoice.status blieben stehen, sodass sich dieselbe
    // Bank-Zeile auf eine zweite Rechnung matchen ließ — ein Geldeingang tilgte
    // zwei Forderungen, ohne Korrekturmöglichkeit über die UI.
    const bt = await prisma.bankTransaction.findFirst({
      where: { id, tenantId: check.tenantId! },
      select: { id: true, bankReference: true },
    });
    if (!bt) {
      return apiError("NOT_FOUND", 404, { message: "Transaktion nicht gefunden" });
    }

    const updateData: Record<string, unknown> =
      action === "ignore"
        ? { matchStatus: "IGNORED", matchedInvoiceId: null, matchConfidence: null }
        : { matchStatus: "UNMATCHED", matchedInvoiceId: null, matchConfidence: null };

    try {
      const { updated, reverted } = await prisma.$transaction(async (tx) => {
        let reverted = null as Awaited<
          ReturnType<typeof revertPaymentsForBankTransaction>
        > | null;

        if (action === "unmatch") {
          reverted = await revertPaymentsForBankTransaction(tx, {
            tenantId: check.tenantId!,
            bankTransactionId: id,
            userId: check.userId!,
            reason: `Bank-Match aufgehoben (${bt.bankReference ?? id})`,
          });

          // GoBD: die gelöschten Nebenbuch-Zeilen bleiben über den AuditLog
          // nachvollziehbar (InvoicePayment hat kein deletedAt-Feld).
          if (reverted.revertedCount > 0) {
            await tx.auditLog.create({
              data: {
                action: "DELETE",
                entityType: "BankTransaction",
                entityId: id,
                oldValues: {
                  revertedPayments: reverted.revertedCount,
                  invoices: reverted.invoices,
                },
                newValues: {
                  reversalJournalEntryIds: reverted.reversalJournalEntryIds,
                  _description: "Zahlungen durch Unmatch zurückgerollt",
                },
                tenantId: check.tenantId!,
                userId: check.userId ?? null,
              },
            });
          }
        }

        const updated = await tx.bankTransaction.update({
          where: { id, tenantId: check.tenantId! },
          data: {
            ...updateData,
            // Match-Diagnostik gehört zum aufgehobenen Match.
            ...(action === "unmatch"
              ? { matchedSkontoAmount: null, matchVariance: null }
              : {}),
          },
        });

        return { updated, reverted };
      });

      if (reverted && reverted.reversalJournalEntryIds.length > 0) {
        logger.info(
          {
            bankTxId: id,
            revertedPayments: reverted.revertedCount,
            reversals: reverted.reversalJournalEntryIds.length,
          },
          "Bank-Unmatch: Zahlungen zurückgerollt",
        );
        invalidateReportsCache(check.tenantId!).catch((e) => {
          logger.warn(
            { err: e, bankTxId: id },
            "[Reports-Cache] Invalidation failed after unmatch reversal",
          );
        });
      }

      return NextResponse.json({
        data: updated,
        revertedPayments: reverted?.revertedCount ?? 0,
      });
    } catch (err) {
      if (err instanceof PeriodLockedError) {
        // Der Storno der Zahlungsbuchung landet im AKTUELLEN Monat. Ist der
        // gesperrt, kann nicht zurückgerollt werden.
        return apiError("PERIOD_LOCKED", 409, {
          message: err.message,
          details: { periodYear: err.periodYear, periodMonth: err.periodMonth },
        });
      }
      throw err;
    }
  } catch (error) {
    return handleApiError(error, "Fehler beim Aktualisieren der Banktransaktion");
  }
}
