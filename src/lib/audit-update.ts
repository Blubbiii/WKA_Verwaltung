/**
 * updateWithAudit — central helper for GoBD-compliant mutation logging.
 *
 * Wraps a Prisma update inside a transaction together with an AuditLog
 * insert. Computes the diff between before/after, stores oldValues +
 * newValues only for fields that actually changed. Single transaction
 * means: either the update AND the audit-log entry succeed together,
 * or both roll back.
 *
 * GoBD §147 requires that every change to a finance-relevant record is
 * traceable (who, when, what changed). Without this helper, individual
 * PATCH-handlers would either forget the audit log or write it outside
 * the same transaction (race window where update succeeds but log is lost).
 *
 * Usage:
 *   const updated = await updateWithAudit({
 *     entityType: "Invoice",
 *     entityId: id,
 *     userId: check.userId,
 *     tenantId: check.tenantId!,
 *     loadCurrent: (tx) => tx.invoice.findUnique({ where: { id, tenantId } }),
 *     applyChange: (tx, current) => tx.invoice.update({
 *       where: { id, tenantId },
 *       data: { ...patch },
 *     }),
 *   });
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuditAction, AuditEntityType } from "./audit-types";
import { logger } from "@/lib/logger";
import type { TxClient } from "./invoices/numberGenerator";

export interface UpdateWithAuditOpts<T extends Record<string, unknown>> {
  entityType: AuditEntityType;
  entityId: string;
  userId: string | null | undefined;
  tenantId: string | null;
  /** Optional IP / UA for audit context. Headers() can be passed by caller. */
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Optional human-readable description of the change. */
  description?: string;
  /** Action kind. Defaults to "UPDATE". */
  action?: AuditAction;
  /** Read the current record before the mutation runs. */
  loadCurrent: (tx: TxClient) => Promise<T | null>;
  /** Apply the mutation. Receives the pre-state for derivation if needed. */
  applyChange: (tx: TxClient, current: T) => Promise<T>;
  /**
   * Fields to ignore when computing the diff (e.g. updatedAt always changes).
   * Defaults to ["updatedAt"].
   */
  ignoreFields?: string[];
}

/**
 * Compute a shallow diff: returns {oldValues, newValues} containing only
 * the fields that actually changed. Returns null if no changes detected.
 */
function diffRecords<T extends Record<string, unknown>>(
  before: T,
  after: T,
  ignoreFields: Set<string>,
): { oldValues: Record<string, unknown>; newValues: Record<string, unknown> } | null {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  let changedCount = 0;

  for (const key of Object.keys(after)) {
    if (ignoreFields.has(key)) continue;
    const a = before[key];
    const b = after[key];
    // Use JSON.stringify for deep-equality of Decimal/Date/Json values.
    // Cheap and correct enough for audit purposes.
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      oldValues[key] = a;
      newValues[key] = b;
      changedCount++;
    }
  }

  return changedCount > 0 ? { oldValues, newValues } : null;
}

/**
 * Runs loadCurrent + applyChange + auditLog in a single transaction.
 * If the entity doesn't exist (loadCurrent returns null), throws NOT_FOUND.
 */
export async function updateWithAudit<T extends Record<string, unknown>>(
  opts: UpdateWithAuditOpts<T>,
): Promise<T> {
  const ignoreFields = new Set(opts.ignoreFields ?? ["updatedAt"]);
  const action = opts.action ?? "UPDATE";

  return prisma.$transaction(async (tx) => {
    const before = await opts.loadCurrent(tx);
    if (!before) {
      // Caller should catch NOT_FOUND. We use a recognizable error name
      // so route handlers can convert to a 404.
      const err = new Error("Entity not found");
      err.name = "EntityNotFoundError";
      throw err;
    }

    const after = await opts.applyChange(tx, before);

    const diff = diffRecords(before, after, ignoreFields);

    // Only write an audit-log entry if something actually changed.
    if (diff) {
      try {
        // Description wird (falls vorhanden) in newValues._description gemerged,
        // damit das Audit-Log-UI sie anzeigen kann ohne Schema-Change.
        const newValuesWithDesc = opts.description
          ? { ...diff.newValues, _description: opts.description }
          : diff.newValues;

        await tx.auditLog.create({
          data: {
            action,
            entityType: opts.entityType,
            entityId: opts.entityId,
            oldValues: diff.oldValues as Prisma.InputJsonValue,
            newValues: newValuesWithDesc as Prisma.InputJsonValue,
            ipAddress: opts.ipAddress ?? null,
            userAgent: opts.userAgent ?? null,
            tenantId: opts.tenantId,
            userId: opts.userId ?? null,
          },
        });
      } catch (err) {
        // Inside the tx — if the audit log fails, the whole thing rolls back.
        // Log for ops visibility then re-throw to abort.
        logger.error(
          { err, entityType: opts.entityType, entityId: opts.entityId },
          "Audit log write failed — rolling back update",
        );
        throw err;
      }
    }

    return after;
  });
}

/**
 * Type guard for the NOT_FOUND error thrown by updateWithAudit.
 */
export function isEntityNotFoundError(err: unknown): boolean {
  return err instanceof Error && err.name === "EntityNotFoundError";
}
