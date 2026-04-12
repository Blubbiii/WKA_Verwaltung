/**
 * Insurance Claims API - List and Create
 *
 * GET  - List claims (filters: status, claimType, parkId, contractId, vendorId, dateFrom, dateTo)
 * POST - Create a new insurance claim
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { Prisma, ClaimStatus } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const claimCreateSchema = z.object({
  title: z.string().min(1),
  incidentDate: z.string().min(1),
  claimType: z.string().min(1),
  claimNumber: z.string().nullish(),
  description: z.string().nullish(),
  estimatedCostEur: z.number().nullish(),
  contractId: z.string().nullish(),
  vendorId: z.string().nullish(),
  defectId: z.string().nullish(),
  parkId: z.string().nullish(),
  turbineId: z.string().nullish(),
});

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
// GET /api/management-billing/insurance-claims
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("management-billing:read");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const claimType = searchParams.get("claimType");
    const parkId = searchParams.get("parkId");
    const contractId = searchParams.get("contractId");
    const vendorId = searchParams.get("vendorId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    // Build where clause
    const where: Prisma.InsuranceClaimWhereInput = {};

    // Tenant filter
    if (check.tenantId) {
      where.tenantId = check.tenantId;
    }

    if (status) where.status = status as ClaimStatus;
    if (claimType) where.claimType = claimType;
    if (parkId) where.parkId = parkId;
    if (contractId) where.contractId = contractId;
    if (vendorId) where.vendorId = vendorId;

    if (dateFrom || dateTo) {
      where.reportedDate = {};
      if (dateFrom) where.reportedDate.gte = new Date(dateFrom);
      if (dateTo) where.reportedDate.lte = new Date(dateTo);
    }

    const claims = await prisma.insuranceClaim.findMany({
      where,
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        contract: { select: { id: true, title: true, contractNumber: true } },
        vendor: { select: { id: true, name: true } },
        defect: { select: { id: true, title: true, severity: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { reportedDate: "desc" },
    });

    // Convert Decimal fields
    const enriched = claims.map((c) => ({
      ...c,
      estimatedCostEur: c.estimatedCostEur ? Number(c.estimatedCostEur) : null,
      actualCostEur: c.actualCostEur ? Number(c.actualCostEur) : null,
      reimbursedEur: c.reimbursedEur ? Number(c.reimbursedEur) : null,
    }));

    return NextResponse.json({ claims: enriched });
  } catch (error) {
    logger.error({ err: error }, "[Insurance] GET claims error");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Versicherungsmeldungen" });
  }
}

// =============================================================================
// POST /api/management-billing/insurance-claims
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("management-billing:create");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const body = await request.json();
    const parsed = claimCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { title, incidentDate, claimType, claimNumber, description, estimatedCostEur, contractId, vendorId, defectId, parkId, turbineId } = parsed.data;

    // Determine tenant
    const tenantId = check.tenantId;
    if (!tenantId) {
      return apiError("BAD_REQUEST", 400, { message: "Mandant konnte nicht ermittelt werden" });
    }

    const claim = await prisma.insuranceClaim.create({
      data: {
        tenantId,
        title,
        incidentDate: new Date(incidentDate),
        claimType,
        claimNumber: claimNumber || null,
        description: description || null,
        estimatedCostEur: estimatedCostEur ?? null,
        contractId: contractId || null,
        vendorId: vendorId || null,
        defectId: defectId || null,
        parkId: parkId || null,
        turbineId: turbineId || null,
        createdById: check.userId!,
      },
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        contract: { select: { id: true, title: true, contractNumber: true } },
        vendor: { select: { id: true, name: true } },
        defect: { select: { id: true, title: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    logger.info(
      { claimId: claim.id, claimType, title },
      "[Insurance] Claim created"
    );

    return NextResponse.json({
      claim: {
        ...claim,
        estimatedCostEur: claim.estimatedCostEur ? Number(claim.estimatedCostEur) : null,
        actualCostEur: claim.actualCostEur ? Number(claim.actualCostEur) : null,
        reimbursedEur: claim.reimbursedEur ? Number(claim.reimbursedEur) : null,
      },
    }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[Insurance] POST claim error");
    return apiError("CREATE_FAILED", 500, { message: "Fehler beim Erstellen der Versicherungsmeldung" });
  }
}
