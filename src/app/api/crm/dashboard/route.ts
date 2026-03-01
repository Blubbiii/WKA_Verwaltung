import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

// GET /api/crm/dashboard — KPIs + recent activities + open tasks + inactive contacts
export async function GET(_req: NextRequest) {
  try {
    const check = await requirePermission("crm:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [
      totalContacts,
      openTasks,
      activitiesThisMonth,
      recentActivities,
      upcomingTasks,
      inactiveContacts,
    ] = await Promise.all([
      // Total persons with at least one activity
      prisma.person.count({ where: { tenantId } }),

      // Open tasks (PENDING, not deleted)
      prisma.crmActivity.count({
        where: { tenantId, type: "TASK", status: "PENDING", deletedAt: null },
      }),

      // Activities this month
      prisma.crmActivity.count({
        where: { tenantId, deletedAt: null, createdAt: { gte: startOfMonth } },
      }),

      // Recent activities (last 10)
      prisma.crmActivity.findMany({
        where: { tenantId, deletedAt: null },
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          person: { select: { id: true, firstName: true, lastName: true } },
          fund: { select: { id: true, name: true } },
          lease: { select: { id: true, lessor: { select: { firstName: true, lastName: true } } } },
          park: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),

      // Upcoming/overdue tasks (PENDING, sorted by dueDate)
      prisma.crmActivity.findMany({
        where: { tenantId, type: "TASK", status: "PENDING", deletedAt: null },
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          person: { select: { id: true, firstName: true, lastName: true } },
          fund: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),

      // Contacts without activity in >90 days (or never)
      prisma.person.findMany({
        where: {
          tenantId,
          OR: [
            { lastActivityAt: null },
            { lastActivityAt: { lt: ninetyDaysAgo } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          companyName: true,
          contactType: true,
          lastActivityAt: true,
          _count: { select: { crmActivities: { where: { deletedAt: null } } } },
        },
        orderBy: { lastActivityAt: "asc" },
        take: 20,
      }),
    ]);

    return NextResponse.json(
      serializePrisma({
        kpis: {
          totalContacts,
          openTasks,
          activitiesThisMonth,
          inactiveContactsCount: inactiveContacts.length,
        },
        recentActivities,
        upcomingTasks,
        inactiveContacts,
      })
    );
  } catch (error) {
    logger.error({ err: error }, "Error fetching CRM dashboard");
    return NextResponse.json({ error: "Fehler beim Laden des Dashboards" }, { status: 500 });
  }
}
