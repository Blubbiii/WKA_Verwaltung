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
import { findOrCreateApprovalRequest } from "@/lib/approvals/manager";

const reverseSchema = z.object({
  reason: z
    .string()
    .min(10, "Storno-Begründung muss mindestens 10 Zeichen lang sein")
    .max(500),
  reversalDate: z.string().datetime().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Storno braucht dedizierte Permission (HGB-Verantwortungstrennung).
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
        description: true,
        lines: { select: { debitAmount: true, creditAmount: true } },
      },
    });
    if (!original || original.tenantId !== check.tenantId) {
      return apiError("NOT_FOUND", 404, { message: "Buchung nicht gefunden" });
    }
    // Absolutbetrag einer Buchungsseite verwenden.
    // Eine ausgeglichene Buchung hat Soll-Summe = Haben-Summe, also reicht
    // eine Seite. ABER: Reverse-Lines können debitAmount=null haben (nur Credit
    // gesetzt) — ohne abs() + Fallback wäre sumDebit=0 und der 4-Augen-Check
    // würde Stornos > Schwellwert durchlassen (Bypass durch Initiator selbst).
    const sumDebit = original.lines.reduce(
      (s, l) => s + Math.abs(Number(l.debitAmount ?? 0)),
      0,
    );
    const sumCredit = original.lines.reduce(
      (s, l) => s + Math.abs(Number(l.creditAmount ?? 0)),
      0,
    );
    const totalAmount = sumDebit > 0 ? sumDebit : sumCredit;
    try {
      await assertFourEyes({
        tenantId: check.tenantId!,
        userId: check.userId!,
        action: "REVERSE",
        createdById: original.createdById,
        amountEur: totalAmount,
      });
    } catch (err) {
      if (err instanceof FourEyesViolationError) {
        const approvalRequest = await findOrCreateApprovalRequest({
          tenantId: check.tenantId!,
          action: "JOURNAL_REVERSE",
          entityType: "JournalEntry",
          entityId: id,
          amountEur: totalAmount,
          requestedById: check.userId!,
          requestReason: reason,
          actionParams: { reason, reversalDate },
        });
        return NextResponse.json(
          {
            status: "PENDING_APPROVAL",
            message:
              "Vier-Augen-Prinzip: ein zweiter berechtigter User muss den Storno freigeben.",
            approvalRequest: {
              id: approvalRequest.id,
              expiresAt: approvalRequest.expiresAt.toISOString(),
              threshold: err.threshold,
              amountEur: err.amountEur,
            },
          },
          { status: 202 },
        );
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

    // WF-5: Notify Original-Ersteller über Storno (außer bei Self-Reversal).
    if (
      original.createdById &&
      original.createdById !== check.userId
    ) {
      try {
        const decider = await prisma.user.findUnique({
          where: { id: check.userId! },
          select: { firstName: true, lastName: true, email: true },
        });
        const deciderName = decider
          ? [decider.firstName, decider.lastName].filter(Boolean).join(" ").trim()
          : "";
        const deciderLabel = deciderName || decider?.email || "ein Kollege";
        await prisma.notification.create({
          data: {
            tenantId: check.tenantId!,
            userId: original.createdById,
            type: "SYSTEM",
            title: "Ihre Buchung wurde storniert",
            message: `Buchung "${original.description}" wurde von ${deciderLabel} storniert. Begründung: ${reason}`,
            link: `/journal-entries/${result.reversalId}`,
            referenceType: "JournalEntry",
            referenceId: result.reversalId,
          },
        });
      } catch (err) {
        logger.warn({ err }, "[Storno-Notify] Notification konnte nicht erstellt werden");
      }
    }

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
