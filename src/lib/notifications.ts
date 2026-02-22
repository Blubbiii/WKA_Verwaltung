import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";
import { logger } from "@/lib/logger";

/**
 * Map string type identifiers to the NotificationType enum.
 * Accepts both enum values and descriptive strings like "invoice_overdue".
 */
function resolveNotificationType(type: string): NotificationType {
  const typeMap: Record<string, NotificationType> = {
    // Enum values
    DOCUMENT: "DOCUMENT",
    VOTE: "VOTE",
    CONTRACT: "CONTRACT",
    INVOICE: "INVOICE",
    SYSTEM: "SYSTEM",
    // Descriptive aliases
    invoice_overdue: "INVOICE",
    contract_expiring: "CONTRACT",
    settlement_pending: "INVOICE",
    document_uploaded: "DOCUMENT",
    vote_opened: "VOTE",
  };
  return typeMap[type] || "SYSTEM";
}

/**
 * Create a single notification for a specific user.
 */
export async function createNotification(params: {
  userId: string;
  tenantId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: params.userId,
        tenantId: params.tenantId,
        type: resolveNotificationType(params.type),
        title: params.title,
        message: params.message,
        link: params.link ?? null,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Notifications] Failed to create notification");
    // Do not throw - notification creation should not break the caller
  }
}

/**
 * Notify all admins (ADMIN + SUPERADMIN) of a specific tenant.
 * Useful for system-level events like overdue invoices or expiring contracts.
 */
export async function notifyAdmins(params: {
  tenantId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}): Promise<void> {
  try {
    // Find all users with ADMIN or SUPERADMIN role in the tenant
    const admins = await prisma.user.findMany({
      where: {
        tenantId: params.tenantId,
        status: "ACTIVE",
        role: { in: ["ADMIN", "SUPERADMIN"] },
      },
      select: { id: true },
    });

    if (admins.length === 0) {
      logger.warn(
        `[Notifications] No admins found for tenant ${params.tenantId}`
      );
      return;
    }

    const notificationType = resolveNotificationType(params.type);

    // Batch create notifications for all admins
    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        tenantId: params.tenantId,
        type: notificationType,
        title: params.title,
        message: params.message,
        link: params.link ?? null,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "[Notifications] Failed to notify admins");
    // Do not throw - notification creation should not break the caller
  }
}

/**
 * Notify all users of a tenant (e.g. for important announcements).
 */
export async function notifyAllUsers(params: {
  tenantId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: {
        tenantId: params.tenantId,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    if (users.length === 0) return;

    const notificationType = resolveNotificationType(params.type);

    await prisma.notification.createMany({
      data: users.map((user) => ({
        userId: user.id,
        tenantId: params.tenantId,
        type: notificationType,
        title: params.title,
        message: params.message,
        link: params.link ?? null,
      })),
    });
  } catch (error) {
    logger.error(
      { err: error },
      "[Notifications] Failed to notify all users"
    );
  }
}
