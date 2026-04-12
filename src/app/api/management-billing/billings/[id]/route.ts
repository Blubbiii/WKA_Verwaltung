/**
 * Management Billing Detail API
 *
 * GET - Get billing detail with calculation breakdown
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return apiError("FEATURE_DISABLED", 404, { message: "Feature nicht aktiviert" });
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("management-billing:read");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const { id } = await params;

    const billing = await prisma.managementBilling.findUnique({
      where: { id },
      include: {
        stakeholder: {
          include: {
            stakeholderTenant: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
    });

    if (!billing) {
      return apiError("NOT_FOUND", 404, { message: "Abrechnung nicht gefunden" });
    }

    // Access control
    if (
      check.tenantId &&
      billing.stakeholder.stakeholderTenantId !== check.tenantId
    ) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    // Enrich with park name
    const park = await prisma.park.findFirst({
      where: {
        id: billing.stakeholder.parkId,
        tenantId: billing.stakeholder.parkTenantId,
      },
      select: { name: true },
    });

    return NextResponse.json({
      billing: {
        ...billing,
        baseRevenueEur: Number(billing.baseRevenueEur),
        feePercentageUsed: Number(billing.feePercentageUsed),
        feeAmountNetEur: Number(billing.feeAmountNetEur),
        taxRate: Number(billing.taxRate),
        taxAmountEur: Number(billing.taxAmountEur),
        feeAmountGrossEur: Number(billing.feeAmountGrossEur),
        stakeholder: {
          ...billing.stakeholder,
          feePercentage: billing.stakeholder.feePercentage
            ? Number(billing.stakeholder.feePercentage)
            : null,
        },
        parkName: park?.name || "Unbekannt",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] GET billing detail error");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Abrechnung" });
  }
}
