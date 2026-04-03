import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

/**
 * Check upcoming deadlines for contracts, leases, and overdue invoices,
 * then create notifications for ADMIN/MANAGER users of the given tenant.
 */
export async function checkDeadlinesAndNotify(
  tenantId: string
): Promise<{ created: number }> {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Collect all notifications to create: { referenceType, referenceId, type, title, message, link }
  const pending: Array<{
    referenceType: string;
    referenceId: string;
    type: "CONTRACT" | "INVOICE";
    title: string;
    message: string;
    link: string;
  }> = [];

  // --- 1. Contract end date (90 / 30 days) ---
  const expiringContracts = await prisma.contract.findMany({
    where: {
      fund: { tenantId },
      status: "ACTIVE",
      deletedAt: null,
      endDate: { not: null, lte: in90Days, gt: now },
    },
    select: { id: true, title: true, endDate: true },
  });

  for (const c of expiringContracts) {
    const daysLeft = Math.ceil(
      (c.endDate!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (daysLeft <= 30 || daysLeft <= 90) {
      pending.push({
        referenceType: "CONTRACT_END",
        referenceId: c.id,
        type: "CONTRACT",
        title: "Vertragsablauf",
        message: `Vertrag '${c.title}' läuft in ${daysLeft} Tagen aus`,
        link: `/contracts/${c.id}`,
      });
    }
  }

  // --- 2. Contract notice deadline (30 days) ---
  const noticeContracts = await prisma.contract.findMany({
    where: {
      fund: { tenantId },
      deletedAt: null,
      noticeDeadline: { not: null, lte: in30Days, gt: now },
    },
    select: { id: true, title: true, noticeDeadline: true },
  });

  for (const c of noticeContracts) {
    const daysLeft = Math.ceil(
      (c.noticeDeadline!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );
    pending.push({
      referenceType: "CONTRACT_NOTICE",
      referenceId: c.id,
      type: "CONTRACT",
      title: "Kündigungsfrist",
      message: `Kündigungsfrist für '${c.title}' in ${daysLeft} Tagen`,
      link: `/contracts/${c.id}`,
    });
  }

  // --- 3. Lease end date (90 / 30 days) ---
  const expiringLeases = await prisma.lease.findMany({
    where: {
      contractPartnerFund: { tenantId },
      status: "ACTIVE",
      deletedAt: null,
      endDate: { not: null, lte: in90Days, gt: now },
    },
    select: {
      id: true,
      endDate: true,
      lessor: { select: { firstName: true, lastName: true, companyName: true } },
    },
  });

  for (const l of expiringLeases) {
    const daysLeft = Math.ceil(
      (l.endDate!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );
    const lessorName =
      l.lessor.companyName ||
      [l.lessor.firstName, l.lessor.lastName].filter(Boolean).join(" ") ||
      "Unbekannt";

    if (daysLeft <= 30 || daysLeft <= 90) {
      pending.push({
        referenceType: "LEASE_END",
        referenceId: l.id,
        type: "CONTRACT",
        title: "Pachtvertragsablauf",
        message: `Pachtvertrag mit ${lessorName} läuft in ${daysLeft} Tagen aus`,
        link: `/leases/${l.id}`,
      });
    }
  }

  // --- 4. Overdue invoices ---
  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      fund: { tenantId },
      status: "SENT",
      dueDate: { lt: now },
    },
    select: { id: true, invoiceNumber: true },
  });

  for (const inv of overdueInvoices) {
    pending.push({
      referenceType: "INVOICE_OVERDUE",
      referenceId: inv.id,
      type: "INVOICE",
      title: "Überfällige Rechnung",
      message: `Rechnung ${inv.invoiceNumber} ist überfällig`,
      link: `/invoices/${inv.id}`,
    });
  }

  if (pending.length === 0) {
    logger.info({ tenantId }, "No deadline notifications to create");
    return { created: 0 };
  }

  // --- Find target users (ADMIN or MANAGER role) ---
  const targetUsers = await prisma.user.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      userRoleAssignments: {
        some: {
          role: {
            name: { in: ["Admin", "Manager"] },
          },
        },
      },
    },
    select: { id: true },
  });

  if (targetUsers.length === 0) {
    logger.warn({ tenantId }, "No ADMIN/MANAGER users found for tenant");
    return { created: 0 };
  }

  // --- Deduplicate: check existing recent notifications ---
  const existingNotifications = await prisma.notification.findMany({
    where: {
      tenantId,
      createdAt: { gte: sevenDaysAgo },
      OR: pending.map((p) => ({
        referenceType: p.referenceType,
        referenceId: p.referenceId,
      })),
    },
    select: { referenceType: true, referenceId: true },
  });

  const existingKeys = new Set(
    existingNotifications.map((n: { referenceType: string | null; referenceId: string | null }) => `${n.referenceType}::${n.referenceId}`)
  );

  const newPending = pending.filter(
    (p) => !existingKeys.has(`${p.referenceType}::${p.referenceId}`)
  );

  if (newPending.length === 0) {
    logger.info({ tenantId }, "All deadline notifications already exist (dedup)");
    return { created: 0 };
  }

  // --- Create notifications for each user ---
  const data = newPending.flatMap((p) =>
    targetUsers.map((u: { id: string }) => ({
      type: p.type as "CONTRACT" | "INVOICE",
      title: p.title,
      message: p.message,
      link: p.link,
      referenceType: p.referenceType,
      referenceId: p.referenceId,
      tenantId,
      userId: u.id,
    }))
  );

  const result = await prisma.notification.createMany({ data });

  logger.info(
    { tenantId, created: result.count, deadlines: newPending.length, users: targetUsers.length },
    "Deadline notifications created"
  );

  return { created: result.count };
}
