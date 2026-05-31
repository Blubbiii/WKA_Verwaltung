/**
 * Periodensperre — Unlock per Soft-Update (Phase 9).
 *
 * DELETE /api/buchhaltung/period-locks/[id] — Periode entsperren (Admin)
 *
 * Wir löschen den Lock-Record NICHT, sondern setzen unlockedAt + unlockedById
 * — Audit-Trail bleibt erhalten. Ein unlocked Record gilt nicht mehr als Sperre
 * (siehe assertPeriodOpen() in src/lib/accounting/period-lock.ts).
 *
 * Re-Lock derselben Periode: aktuell blockiert durch UNIQUE-Constraint
 * (siehe period-locks/route.ts Kommentar). Für die seltene Re-Lock-Operation
 * wäre eine eigene Migration nötig — out-of-scope für P9.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const unlockSchema = z.object({
  reason: z.string().min(1, "Begründung für Entsperren ist Pflicht").max(500),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { id } = await params;

    // Begründung wird via Body übergeben (DELETE mit Body ist HTTP-konform).
    let bodyParsed;
    try {
      const body = await request.json();
      bodyParsed = unlockSchema.safeParse(body);
    } catch {
      return apiError("BAD_REQUEST", 400, {
        message: "Begründung für Entsperren ist Pflicht (reason im Body)",
      });
    }

    if (!bodyParsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: bodyParsed.error.issues[0]?.message || "Ungültige Eingabedaten",
      });
    }

    const lock = await prisma.accountingPeriodLock.findFirst({
      where: { id, tenantId: check.tenantId },
      select: {
        id: true,
        unlockedAt: true,
        periodYear: true,
        periodMonth: true,
        reason: true,
      },
    });

    if (!lock) {
      return apiError("NOT_FOUND", 404, {
        message: "Periodensperre nicht gefunden",
      });
    }

    if (lock.unlockedAt !== null) {
      return apiError("CONFLICT", 409, {
        message: "Periode ist bereits entsperrt",
      });
    }

    // Reason wird an die bestehende Lock-Reason angehängt, damit der
    // Audit-Trail sowohl Lock-Grund als auch Unlock-Grund enthält.
    const mergedReason = `${lock.reason ?? ""}\n[Unlock: ${bodyParsed.data.reason}]`.slice(0, 500);

    const updated = await prisma.accountingPeriodLock.update({
      where: { id },
      data: {
        unlockedAt: new Date(),
        unlockedById: check.userId!,
        reason: mergedReason,
      },
    });

    logger.warn(
      {
        tenantId: check.tenantId,
        userId: check.userId,
        lockId: id,
        periodYear: lock.periodYear,
        periodMonth: lock.periodMonth,
        reason: bodyParsed.data.reason,
      },
      "Accounting period UNLOCKED — review audit trail",
    );

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error unlocking accounting period");
    return apiError("UPDATE_FAILED", 500, {
      message: "Fehler beim Entsperren der Periode",
    });
  }
}
