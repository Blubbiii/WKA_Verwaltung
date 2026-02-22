/**
 * Reminder Service - Core Business Logic
 *
 * Checks for overdue/expiring items across all categories and
 * sends email notifications where appropriate (with cooldown logic).
 *
 * Called by the BullMQ reminder worker on a daily schedule.
 */

import { jobLogger } from "@/lib/logger";
import type {
  ReminderCategory,
  ReminderItem,
  ReminderResult,
  ReminderUrgency,
  PendingActionsSummary,
} from "./reminder-types";
import { DEFAULT_REMINDER_CONFIG } from "./reminder-types";

const logger = jobLogger.child({ component: "reminder-service" });

// =============================================================================
// Main entry point - called by the worker
// =============================================================================

/**
 * Check all reminder categories for a tenant and send notifications.
 *
 * @param tenantId - The tenant to check reminders for
 * @returns Summary of reminders found, emails sent, etc.
 */
export async function checkAndSendReminders(
  tenantId: string
): Promise<ReminderResult> {
  const { prisma } = await import("@/lib/prisma");

  logger.info({ tenantId }, "Starting reminder check");

  const result: ReminderResult = {
    tenantId,
    checkedAt: new Date(),
    items: [],
    emailsSent: 0,
    skipped: 0,
    errors: [],
  };

  const now = new Date();

  // Gather items from all enabled categories
  for (const config of DEFAULT_REMINDER_CONFIG) {
    if (!config.enabled) continue;

    try {
      let items: ReminderItem[] = [];

      switch (config.category) {
        case "OVERDUE_INVOICE":
          items = await findOverdueInvoices(prisma, tenantId, now);
          break;
        case "EXPIRING_CONTRACT":
          items = await findExpiringContracts(prisma, tenantId, now);
          break;
        case "OPEN_SETTLEMENT":
          items = await findOpenSettlements(prisma, tenantId, now);
          break;
        case "EXPIRING_DOCUMENT":
          items = await findExpiringDocuments(prisma, tenantId, now);
          break;
      }

      result.items.push(...items);

      logger.info(
        { tenantId, category: config.category, count: items.length },
        `Found ${items.length} items for ${config.category}`
      );
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Unknown error";
      result.errors.push(`${config.category}: ${msg}`);
      logger.error(
        { tenantId, category: config.category, err: msg },
        `Error checking ${config.category}`
      );
    }
  }

  // For each item, check cooldown and send email if needed
  for (const item of result.items) {
    try {
      const categoryConfig = DEFAULT_REMINDER_CONFIG.find(
        (c) => c.category === item.category
      );
      const cooldownDays = categoryConfig?.cooldownDays ?? 7;

      // Check if a reminder was already sent recently for this entity+category
      const recentReminder = await prisma.reminderLog.findFirst({
        where: {
          tenantId,
          entityId: item.entityId,
          category: item.category as ReminderCategory,
          createdAt: {
            gte: new Date(
              now.getTime() - cooldownDays * 24 * 60 * 60 * 1000
            ),
          },
        },
        orderBy: { createdAt: "desc" },
      });

      if (recentReminder) {
        result.skipped++;
        continue;
      }

      // Send email notification
      let emailSent = false;
      try {
        emailSent = await sendReminderEmail(
          prisma,
          tenantId,
          item
        );
        if (emailSent) {
          result.emailsSent++;
        }
      } catch (emailError) {
        // Email sending is non-critical
        logger.warn(
          {
            tenantId,
            entityId: item.entityId,
            err:
              emailError instanceof Error
                ? emailError.message
                : "Unknown error",
          },
          "Failed to send reminder email"
        );
      }

      // Log the reminder regardless of email success
      await prisma.reminderLog.create({
        data: {
          category: item.category as ReminderCategory,
          entityId: item.entityId,
          entityType: item.entityType,
          title: item.title,
          urgency: item.urgency,
          emailSent,
          tenantId,
        },
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Unknown error";
      result.errors.push(
        `Log/send for ${item.entityId}: ${msg}`
      );
      logger.error(
        { tenantId, entityId: item.entityId, err: msg },
        "Error processing reminder item"
      );
    }
  }

  logger.info(
    {
      tenantId,
      totalItems: result.items.length,
      emailsSent: result.emailsSent,
      skipped: result.skipped,
      errors: result.errors.length,
    },
    "Reminder check completed"
  );

  return result;
}

// =============================================================================
// Pending actions summary (for the API / dashboard widget)
// =============================================================================

/**
 * Get a summary of pending action counts for a tenant.
 * This is a lightweight query used by the dashboard widget.
 */
export async function getPendingActionsSummary(
  tenantId: string
): Promise<PendingActionsSummary> {
  const { prisma } = await import("@/lib/prisma");
  const now = new Date();

  const [
    overdueInvoices,
    expiringContracts7,
    expiringContracts30,
    openSettlements30,
    openSettlements90,
  ] = await Promise.all([
    // Overdue invoices: SENT status, dueDate < today, not deleted
    prisma.invoice.findMany({
      where: {
        tenantId,
        status: "SENT",
        dueDate: { lt: now },
        deletedAt: null,
      },
      select: {
        id: true,
        grossAmount: true,
        dueDate: true,
      },
    }),

    // Contracts expiring within 7 days
    prisma.contract.count({
      where: {
        tenantId,
        status: "ACTIVE",
        endDate: {
          gte: now,
          lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),

    // Contracts expiring within 30 days
    prisma.contract.count({
      where: {
        tenantId,
        status: "ACTIVE",
        endDate: {
          gte: now,
          lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),

    // Settlement periods open for >30 days
    prisma.leaseSettlementPeriod.count({
      where: {
        tenantId,
        status: "OPEN",
        createdAt: {
          lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),

    // Settlement periods open for >90 days (critical)
    prisma.leaseSettlementPeriod.count({
      where: {
        tenantId,
        status: "OPEN",
        createdAt: {
          lt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  // Calculate overdue invoice stats
  const overdueCount = overdueInvoices.length;
  const overdueAmount = overdueInvoices.reduce(
    (sum, inv) => sum + Number(inv.grossAmount),
    0
  );
  const overdueCritical = overdueInvoices.filter((inv) => {
    if (!inv.dueDate) return false;
    const daysDiff = Math.floor(
      (now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysDiff > 30;
  }).length;

  // Note: Document expiry is not a standard Prisma field, so we count 0 for now
  // This can be extended when documents have an expiryDate field
  const expiringDocsCount = 0;
  const expiringDocsCritical = 0;

  const totalCount =
    overdueCount + expiringContracts30 + openSettlements30 + expiringDocsCount;

  const hasCritical =
    overdueCritical > 0 ||
    expiringContracts7 > 0 ||
    openSettlements90 > 0 ||
    expiringDocsCritical > 0;

  return {
    overdueInvoices: {
      count: overdueCount,
      totalAmount: overdueAmount,
      criticalCount: overdueCritical,
    },
    expiringContracts: {
      count: expiringContracts30,
      criticalCount: expiringContracts7,
    },
    openSettlements: {
      count: openSettlements30,
      criticalCount: openSettlements90,
    },
    expiringDocuments: {
      count: expiringDocsCount,
      criticalCount: expiringDocsCritical,
    },
    totalCount,
    hasCritical,
  };
}

// =============================================================================
// Category-specific finders
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaClient = any;

/**
 * Find invoices with status SENT and dueDate in the past
 */
async function findOverdueInvoices(
  prisma: PrismaClient,
  tenantId: string,
  now: Date
): Promise<ReminderItem[]> {
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: "SENT",
      dueDate: { lt: now },
      deletedAt: null,
    },
    select: {
      id: true,
      invoiceNumber: true,
      recipientName: true,
      grossAmount: true,
      dueDate: true,
      fund: { select: { name: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 100,
  });

  return invoices.map(
    (inv: {
      id: string;
      invoiceNumber: string;
      recipientName: string | null;
      grossAmount: { toNumber?: () => number } | number;
      dueDate: Date | null;
      fund: { name: string } | null;
    }) => {
      const daysOverdue = inv.dueDate
        ? Math.floor(
            (now.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24)
          )
        : 0;

      let urgency: ReminderUrgency = "info";
      if (daysOverdue > 30) urgency = "critical";
      else if (daysOverdue > 14) urgency = "warning";

      const amount =
        typeof inv.grossAmount === "number"
          ? inv.grossAmount
          : typeof inv.grossAmount?.toNumber === "function"
            ? inv.grossAmount.toNumber()
            : Number(inv.grossAmount);

      return {
        category: "OVERDUE_INVOICE" as const,
        entityId: inv.id,
        entityType: "Invoice",
        title: `Rechnung ${inv.invoiceNumber} ueberfaellig`,
        description: `${inv.recipientName || "Unbekannt"} - ${amount.toFixed(2)} EUR - ${daysOverdue} Tage ueberfaellig`,
        urgency,
        referenceDate: inv.dueDate || now,
        daysRemaining: -daysOverdue,
        relatedEntity: inv.fund?.name,
        amount,
      };
    }
  );
}

/**
 * Find active contracts whose endDate is within 30 days
 */
async function findExpiringContracts(
  prisma: PrismaClient,
  tenantId: string,
  now: Date
): Promise<ReminderItem[]> {
  const thirtyDaysFromNow = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1000
  );

  const contracts = await prisma.contract.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      endDate: {
        gte: now,
        lte: thirtyDaysFromNow,
      },
    },
    select: {
      id: true,
      title: true,
      contractType: true,
      endDate: true,
      park: { select: { name: true } },
      fund: { select: { name: true } },
    },
    orderBy: { endDate: "asc" },
    take: 100,
  });

  return contracts.map(
    (contract: {
      id: string;
      title: string;
      contractType: string;
      endDate: Date | null;
      park: { name: string } | null;
      fund: { name: string } | null;
    }) => {
      const daysUntilExpiry = contract.endDate
        ? Math.floor(
            (contract.endDate.getTime() - now.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 0;

      let urgency: ReminderUrgency = "info";
      if (daysUntilExpiry <= 7) urgency = "critical";
      else if (daysUntilExpiry <= 14) urgency = "warning";

      const expiryStr = contract.endDate
        ? contract.endDate.toLocaleDateString("de-DE")
        : "n/a";

      return {
        category: "EXPIRING_CONTRACT" as const,
        entityId: contract.id,
        entityType: "Contract",
        title: `Vertrag "${contract.title}" laeuft aus`,
        description: `${contract.contractType} - Enddatum: ${expiryStr} (${daysUntilExpiry} Tage)`,
        urgency,
        referenceDate: contract.endDate || now,
        daysRemaining: daysUntilExpiry,
        relatedEntity: contract.park?.name || contract.fund?.name,
      };
    }
  );
}

/**
 * Find settlement periods that have been OPEN for more than 30 days
 */
async function findOpenSettlements(
  prisma: PrismaClient,
  tenantId: string,
  now: Date
): Promise<ReminderItem[]> {
  const thirtyDaysAgo = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000
  );

  const periods = await prisma.leaseSettlementPeriod.findMany({
    where: {
      tenantId,
      status: "OPEN",
      createdAt: { lt: thirtyDaysAgo },
    },
    select: {
      id: true,
      year: true,
      month: true,
      periodType: true,
      createdAt: true,
      park: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  return periods.map(
    (period: {
      id: string;
      year: number;
      month: number | null;
      periodType: string;
      createdAt: Date;
      park: { name: string };
    }) => {
      const daysOpen = Math.floor(
        (now.getTime() - period.createdAt.getTime()) /
          (1000 * 60 * 60 * 24)
      );

      let urgency: ReminderUrgency = "info";
      if (daysOpen > 90) urgency = "critical";
      else if (daysOpen > 60) urgency = "warning";

      const periodLabel = period.month
        ? `${period.month}/${period.year}`
        : `${period.year}`;

      return {
        category: "OPEN_SETTLEMENT" as const,
        entityId: period.id,
        entityType: "LeaseSettlementPeriod",
        title: `Abrechnungsperiode ${periodLabel} offen`,
        description: `${period.park.name} - ${period.periodType} - Seit ${daysOpen} Tagen offen`,
        urgency,
        referenceDate: period.createdAt,
        daysRemaining: -daysOpen,
        relatedEntity: period.park.name,
      };
    }
  );
}

/**
 * Find documents that are expiring soon.
 * Note: The current Document model does not have an expiryDate field.
 * This is a placeholder that checks for PERMIT-category documents
 * by looking at related contract endDates as a proxy.
 * Can be extended later when Document gets an expiryDate field.
 */
async function findExpiringDocuments(
  prisma: PrismaClient,
  tenantId: string,
  _now: Date
): Promise<ReminderItem[]> {
  // The Document model currently has no expiryDate field.
  // Return empty for now - this will be populated once the field is added.
  // Future implementation would query:
  // prisma.document.findMany({
  //   where: { tenantId, expiryDate: { gte: now, lte: thirtyDaysFromNow } },
  // })

  void prisma;
  void tenantId;

  return [];
}

// =============================================================================
// Email sending helper
// =============================================================================

/**
 * Send a reminder email notification for a specific item.
 * Sends to all ADMIN+ users in the tenant who have system email enabled.
 */
async function sendReminderEmail(
  prisma: PrismaClient,
  tenantId: string,
  item: ReminderItem
): Promise<boolean> {
  const { enqueueEmail } = await import("@/lib/queue/queues/email.queue");

  // Find admin users for this tenant who have system emails enabled
  const adminUsers = await prisma.user.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      role: { in: ["ADMIN", "SUPERADMIN", "MANAGER"] },
    },
    select: {
      email: true,
      firstName: true,
      emailPreferences: true,
    },
    take: 50,
  });

  // Filter to those who have system emails enabled
  const recipients = adminUsers.filter(
    (user: { emailPreferences: unknown }) => {
      const prefs = user.emailPreferences as Record<string, boolean> | null;
      return prefs?.system !== false; // default to true
    }
  );

  if (recipients.length === 0) {
    logger.info(
      { tenantId },
      "No admin recipients found for reminder email"
    );
    return false;
  }

  // Build subject based on category and urgency
  const urgencyPrefix =
    item.urgency === "critical"
      ? "[DRINGEND] "
      : item.urgency === "warning"
        ? "[Hinweis] "
        : "";
  const subject = `${urgencyPrefix}${item.title}`;

  // Send to each recipient
  let anySent = false;
  for (const recipient of recipients) {
    try {
      await enqueueEmail({
        to: recipient.email,
        subject,
        template: "invoice-notification", // Reuse existing template for now
        data: {
          recipientName:
            recipient.firstName || "Administrator",
          invoiceNumber: item.title,
          grossAmount: item.amount ?? 0,
          dueDate: item.referenceDate.toLocaleDateString("de-DE"),
          reminderDescription: item.description,
          category: item.category,
          urgency: item.urgency,
        },
        tenantId,
        priority: item.urgency === "critical" ? 2 : 5,
      });
      anySent = true;
    } catch (error) {
      logger.warn(
        {
          tenantId,
          email: recipient.email,
          err:
            error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to enqueue reminder email for recipient"
      );
    }
  }

  return anySent;
}
