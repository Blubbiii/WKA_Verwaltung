/**
 * POST /api/invoices/[id]/write-off — Wertberichtigung / Forderungsausfall (P16, D4/D5).
 *
 * Body: { type: 'EWB' | 'PWB' | 'DIRECT_WRITEOFF', amount, reason, effectiveDate?, createUStAdjustment? }
 *
 * DIRECT_WRITEOFF: setzt Invoice-Status auf WRITTEN_OFF + (optional) §17-USt-Korrektur.
 * EWB/PWB: nur ValueAdjustment-Eintrag, Status bleibt.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ValueAdjustmentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import {
  InvoiceNotWriteOffableError,
  writeOffReceivable,
} from "@/lib/accounting/write-off";
import { PeriodLockedError } from "@/lib/accounting/period-lock";
import { invalidateReportsCache } from "@/lib/cache/reports";

const schema = z.object({
  type: z.enum(ValueAdjustmentType),
  amount: z.number().positive(),
  reason: z.string().min(3).max(500),
  effectiveDate: z.iso.datetime().optional(),
  createUStAdjustment: z.boolean().optional(),
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
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message || "Ungültige Eingabe",
      });
    }

    const effectiveDate = parsed.data.effectiveDate
      ? new Date(parsed.data.effectiveDate)
      : new Date();

    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        return writeOffReceivable(tx, {
          tenantId: check.tenantId!,
          invoiceId: id,
          type: parsed.data.type,
          amount: parsed.data.amount,
          reason: parsed.data.reason,
          effectiveDate,
          userId: check.userId!,
          createUStAdjustment: parsed.data.createUStAdjustment,
        });
      });
    } catch (err) {
      if (err instanceof PeriodLockedError) {
        return apiError("PERIOD_LOCKED", 409, {
          message: err.message,
          details: { periodYear: err.periodYear, periodMonth: err.periodMonth },
        });
      }
      if (err instanceof InvoiceNotWriteOffableError) {
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
        valueAdjustmentId: result.valueAdjustmentId,
        type: parsed.data.type,
        amount: parsed.data.amount,
      },
      "Value adjustment posted",
    );

    // K-1-Fix: Bei DIRECT_WRITEOFF wurde optional eine §17-USt-Korrekturbuchung
    // (POSTED JournalEntry) erzeugt; zudem ändert die Wertberichtigung selbst
    // (auch EWB/PWB folgend per JournalEntry-Manager) die Saldi. Reports-Cache
    // invalidieren — fire-and-forget.
    if (result.ustAdjustmentId || parsed.data.type === ValueAdjustmentType.DIRECT_WRITEOFF) {
      invalidateReportsCache(check.tenantId!).catch((err) => {
        logger.warn(
          { err, invoiceId: id },
          "[Reports-Cache] Invalidation failed after write-off",
        );
      });
    }

    return NextResponse.json({ data: serializePrisma(result) }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Error writing off receivable");
    return apiError("PROCESS_FAILED", 500, {
      message: "Fehler bei der Forderungsabschreibung",
    });
  }
}
