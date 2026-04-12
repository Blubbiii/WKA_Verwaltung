/**
 * Insurance Policies API - Read Only
 *
 * GET - List contracts with contractType = "INSURANCE" for the current tenant
 *
 * This is a read-only view over the existing Contract model,
 * filtering to insurance-type contracts only.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// Feature Flag Check
// =============================================================================

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return apiError("NOT_FOUND", 404, { message: "Management-Billing Feature ist nicht aktiviert" });
  }
  return null;
}

// =============================================================================
// GET /api/management-billing/insurance-policies
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("management-billing:read");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");
    const status = searchParams.get("status");

    // Build where clause - always filter to INSURANCE type
    const where: Prisma.ContractWhereInput = {
      contractType: "INSURANCE",
    };

    // Tenant filter
    if (check.tenantId) {
      where.tenantId = check.tenantId;
    }

    if (parkId) where.parkId = parkId;
    if (status) where.status = status as Prisma.EnumContractStatusFilter;

    const policies = await prisma.contract.findMany({
      where,
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        fund: { select: { id: true, name: true } },
        partner: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { endDate: "asc" },
    });

    // Convert Decimal fields
    const enriched = policies.map((p) => ({
      ...p,
      annualValue: p.annualValue ? Number(p.annualValue) : null,
    }));

    return NextResponse.json({ policies: enriched });
  } catch (error) {
    logger.error({ err: error }, "[Insurance] GET policies error");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Versicherungsvertraege" });
  }
}
