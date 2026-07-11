import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { readImpersonationCookie } from "@/lib/auth/impersonation-cookie";

// Re-export types from audit-types for backward compatibility
// Server components can import from either file
export type { AuditAction, AuditEntityType } from "./audit-types";
export { getEntityDisplayName, getActionDisplayName } from "./audit-types";

import type { AuditAction, AuditEntityType } from "./audit-types";
import { logger } from "@/lib/logger";

interface AuditLogParams {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  description?: string;
}

/**
 * Creates an audit log entry for tracking user actions.
 * Should be called after successful operations (especially DELETE).
 *
 * @param params - The audit log parameters
 * @returns The created audit log entry or null if creation failed
 */
export async function createAuditLog(params: AuditLogParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      logger.warn("Audit log: No user session found");
      return null;
    }

    // Get request headers for IP and user agent
    let ipAddress: string | null = null;
    let userAgent: string | null = null;

    try {
      const headersList = await headers();
      ipAddress =
        headersList.get("x-forwarded-for")?.split(",")[0] ||
        headersList.get("x-real-ip") ||
        null;
      userAgent = headersList.get("user-agent") || null;
    } catch {
      // Headers might not be available in all contexts
    }

    // F2-Compliance: Impersonation-Kette in AuditLog aufloesen.
    // Der Cookie wird nur vom Superadmin-Impersonate-Flow gesetzt und HMAC-
    // signiert. Wenn er gültig ist:
    //   userId           = Target-User  (wessen "Aktion" ist das effektiv)
    //   impersonatedById = Original-Admin  (wer hat die Aktion ausgelöst)
    //   tenantId         = Target-Tenant
    // Ohne Cookie greift der klassische Pfad (session.user.id / session.user.tenantId).
    const impersonation = await readImpersonationCookie();
    const effectiveUserId = impersonation?.targetUserId ?? session.user.id;
    const effectiveTenantId =
      impersonation?.targetTenantId ?? session.user.tenantId ?? null;
    const impersonatedById = impersonation?.originalUserId ?? null;

    const auditLog = await prisma.auditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        oldValues: params.oldValues ? (params.oldValues as Prisma.InputJsonValue) : Prisma.JsonNull,
        newValues: params.newValues ? (params.newValues as Prisma.InputJsonValue) : Prisma.JsonNull,
        ipAddress,
        userAgent,
        tenantId: effectiveTenantId,
        userId: effectiveUserId,
        impersonatedById,
      },
    });

    return auditLog;
  } catch (error) {
    logger.error({ err: error }, "Failed to create audit log");
    // Don't throw - audit logging should not break the main operation
    return null;
  }
}

/**
 * Helper function specifically for logging DELETE operations.
 * Includes the entity data that was deleted for potential recovery reference.
 *
 * @param entityType - The type of entity being deleted
 * @param entityId - The ID of the entity
 * @param deletedData - The data that was deleted (for reference)
 */
export async function logDeletion(
  entityType: AuditEntityType,
  entityId: string,
  deletedData: Record<string, unknown>
) {
  // Clean sensitive fields before logging
  const cleanedData = { ...deletedData };
  delete cleanedData.passwordHash;
  delete cleanedData.password;

  return createAuditLog({
    action: "DELETE",
    entityType,
    entityId,
    oldValues: cleanedData,
    newValues: null,
  });
}
