/**
 * Management Billing Overview API
 *
 * GET - Dashboard KPIs and summary data
 */

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";

export async function GET() {
  try {
    const check = await requirePermission("management-billing:read");
    if (!check.authorized) return check.error;

    const enabled = await getConfigBoolean("management-billing.enabled", check.tenantId, false);
    if (!enabled) {
      return NextResponse.json({ error: "Feature nicht aktiviert" }, { status: 404 });
    }

    // Tenant filter for non-superadmin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stakeholderWhere: any = { isActive: true };
    if (check.tenantId) {
      stakeholderWhere.stakeholderTenantId = check.tenantId;
    }

    // Active stakeholder count
    const activeStakeholders = await prisma.parkStakeholder.count({
      where: stakeholderWhere,
    });

    // Billing-enabled stakeholders
    const billingEnabled = await prisma.parkStakeholder.count({
      where: { ...stakeholderWhere, billingEnabled: true },
    });

    // Billing stats for current year
    const currentYear = new Date().getFullYear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const billingWhere: any = { year: currentYear };
    if (check.tenantId) {
      billingWhere.stakeholder = { stakeholderTenantId: check.tenantId };
    }

    const billings = await prisma.managementBilling.findMany({
      where: billingWhere,
      select: {
        status: true,
        feeAmountNetEur: true,
        feeAmountGrossEur: true,
      },
    });

    const totalBillings = billings.length;
    const draftCount = billings.filter((b) => b.status === "DRAFT").length;
    const calculatedCount = billings.filter((b) => b.status === "CALCULATED").length;
    const invoicedCount = billings.filter((b) => b.status === "INVOICED").length;

    const totalNetEur = billings
      .filter((b) => b.status !== "CANCELLED")
      .reduce((sum, b) => sum + Number(b.feeAmountNetEur), 0);

    const totalGrossEur = billings
      .filter((b) => b.status !== "CANCELLED")
      .reduce((sum, b) => sum + Number(b.feeAmountGrossEur), 0);

    const invoicedNetEur = billings
      .filter((b) => b.status === "INVOICED")
      .reduce((sum, b) => sum + Number(b.feeAmountNetEur), 0);

    // Recent billings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentWhere: any = {};
    if (check.tenantId) {
      recentWhere.stakeholder = { stakeholderTenantId: check.tenantId };
    }

    const recentBillings = await prisma.managementBilling.findMany({
      where: recentWhere,
      include: {
        stakeholder: {
          select: {
            role: true,
            parkId: true,
            parkTenantId: true,
            stakeholderTenant: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Enrich recent billings with park names
    const enrichedRecent = await Promise.all(
      recentBillings.map(async (b) => {
        const park = await prisma.park.findFirst({
          where: { id: b.stakeholder.parkId, tenantId: b.stakeholder.parkTenantId },
          select: { name: true },
        });
        return {
          id: b.id,
          year: b.year,
          month: b.month,
          status: b.status,
          feeAmountNetEur: Number(b.feeAmountNetEur),
          feeAmountGrossEur: Number(b.feeAmountGrossEur),
          parkName: park?.name || "Unbekannt",
          providerName: b.stakeholder.stakeholderTenant.name,
          role: b.stakeholder.role,
          createdAt: b.createdAt,
        };
      })
    );

    return NextResponse.json({
      overview: {
        activeStakeholders,
        billingEnabled,
        currentYear,
        totalBillings,
        statusCounts: {
          draft: draftCount,
          calculated: calculatedCount,
          invoiced: invoicedCount,
        },
        totalNetEur: Math.round(totalNetEur * 100) / 100,
        totalGrossEur: Math.round(totalGrossEur * 100) / 100,
        invoicedNetEur: Math.round(invoicedNetEur * 100) / 100,
        recentBillings: enrichedRecent,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] GET overview error");
    return NextResponse.json(
      { error: "Fehler beim Laden der Uebersicht" },
      { status: 500 }
    );
  }
}
