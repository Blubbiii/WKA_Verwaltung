/**
 * POST /api/invoices/[id]/payments — Teilzahlung erfassen (P16, D1).
 *
 * Body: { amount, paymentDate?, paymentMethod?, bankTransactionId?, notes? }
 *
 * Erzeugt eine InvoicePayment-Row in Transaktion mit Invoice-Update
 * (paidAmount + status PARTIALLY_PAID/PAID).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import {
  InvoiceNotPayableError,
  OverpaymentError,
  recordPayment,
} from "@/lib/accounting/invoice-payment";
import { PeriodLockedError } from "@/lib/accounting/period-lock";

const paymentSchema = z.object({
  amount: z.number().positive(),
  // F7-Compliance: paymentDate darf nicht in der Zukunft liegen (kein "Vorbuchen").
  paymentDate: z
    .iso.datetime()
    .optional()
    .refine((v) => !v || new Date(v).getTime() <= Date.now(), {
      message: "Zahlungsdatum darf nicht in der Zukunft liegen",
    }),
  paymentMethod: z.enum(["BANK", "CASH", "SEPA", "OTHER"]).optional(),
  bankTransactionId: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = paymentSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message || "Ungültige Eingabe",
      });
    }

    const paymentDate = parsed.data.paymentDate
      ? new Date(parsed.data.paymentDate)
      : new Date();

    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        return recordPayment(tx, {
          tenantId: check.tenantId!,
          invoiceId: id,
          amount: parsed.data.amount,
          paymentDate,
          paymentMethod: parsed.data.paymentMethod,
          bankTransactionId: parsed.data.bankTransactionId,
          notes: parsed.data.notes,
          userId: check.userId!,
        });
      });
    } catch (err) {
      if (err instanceof PeriodLockedError) {
        // F7-Compliance: Zahlungsdatum in gesperrter Periode → 409, kein 500.
        return apiError("PERIOD_LOCKED", 409, {
          message: err.message,
          details: { periodYear: err.periodYear, periodMonth: err.periodMonth },
        });
      }
      if (err instanceof OverpaymentError) {
        return apiError("CONFLICT", 409, {
          message: err.message,
          details: { grossAmount: err.grossAmount, paidAfter: err.paidAfter },
        });
      }
      if (err instanceof InvoiceNotPayableError) {
        return apiError("CONFLICT", 409, {
          message: err.message,
          details: { status: err.status },
        });
      }
      if (err instanceof Error) {
        if (err.name === "EntityNotFoundError") {
          return apiError("NOT_FOUND", 404, { message: err.message });
        }
        if (err.name === "TenantMismatchError") {
          return apiError("TENANT_MISMATCH", 403, { message: err.message });
        }
      }
      throw err;
    }

    logger.info(
      {
        tenantId: check.tenantId,
        invoiceId: id,
        paymentId: result.paymentId,
        amount: parsed.data.amount,
        newStatus: result.newStatus,
      },
      "Invoice payment recorded",
    );

    return NextResponse.json({ data: serializePrisma(result) }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error recording invoice payment");
    return apiError("PROCESS_FAILED", 500, {
      message: "Fehler bei der Zahlungserfassung",
    });
  }
}
