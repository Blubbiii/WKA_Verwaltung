/**
 * Periodensperre — Lock-Verwaltung (Phase 9, GoBD §146 AO).
 *
 * GET  /api/buchhaltung/period-locks       — Liste aller Locks des Mandanten
 * POST /api/buchhaltung/period-locks       — Periode sperren (Admin)
 *
 * Lock ist idempotent über UNIQUE(tenantId, periodYear, periodMonth) —
 * doppeltes Locken desselben Monats wirft 409 ALREADY_EXISTS.
 *
 * Re-Lock einer zuvor entsperrten Periode: aktuell nicht via POST möglich
 * (der UNIQUE-Index findet den alten Record). Stattdessen: alten Record
 * löschen ODER ein neues Lock-Konzept einführen. Für P9 belassen wir die
 * einfache Variante — Unlock soll selten sein und benötigt Audit.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const createSchema = z.object({
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12),
  reason: z.string().max(500).optional(),
});

// ============================================================================
// GET /api/buchhaltung/period-locks
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const includeUnlocked = searchParams.get("includeUnlocked") === "true";
    const year = yearParam ? parseInt(yearParam, 10) : null;

    const locks = await prisma.accountingPeriodLock.findMany({
      where: {
        tenantId: check.tenantId,
        ...(year && !isNaN(year) ? { periodYear: year } : {}),
        ...(includeUnlocked ? {} : { unlockedAt: null }),
      },
      select: {
        id: true,
        periodYear: true,
        periodMonth: true,
        lockedAt: true,
        unlockedAt: true,
        reason: true,
        lockedBy: { select: { firstName: true, lastName: true, email: true } },
        unlockedBy: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    });

    return NextResponse.json({ data: serializePrisma(locks) });
  } catch (error) {
    logger.error({ err: error }, "Error fetching period locks");
    return apiError("FETCH_FAILED", 500, {
      message: "Fehler beim Laden der Periodensperren",
    });
  }
}

// ============================================================================
// POST /api/buchhaltung/period-locks
// Locks an accounting period (only admin).
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message || "Ungültige Eingabedaten",
      });
    }

    const { periodYear, periodMonth, reason } = parsed.data;

    try {
      const lock = await prisma.accountingPeriodLock.create({
        data: {
          tenantId: check.tenantId,
          periodYear,
          periodMonth,
          lockedById: check.userId!,
          reason: reason ?? null,
        },
      });

      logger.info(
        {
          tenantId: check.tenantId,
          userId: check.userId,
          lockId: lock.id,
          periodYear,
          periodMonth,
        },
        "Accounting period locked",
      );

      return NextResponse.json(serializePrisma(lock), { status: 201 });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return apiError("ALREADY_EXISTS", 409, {
          message: `Periode ${periodYear}-${String(periodMonth).padStart(2, "0")} ist bereits gesperrt`,
        });
      }
      throw err;
    }
  } catch (error) {
    logger.error({ err: error }, "Error locking accounting period");
    return apiError("CREATE_FAILED", 500, {
      message: "Fehler beim Sperren der Periode",
    });
  }
}
