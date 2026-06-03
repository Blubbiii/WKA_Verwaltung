/**
 * Storno (Generalumkehr) für POSTED JournalEntries — Phase 9, GoBD §146 AO.
 *
 * POST /api/journal-entries/[id]/reverse
 *
 * Erzeugt eine Spiegelbuchung mit getauschten soll/haben-Beträgen.
 * Original bleibt unverändert (GoBD §146 Abs. 4 Unveränderbarkeit),
 * neue Storno-Buchung ist POSTED und via reversesJournalEntryId verlinkt.
 *
 * Period-Gate:
 * - Storno-Datum = jetzt (oder body.reversalDate falls übergeben)
 * - assertPeriodOpen() prüft den AKTUELLEN Monat — nicht die Original-Periode
 *   (die bleibt geschlossen, das Storno bucht in einen offenen Monat).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import {
  reverseJournalEntry,
  PeriodLockedError,
} from "@/lib/accounting/period-lock";
import { invalidateReportsCache } from "@/lib/cache/reports";
import { assertFourEyes, FourEyesViolationError } from "@/lib/auth/four-eyes-check";

const reverseSchema = z.object({
  reason: z.string().min(1, "Storno-Begründung ist Pflicht").max(500),
  reversalDate: z.string().datetime().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // K-4-Fix: Storno braucht dedizierte Permission (HGB-Verantwortungstrennung).
    const check = await requirePermission("accounting:reverse");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { id } = await params;

    let bodyParsed;
    try {
      const body = await request.json();
      bodyParsed = reverseSchema.safeParse(body);
    } catch {
      return apiError("BAD_REQUEST", 400, {
        message: "Storno-Begründung fehlt (reason im Body)",
      });
    }

    if (!bodyParsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: bodyParsed.error.issues[0]?.message || "Ungültige Eingabedaten",
      });
    }

    const { reason, reversalDate } = bodyParsed.data;

    // Sprint 3: 4-Augen-Prinzip beim Storno.
    // Wir lesen die Original-Buchung um createdById + Summe zu kennen.
    const original = await prisma.journalEntry.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        createdById: true,
        lines: { select: { debitAmount: true } },
      },
    });
    if (!original || original.tenantId !== check.tenantId) {
      return apiError("NOT_FOUND", 404, { message: "Buchung nicht gefunden" });
    }
    const sumDebit = original.lines.reduce(
      (s, l) => s + Number(l.debitAmount ?? 0),
      0,
    );
    try {
      await assertFourEyes({
        tenantId: check.tenantId!,
        userId: check.userId!,
        action: "REVERSE",
        createdById: original.createdById,
        amountEur: sumDebit,
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

    const result = await prisma.$transaction(async (tx) => {
      return reverseJournalEntry(tx, {
        tenantId: check.tenantId!,
        originalEntryId: id,
        userId: check.userId!,
        reason,
        reversalDate: reversalDate ? new Date(reversalDate) : undefined,
      });
    });

    const reversal = await prisma.journalEntry.findUnique({
      where: { id: result.reversalId },
      include: {
        lines: { orderBy: { lineNumber: "asc" } },
        reverses: { select: { id: true, description: true, entryDate: true } },
      },
    });

    // P-3: Reports-Cache invalidieren — Storno ändert Saldi.
    invalidateReportsCache(check.tenantId!).catch((err) => {
      logger.warn({ err }, "[Reports-Cache] Invalidation failed after STORNO");
    });

    logger.info(
      {
        tenantId: check.tenantId,
        userId: check.userId,
        originalId: result.originalId,
        reversalId: result.reversalId,
        reason,
      },
      "Journal entry reversed (Storno)",
    );

    return NextResponse.json(serializePrisma(reversal), { status: 201 });
  } catch (error) {
    if (error instanceof PeriodLockedError) {
      return apiError("PERIOD_LOCKED", 409, {
        message: error.message,
        details: {
          periodYear: error.periodYear,
          periodMonth: error.periodMonth,
        },
      });
    }
    if (error instanceof Error) {
      if (error.name === "EntityNotFoundError") {
        return apiError("NOT_FOUND", 404, { message: error.message });
      }
      if (error.name === "TenantMismatchError") {
        return apiError("TENANT_MISMATCH", 403, { message: error.message });
      }
      if (error.name === "AlreadyReversedError") {
        return apiError("ALREADY_REVERSED", 409, { message: error.message });
      }
      if (error.name === "InvalidStateError") {
        return apiError("BAD_REQUEST", 400, { message: error.message });
      }
    }
    logger.error({ err: error }, "Error reversing journal entry");
    return apiError("PROCESS_FAILED", 500, {
      message: "Fehler beim Stornieren der Buchung",
    });
  }
}
