/**
 * Sprint 3 Permissions v2: Action-Executor.
 *
 * Wird aufgerufen wenn ein ApprovalRequest auf APPROVED gesetzt wird —
 * führt die ursprünglich blockierte Aktion mit den Rechten des Deciders
 * aus. Idempotent: wenn die Aktion zwischenzeitlich anderweitig ausgeführt
 * wurde (z.B. manuell durch Admin), liefert der Executor einen erkennbaren
 * Fehler, der dem Decider angezeigt wird.
 *
 * Wichtig: der Executor läuft NACH der Approval-Decision in der gleichen
 * Transaktion → bei Execution-Failure wird die Decision committed bleiben,
 * aber executionError + executedAt gesetzt. Decider sieht den Fehler.
 */

import type { ApprovalAction, ApprovalRequest } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import {
  reverseJournalEntry,
  PeriodLockedError,
  assertPeriodOpen,
} from "@/lib/accounting/period-lock";
import { invalidateReportsCache } from "@/lib/cache/reports";

export interface ExecutorResult {
  success: boolean;
  resultData?: Record<string, unknown>;
  error?: string;
}

type Executor = (
  request: ApprovalRequest,
  /** User-ID des Deciders, der die Approval durchgeführt hat. */
  deciderId: string,
) => Promise<ExecutorResult>;

/**
 * Führt das Posten einer DRAFT-JournalEntry aus.
 */
const executeJournalPost: Executor = async (request) => {
  try {
    const entry = await prisma.journalEntry.findFirst({
      where: {
        id: request.entityId,
        tenantId: request.tenantId,
        deletedAt: null,
      },
      include: { lines: true },
    });
    if (!entry) {
      return { success: false, error: "Buchung nicht mehr vorhanden" };
    }
    if (entry.status !== "DRAFT") {
      return {
        success: false,
        error: `Buchung ist im Status "${entry.status}" — Posting bereits durchgeführt oder nicht mehr möglich`,
      };
    }

    // Periode-Sperre erneut prüfen (kann sich zwischenzeitlich geändert haben)
    try {
      await assertPeriodOpen(request.tenantId, entry.entryDate);
    } catch (err) {
      if (err instanceof PeriodLockedError) {
        return {
          success: false,
          error: `Periode ${err.periodYear}-${err.periodMonth ?? ""} ist mittlerweile gesperrt`,
        };
      }
      throw err;
    }

    const updated = await prisma.journalEntry.update({
      where: { id: entry.id },
      data: { status: "POSTED" },
    });

    invalidateReportsCache(request.tenantId).catch((err) => {
      logger.warn({ err }, "[Reports-Cache] Invalidation nach Approval-POST fehlgeschlagen");
    });

    return {
      success: true,
      resultData: { postedEntryId: updated.id, status: updated.status },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    };
  }
};

/**
 * Führt die Generalumkehr (Storno) einer POSTED-JournalEntry aus.
 */
const executeJournalReverse: Executor = async (request, deciderId) => {
  try {
    const params = (request.actionParams as { reason?: string; reversalDate?: string } | null) ?? {};
    const reason = params.reason ?? request.requestReason ?? "Storno (genehmigt)";
    const reversalDate = params.reversalDate ? new Date(params.reversalDate) : undefined;

    const result = await prisma.$transaction(async (tx) => {
      return reverseJournalEntry(tx, {
        tenantId: request.tenantId,
        originalEntryId: request.entityId,
        userId: deciderId,
        reason,
        reversalDate,
      });
    });

    invalidateReportsCache(request.tenantId).catch((err) => {
      logger.warn({ err }, "[Reports-Cache] Invalidation nach Approval-REVERSE fehlgeschlagen");
    });

    return {
      success: true,
      resultData: { originalId: result.originalId, reversalId: result.reversalId },
    };
  } catch (err) {
    if (err instanceof PeriodLockedError) {
      return {
        success: false,
        error: `Periode ${err.periodYear}-${err.periodMonth ?? ""} ist gesperrt`,
      };
    }
    if (err instanceof Error) {
      if (err.name === "AlreadyReversedError") {
        return { success: false, error: "Buchung wurde bereits storniert" };
      }
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    };
  }
};

/**
 * Settlement-Finalize: setzt SettlementPeriod auf FINALIZED.
 */
const executeSettlementFinalize: Executor = async (request) => {
  try {
    const period = await prisma.leaseSettlementPeriod.findFirst({
      where: { id: request.entityId, tenantId: request.tenantId },
    });
    if (!period) {
      return { success: false, error: "Settlement-Periode nicht gefunden" };
    }
    if (period.status === "CLOSED" || period.status === "APPROVED") {
      return {
        success: false,
        error: `Settlement-Periode ist bereits ${period.status}`,
      };
    }
    const updated = await prisma.leaseSettlementPeriod.update({
      where: { id: period.id },
      data: { status: "APPROVED" },
    });
    return { success: true, resultData: { periodId: updated.id, status: updated.status } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    };
  }
};

/**
 * Eingangsrechnung freigeben: setzt IncomingInvoice auf APPROVED + approvedById.
 */
const executeIncomingInvoiceApprove: Executor = async (request, deciderId) => {
  try {
    const invoice = await prisma.incomingInvoice.findFirst({
      where: {
        id: request.entityId,
        tenantId: request.tenantId,
        deletedAt: null,
      },
    });
    if (!invoice) {
      return { success: false, error: "Eingangsrechnung nicht mehr vorhanden" };
    }
    if (invoice.status !== "REVIEW" && invoice.status !== "INBOX") {
      return {
        success: false,
        error: `Rechnung ist im Status "${invoice.status}" — Approve nicht mehr möglich`,
      };
    }
    const updated = await prisma.incomingInvoice.update({
      where: { id: invoice.id },
      data: {
        status: "APPROVED",
        approvedById: deciderId,
        approvedAt: new Date(),
      },
    });
    return {
      success: true,
      resultData: { invoiceId: updated.id, status: updated.status },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    };
  }
};

/**
 * SEPA-Lauf finalisieren: setzt SepaPaymentBatch auf APPROVED → SENT-bereit.
 */
const executeSepaRun: Executor = async (request) => {
  try {
    const batch = await prisma.sepaPaymentBatch.findFirst({
      where: { id: request.entityId, tenantId: request.tenantId },
    });
    if (!batch) {
      return { success: false, error: "SEPA-Batch nicht gefunden" };
    }
    if (batch.status !== "DRAFT") {
      return {
        success: false,
        error: `SEPA-Batch ist im Status "${batch.status}" — Approve nicht mehr möglich`,
      };
    }
    const updated = await prisma.sepaPaymentBatch.update({
      where: { id: batch.id },
      data: { status: "APPROVED" },
    });
    return { success: true, resultData: { batchId: updated.id, status: updated.status } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    };
  }
};

/**
 * Action → Executor Map.
 * Aktionen ohne Executor (z.B. TENANT_SETTINGS_UPDATE, USER_ROLE_ASSIGN)
 * sind noch nicht implementiert — Approve setzt Status, Ausführung muss
 * dann manuell erfolgen.
 */
const EXECUTORS: Partial<Record<ApprovalAction, Executor>> = {
  JOURNAL_POST: executeJournalPost,
  JOURNAL_REVERSE: executeJournalReverse,
  SETTLEMENT_FINALIZE: executeSettlementFinalize,
  SEPA_RUN: executeSepaRun,
  INCOMING_INVOICE_APPROVE: executeIncomingInvoiceApprove,
};

/**
 * Führt die zur Action gehörende Executor-Funktion aus.
 * Liefert immer ein ExecutorResult — wirft nicht.
 */
export async function executeApprovedAction(
  request: ApprovalRequest,
  deciderId: string,
): Promise<ExecutorResult> {
  const executor = EXECUTORS[request.action];
  if (!executor) {
    return {
      success: false,
      error: `Kein Executor für Action "${request.action}" registriert`,
    };
  }
  return executor(request, deciderId);
}
