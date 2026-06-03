import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { assertPeriodOpen, PeriodLockedError } from "@/lib/accounting/period-lock";
import { invalidateReportsCache } from "@/lib/cache/reports";
import { assertFourEyes, FourEyesViolationError } from "@/lib/auth/four-eyes-check";

// ============================================================================
// POST /api/journal-entries/[id]/post
// Transitions a DRAFT journal entry to POSTED after validating debit = credit.
// ============================================================================

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // K-4-Fix: Posting (DRAFT → POSTED) braucht dedizierte Permission.
    const check = await requirePermission("accounting:post");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const entry = await prisma.journalEntry.findFirst({
      where: { id, tenantId: check.tenantId, deletedAt: null },
      include: { lines: true },
    });

    if (!entry) {
      return apiError("NOT_FOUND", 404, { message: "Buchung nicht gefunden" });
    }

    if (entry.status !== "DRAFT") {
      return apiError("BAD_REQUEST", 400, { message: "Nur Entwürfe können gebucht werden" });
    }

    if (entry.lines.length < 2) {
      return apiError("BAD_REQUEST", 400, { message: "Mindestens 2 Buchungszeilen erforderlich" });
    }

    // Validate debit = credit
    let totalDebit = 0;
    let totalCredit = 0;

    for (const line of entry.lines) {
      totalDebit += Number(line.debitAmount ?? 0);
      totalCredit += Number(line.creditAmount ?? 0);
    }

    if (Math.abs(totalDebit - totalCredit) >= 0.005) {
      return apiError("BAD_REQUEST", 400, { message: `Buchung nicht ausgeglichen: Soll ${totalDebit.toFixed(2)} € ≠ Haben ${totalCredit.toFixed(2)} €` });
    }

    // Sprint 3: 4-Augen-Prinzip beim Festschreiben oberhalb Schwellwert.
    try {
      await assertFourEyes({
        tenantId: check.tenantId!,
        userId: check.userId!,
        action: "POSTING",
        createdById: entry.createdById,
        amountEur: totalDebit,
      });
    } catch (err) {
      if (err instanceof FourEyesViolationError) {
        return apiError("SELF_APPROVAL_FORBIDDEN", 403, {
          message: err.message,
          details: { threshold: err.threshold, amountEur: err.amountEur },
        });
      }
      throw err;
    }

    // P9: GoBD §146 AO — DRAFT → POSTED nur wenn Periode (entryDate) noch offen.
    try {
      await assertPeriodOpen(check.tenantId!, entry.entryDate);
    } catch (err) {
      if (err instanceof PeriodLockedError) {
        return apiError("PERIOD_LOCKED", 409, {
          message: err.message,
          details: { periodYear: err.periodYear, periodMonth: err.periodMonth },
        });
      }
      throw err;
    }

    const updated = await prisma.journalEntry.update({
      where: { id },
      data: { status: "POSTED" },
      include: { lines: { orderBy: { lineNumber: "asc" } } },
    });

    // P-3: Reports-Cache invalidieren — neue POSTED-Buchung ändert Saldi.
    invalidateReportsCache(check.tenantId!).catch((err) => {
      logger.warn({ err }, "[Reports-Cache] Invalidation failed after POST");
    });

    logger.info(
      {
        tenantId: check.tenantId,
        userId: check.userId,
        entryId: id,
        totalDebit,
        totalCredit,
      },
      "Journal entry posted"
    );

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error posting journal entry");
    return apiError("INTERNAL_ERROR", 500, { message: "Fehler beim Buchen" });
  }
}
