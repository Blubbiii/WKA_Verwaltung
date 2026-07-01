import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client-runtime-utils";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";
import { assertPeriodOpen, PeriodLockedError } from "@/lib/accounting/period-lock";
import { invalidateReportsCache } from "@/lib/cache/reports";
import { assertFourEyes, FourEyesViolationError } from "@/lib/auth/four-eyes-check";
import { findOrCreateApprovalRequest } from "@/lib/approvals/manager";
import { createAuditLog } from "@/lib/audit";

// ============================================================================
// POST /api/journal-entries/[id]/post
// Transitions a DRAFT journal entry to POSTED after validating debit = credit.
// ============================================================================

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Posting (DRAFT → POSTED) braucht dedizierte Permission.
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

    // Decimal-Arithmetik statt Number() (Float-Rundungsfehler bei
    // vielen Buchungszeilen kann sonst zu falscher Soll=Haben-Validierung führen).
    let totalDebitDec = new Decimal(0);
    let totalCreditDec = new Decimal(0);

    for (const line of entry.lines) {
      totalDebitDec = totalDebitDec.plus(line.debitAmount ?? 0);
      totalCreditDec = totalCreditDec.plus(line.creditAmount ?? 0);
    }

    // Toleranz 0.005 € (halber Cent) für Decimal(15,2)-Felder.
    if (totalDebitDec.minus(totalCreditDec).abs().greaterThanOrEqualTo(0.005)) {
      return apiError("BAD_REQUEST", 400, { message: `Buchung nicht ausgeglichen: Soll ${totalDebitDec.toFixed(2)} € ≠ Haben ${totalCreditDec.toFixed(2)} €` });
    }

    const totalDebit = totalDebitDec.toNumber();
    const totalCredit = totalCreditDec.toNumber();

    // Sprint 3 Permissions v2: 4-Augen-Prinzip beim Festschreiben.
    // Bei Verletzung wird die Aktion NICHT mehr hart geblockt — stattdessen
    // wird ein ApprovalRequest erzeugt, den ein zweiter berechtigter User
    // entscheidet. Bei APPROVED wird die Buchung durch den Executor gepostet.
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
        const approvalRequest = await findOrCreateApprovalRequest({
          tenantId: check.tenantId!,
          action: "JOURNAL_POST",
          entityType: "JournalEntry",
          entityId: id,
          amountEur: totalDebit,
          requestedById: check.userId!,
          requestReason: `Festschreiben Buchung ${entry.description}`,
        });
        return NextResponse.json(
          {
            status: "PENDING_APPROVAL",
            message:
              "Vier-Augen-Prinzip: ein zweiter berechtigter User muss die Buchung freigeben.",
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

    // GoBD §146 AO: Belegfestschreibung (DRAFT → POSTED) muss revisionssicher
    // dokumentiert sein — Zeitstempel + User + alte/neue Werte.
    // Fire-and-forget wie invalidateReportsCache: das Posting selbst ist erfolgreich,
    // Audit-Log-Failure darf nicht rollback — aber wir loggen laut wenn's schiefgeht.
    createAuditLog({
      action: "POST",
      entityType: "JournalEntry",
      entityId: id,
      oldValues: { status: "DRAFT" },
      newValues: {
        status: "POSTED",
        totalDebit,
        totalCredit,
        entryDate: entry.entryDate.toISOString(),
      },
      description: `Buchung ${entry.description} festgeschrieben (${totalDebit.toFixed(2)} €)`,
    }).catch((err) => {
      logger.error(
        { err, entryId: id, tenantId: check.tenantId },
        "[Audit] createAuditLog failed after POST — GoBD trail incomplete",
      );
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
