/**
 * Management Billing API - List and Calculate
 *
 * GET  - List billings with filters
 * POST - Calculate billing for a stakeholder and period
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return NextResponse.json({ error: "Feature nicht aktiviert" }, { status: 404 });
  }
  return null;
}

// =============================================================================
// GET /api/management-billing/billings
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("management-billing:read");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");
    const month = searchParams.get("month");
    const status = searchParams.get("status");
    const stakeholderId = searchParams.get("stakeholderId");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (year) where.year = parseInt(year, 10);
    if (month) where.month = parseInt(month, 10);
    if (status) where.status = status;
    if (stakeholderId) where.stakeholderId = stakeholderId;

    // Always filter to own tenant's stakeholders (tenant context required)
    if (!check.tenantId) {
      return NextResponse.json(
        { error: "Mandanten-Kontext erforderlich" },
        { status: 403 }
      );
    }
    where.stakeholder = { stakeholderTenantId: check.tenantId };

    const billings = await prisma.managementBilling.findMany({
      where,
      include: {
        stakeholder: {
          select: {
            id: true,
            role: true,
            parkId: true,
            parkTenantId: true,
            stakeholderTenantId: true,
            stakeholderTenant: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    // Enrich with park names
    const enriched = await Promise.all(
      billings.map(async (b) => {
        const park = await prisma.park.findFirst({
          where: {
            id: b.stakeholder.parkId,
            tenantId: b.stakeholder.parkTenantId,
          },
          select: { name: true },
        });
        return {
          ...b,
          baseRevenueEur: Number(b.baseRevenueEur),
          feePercentageUsed: Number(b.feePercentageUsed),
          feeAmountNetEur: Number(b.feeAmountNetEur),
          taxRate: Number(b.taxRate),
          taxAmountEur: Number(b.taxAmountEur),
          feeAmountGrossEur: Number(b.feeAmountGrossEur),
          parkName: park?.name || "Unbekannt",
          providerName: b.stakeholder.stakeholderTenant.name,
        };
      })
    );

    return NextResponse.json({ billings: enriched });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] GET billings error");
    return NextResponse.json(
      { error: "Fehler beim Laden der Abrechnungen" },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/management-billing/billings - Calculate a billing
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("management-billing:calculate");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const body = await request.json();
    const { stakeholderId, year, month } = body;

    if (!stakeholderId || !year) {
      return NextResponse.json(
        { error: "stakeholderId und year sind erforderlich" },
        { status: 400 }
      );
    }

    // Verify stakeholder exists and belongs to user's tenant
    const stakeholder = await prisma.parkStakeholder.findUnique({
      where: { id: stakeholderId },
    });

    if (!stakeholder) {
      return NextResponse.json(
        { error: "Stakeholder nicht gefunden" },
        { status: 404 }
      );
    }

    if (check.tenantId && stakeholder.stakeholderTenantId !== check.tenantId) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    if (!stakeholder.billingEnabled) {
      return NextResponse.json(
        { error: "Abrechnung für diesen Stakeholder nicht aktiviert" },
        { status: 400 }
      );
    }

    // Dynamic import to avoid circular dependencies
    const { calculateAndSaveBilling } = await import(
      "@/lib/management-billing/calculator"
    );

    const { id, result } = await calculateAndSaveBilling({
      stakeholderId,
      year: parseInt(year, 10),
      month: month !== undefined && month !== null ? parseInt(month, 10) : null,
    });

    logger.info(
      { billingId: id, stakeholderId, year, month },
      "[Management-Billing] Billing calculated"
    );

    return NextResponse.json({ billingId: id, ...result }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler";
    logger.error({ err: error }, "[Management-Billing] POST billing error");
    return NextResponse.json(
      { error: `Fehler bei der Berechnung: ${message}` },
      { status: 500 }
    );
  }
}
