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
 * Tenant-Settings-Update: schreibt das settings-Delta auf den Tenant und
 * invalidiert den TenantSettings-Cache.
 *
 * Erwartetes actionParams-Schema:
 *   {
 *     "settings": { "foo": "bar", ... }   // partielles JSON-Delta für tenant.settings
 *     // optionale top-level Tenant-Felder:
 *     "name"?: string,
 *     "primaryColor"?: string,
 *     "secondaryColor"?: string,
 *     "contactEmail"?: string,
 *     "contactPhone"?: string
 *   }
 *
 * Die entityId der ApprovalRequest sollte die tenantId sein (oder gleich
 * request.tenantId — wir verwenden tenantId aus dem Request für Safety).
 *
 * Aktuell erzeugt KEINE bestehende Route ApprovalRequests dieser Action —
 * siehe Doc-String. Sobald ein UI-Workflow Settings-Änderungen unter Vier-
 * Augen stellt, MUSS er actionParams in diesem Schema erzeugen.
 */
const executeTenantSettingsUpdate: Executor = async (request) => {
  try {
    const params = (request.actionParams as Record<string, unknown> | null) ?? null;
    if (!params || typeof params !== "object") {
      return {
        success: false,
        error:
          "TENANT_SETTINGS_UPDATE: actionParams fehlen — erwartet { settings: {...}, [name|primaryColor|...] }",
      };
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: request.tenantId },
      select: { id: true, settings: true },
    });
    if (!tenant) {
      return { success: false, error: "Mandant nicht gefunden" };
    }

    // Settings-Merge: bestehende JSON + Delta aus actionParams.settings
    const settingsDelta =
      params.settings && typeof params.settings === "object"
        ? (params.settings as Record<string, unknown>)
        : null;

    const data: Record<string, unknown> = {};
    if (settingsDelta) {
      const current =
        tenant.settings && typeof tenant.settings === "object"
          ? (tenant.settings as Record<string, unknown>)
          : {};
      data.settings = { ...current, ...settingsDelta };
    }

    // Top-level whitelist — nur ungefährliche Felder dürfen geändert werden
    const allowedTopLevel = [
      "name",
      "primaryColor",
      "secondaryColor",
      "contactEmail",
      "contactPhone",
      "address",
      "city",
      "houseNumber",
      "postalCode",
      "street",
    ] as const;
    for (const key of allowedTopLevel) {
      if (typeof params[key] === "string") {
        data[key] = params[key];
      }
    }

    if (Object.keys(data).length === 0) {
      return {
        success: false,
        error:
          "TENANT_SETTINGS_UPDATE: keine zulässigen Felder in actionParams gefunden",
      };
    }

    const updated = await prisma.tenant.update({
      where: { id: request.tenantId },
      data,
      select: { id: true },
    });

    // Cache invalidieren — wenn der Cache-Layer ausfällt, ist es kein Fehler
    try {
      const { invalidateTenantSettings } = await import("@/lib/cache/tenant");
      await invalidateTenantSettings(request.tenantId);
    } catch (err) {
      logger.warn(
        { err, tenantId: request.tenantId },
        "[Approvals] TenantSettings-Cache-Invalidation fehlgeschlagen",
      );
    }

    return {
      success: true,
      resultData: { tenantId: updated.id, fieldsUpdated: Object.keys(data) },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    };
  }
};

/**
 * User-Role-Assignment: erzeugt eine neue UserRoleAssignment-Zeile.
 *
 * Erwartetes actionParams-Schema:
 *   {
 *     "userId": "uuid",
 *     "roleId": "uuid",
 *     "resourceType"?: string,    // default "__global__"
 *     "resourceIds"?: string[]    // default []
 *   }
 *
 * Idempotent über @@unique([userId, roleId, resourceType]) — wenn die
 * Assignment bereits existiert, liefert Prisma einen unique-Konflikt, den
 * wir abfangen und als "bereits vorhanden" melden (kein Fehler).
 *
 * Aktuell erzeugt KEINE bestehende Route ApprovalRequests dieser Action —
 * siehe Doc-String. Sobald ein UI-Workflow Rollen-Vergabe unter Vier-
 * Augen stellt, MUSS er actionParams in diesem Schema erzeugen.
 */
const executeUserRoleAssign: Executor = async (request, deciderId) => {
  try {
    const params = (request.actionParams as Record<string, unknown> | null) ?? null;
    if (!params || typeof params !== "object") {
      return {
        success: false,
        error:
          "USER_ROLE_ASSIGN: actionParams fehlen — erwartet { userId, roleId, [resourceType, resourceIds] }",
      };
    }

    const userId = typeof params.userId === "string" ? params.userId : null;
    const roleId = typeof params.roleId === "string" ? params.roleId : null;
    const resourceType =
      typeof params.resourceType === "string" ? params.resourceType : "__global__";
    const resourceIds = Array.isArray(params.resourceIds)
      ? (params.resourceIds.filter((v): v is string => typeof v === "string"))
      : [];

    if (!userId || !roleId) {
      return {
        success: false,
        error:
          "USER_ROLE_ASSIGN: userId und roleId müssen in actionParams gesetzt sein",
      };
    }

    // Defensive Schema-Checks: Existiert User + Role?
    const [user, role] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
      prisma.role.findUnique({ where: { id: roleId }, select: { id: true } }),
    ]);
    if (!user) {
      return { success: false, error: "User nicht gefunden" };
    }
    if (!role) {
      return { success: false, error: "Rolle nicht gefunden" };
    }

    // Idempotent: über upsert-ähnliches Pattern. Da UserRoleAssignment kein
    // composite-key hat (nur unique-constraint), nutzen wir create + catch.
    try {
      const assignment = await prisma.userRoleAssignment.create({
        data: {
          userId,
          roleId,
          resourceType,
          resourceIds,
          tenantId: request.tenantId,
          createdBy: deciderId,
        },
      });

      // Permission-Cache des betroffenen Users invalidieren
      try {
        const { invalidateUser } = await import(
          "@/lib/auth/permissionCache"
        );
        await invalidateUser(userId);
      } catch (err) {
        logger.warn(
          { err, userId },
          "[Approvals] Permission-Cache-Invalidation fehlgeschlagen",
        );
      }

      return {
        success: true,
        resultData: { assignmentId: assignment.id, userId, roleId },
      };
    } catch (err) {
      // Unique-constraint Verletzung: Assignment existiert bereits
      if (
        err instanceof Error &&
        (err.message.includes("Unique constraint") ||
          err.message.includes("unique constraint"))
      ) {
        return {
          success: true,
          resultData: {
            assignmentId: null,
            userId,
            roleId,
            note: "Assignment existierte bereits — idempotent übersprungen",
          },
        };
      }
      throw err;
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    };
  }
};

/**
 * Action → Executor Map.
 */
const EXECUTORS: Partial<Record<ApprovalAction, Executor>> = {
  JOURNAL_POST: executeJournalPost,
  JOURNAL_REVERSE: executeJournalReverse,
  SETTLEMENT_FINALIZE: executeSettlementFinalize,
  SEPA_RUN: executeSepaRun,
  INCOMING_INVOICE_APPROVE: executeIncomingInvoiceApprove,
  TENANT_SETTINGS_UPDATE: executeTenantSettingsUpdate,
  USER_ROLE_ASSIGN: executeUserRoleAssign,
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
