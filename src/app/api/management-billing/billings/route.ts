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
import { Prisma, ManagementBillingStatus } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const billingCreateSchema = z.object({
  stakeholderId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12).nullish(),
});

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

    const where: Prisma.ManagementBillingWhereInput = {};

    if (year) where.year = parseInt(year, 10);
    if (month) where.month = parseInt(month, 10);
    if (status) where.status = status as ManagementBillingStatus;
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

    // Batch-load park names to avoid N+1 queries
    const parkIds = [...new Set(billings.map((b) => b.stakeholder.parkId).filter(Boolean))];
    const parks = await prisma.park.findMany({
      where: { id: { in: parkIds } },
      select: { id: true, name: true },
    });
    const parkMap = new Map(parks.map((p) => [p.id, p.name]));

    const enriched = billings.map((b) => ({
      ...b,
      baseRevenueEur: Number(b.baseRevenueEur),
      feePercentageUsed: Number(b.feePercentageUsed),
      feeAmountNetEur: Number(b.feeAmountNetEur),
      taxRate: Number(b.taxRate),
      taxAmountEur: Number(b.taxAmountEur),
      feeAmountGrossEur: Number(b.feeAmountGrossEur),
      parkName: parkMap.get(b.stakeholder.parkId) || "Unbekannt",
      providerName: b.stakeholder.stakeholderTenant.name,
    }));

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
    const parsed = billingCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { stakeholderId, year, month } = parsed.data;

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
      year,
      month: month ?? null,
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
