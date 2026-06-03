/**
 * POST /api/buchhaltung/year-end-close
 *
 * Orchestriert den Jahresabschluss:
 *   1. Bilanz zum 31.12. rechnen
 *   2. Bilanz-Snapshot speichern
 *   3. Saldenvortrag in OpeningBalance des Folgejahres schreiben
 *
 * Body: { fiscalYear: number, allowUnbalanced?: boolean }
 *
 * Bei nicht-ausgeglichener Bilanz wirft die Engine BilanzNotBalancedError →
 * 409 mit Details. Mit allowUnbalanced=true kann der Admin das überschreiben
 * (z.B. um eine geplante Korrekturbuchung später nachzubuchen).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { requireAdmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  BilanzNotBalancedError,
  OpeningBalanceAlreadyExistsError,
  carryForward,
} from "@/lib/accounting/year-end-close";
import { invalidateReportsCache } from "@/lib/cache/reports";

const closeSchema = z.object({
  fiscalYear: z.number().int().min(2000).max(2100),
  allowUnbalanced: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const body = await request.json();
    const parsed = closeSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message || "Ungültige Eingabe",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      return carryForward(tx, {
        tenantId: check.tenantId!,
        fiscalYear: parsed.data.fiscalYear,
        userId: check.userId!,
        allowUnbalanced: parsed.data.allowUnbalanced ?? false,
      });
    });

    // K-1: Reports-Cache invalidieren — Saldenvortrag ändert Bilanz/SuSa Folgejahr.
    invalidateReportsCache(check.tenantId!).catch((err) => {
      logger.warn({ err }, "[Reports-Cache] Invalidation nach Year-End-Close fehlgeschlagen");
    });

    logger.info(
      {
        tenantId: check.tenantId,
        userId: check.userId,
        fiscalYear: parsed.data.fiscalYear,
        carryForwardCount: result.carryForwardCount,
      },
      "Year-end close completed",
    );

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof BilanzNotBalancedError) {
      return apiError("CONFLICT", 409, {
        message: error.message,
        details: {
          summeAktiva: error.summeAktiva,
          summePassiva: error.summePassiva,
          differenz: error.differenz,
        },
      });
    }
    if (error instanceof OpeningBalanceAlreadyExistsError) {
      return apiError("ALREADY_EXISTS", 409, {
        message: error.message,
        details: { fiscalYear: error.fiscalYear },
      });
    }
    logger.error({ err: error }, "Year-end close failed");
    return apiError("PROCESS_FAILED", 500, {
      message: "Fehler beim Jahresabschluss",
    });
  }
}
