/**
 * Available Funds API
 *
 * GET - List funds for a given tenant (for visibility configuration).
 * Optional parkId filter: only funds linked to that park via FundPark.
 * Includes fundCategory info for UI badges.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("management-billing:read");
    if (!check.authorized) return check.error;

    const enabled = await getConfigBoolean("management-billing.enabled", check.tenantId, false);
    if (!enabled) {
      return apiError("FEATURE_DISABLED", 404, { message: "Feature nicht aktiviert" });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");
    const parkId = searchParams.get("parkId");

    if (!tenantId) {
      return apiError("BAD_REQUEST", 400, { message: "tenantId ist erforderlich" });
    }

    // Non-superadmin can only see funds from their own tenant
    // or funds where they have a stakeholder entry
    if (check.tenantId && check.tenantId !== tenantId) {
      const hasAccess = await prisma.parkStakeholder.findFirst({
        where: {
          stakeholderTenantId: check.tenantId,
          parkTenantId: tenantId,
          isActive: true,
        },
      });
      if (!hasAccess) {
        return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
      }
    }

    const funds = await prisma.fund.findMany({
      where: {
        tenantId,
        ...(parkId ? { fundParks: { some: { parkId } } } : {}),
      },
      select: {
        id: true,
        name: true,
        legalForm: true,
        status: true,
        fundCategory: {
          select: {
            name: true,
            code: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const mapped = funds.map((f) => ({
      id: f.id,
      name: f.name,
      legalForm: f.legalForm,
      status: f.status,
      categoryName: f.fundCategory?.name ?? null,
      categoryCode: f.fundCategory?.code ?? null,
    }));

    return NextResponse.json({ funds: mapped });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] GET available-funds error");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Gesellschaften" });
  }
}
