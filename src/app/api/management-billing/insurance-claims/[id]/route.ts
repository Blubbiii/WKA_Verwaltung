/**
 * Insurance Claim Detail API
 *
 * GET    - Get claim details with all relations
 * PUT    - Update claim (auto-set resolvedAt on RESOLVED)
 * DELETE - Delete claim
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { ClaimStatus } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const claimUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  claimNumber: z.string().nullish(),
  description: z.string().nullish(),
  status: z.enum(["REPORTED", "CLAIM_IN_PROGRESS", "RESOLVED", "REJECTED"]).optional(),
  claimType: z.string().optional(),
  estimatedCostEur: z.number().nullish(),
  actualCostEur: z.number().nullish(),
  reimbursedEur: z.number().nullish(),
  resolutionNotes: z.string().nullish(),
  contractId: z.string().nullish(),
  vendorId: z.string().nullish(),
  defectId: z.string().nullish(),
  parkId: z.string().nullish(),
  turbineId: z.string().nullish(),
});

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return apiError("NOT_FOUND", 404, { message: "Management-Billing Feature ist nicht aktiviert" });
  }
  return null;
}

// =============================================================================
// GET /api/management-billing/insurance-claims/[id]
// =============================================================================

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

    const claim = await prisma.insuranceClaim.findUnique({
      where: { id },
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        contract: {
          select: {
            id: true,
            title: true,
            contractNumber: true,
            contractType: true,
            status: true,
          },
        },
        vendor: { select: { id: true, name: true, email: true } },
        defect: {
          select: {
            id: true,
            title: true,
            severity: true,
            status: true,
            costEstimateEur: true,
          },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!claim) {
      return apiError("NOT_FOUND", 404, { message: "Versicherungsmeldung nicht gefunden" });
    }

    // Access control
    if (check.tenantId && claim.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    return NextResponse.json({
      claim: {
        ...claim,
        estimatedCostEur: claim.estimatedCostEur ? Number(claim.estimatedCostEur) : null,
        actualCostEur: claim.actualCostEur ? Number(claim.actualCostEur) : null,
        reimbursedEur: claim.reimbursedEur ? Number(claim.reimbursedEur) : null,
        defect: claim.defect
          ? {
              ...claim.defect,
              costEstimateEur: claim.defect.costEstimateEur
                ? Number(claim.defect.costEstimateEur)
                : null,
            }
          : null,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Insurance] GET claim detail error");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Versicherungsmeldung" });
  }
}

// =============================================================================
// PUT /api/management-billing/insurance-claims/[id]
// =============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("management-billing:create");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const { id } = await params;
    const body = await request.json();
    const parsed = claimUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { title, claimNumber, description, status, claimType, estimatedCostEur, actualCostEur, reimbursedEur, resolutionNotes, contractId, vendorId, defectId, parkId, turbineId } = parsed.data;

    const existing = await prisma.insuranceClaim.findUnique({
      where: { id },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Versicherungsmeldung nicht gefunden" });
    }

    // Access control
    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    // Auto-set resolvedAt when status changes to RESOLVED
    let resolvedAt = undefined;
    if (status === "RESOLVED" as ClaimStatus && existing.status !== "RESOLVED") {
      resolvedAt = new Date();
    } else if (status && status !== "RESOLVED" && existing.status === "RESOLVED") {
      // Re-opening: clear resolvedAt
      resolvedAt = null;
    }

    const updated = await prisma.insuranceClaim.update({
      where: { id, tenantId: check.tenantId!},
      data: {
        ...(title !== undefined && { title }),
        ...(claimNumber !== undefined && { claimNumber }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(claimType !== undefined && { claimType }),
        ...(estimatedCostEur !== undefined && { estimatedCostEur }),
        ...(actualCostEur !== undefined && { actualCostEur }),
        ...(reimbursedEur !== undefined && { reimbursedEur }),
        ...(resolutionNotes !== undefined && { resolutionNotes }),
        ...(contractId !== undefined && { contractId: contractId || null }),
        ...(vendorId !== undefined && { vendorId: vendorId || null }),
        ...(defectId !== undefined && { defectId: defectId || null }),
        ...(parkId !== undefined && { parkId: parkId || null }),
        ...(turbineId !== undefined && { turbineId: turbineId || null }),
        ...(resolvedAt !== undefined && { resolvedAt }),
      },
    });

    logger.info(
      { claimId: id, status: updated.status },
      "[Insurance] Claim updated"
    );

    return NextResponse.json({
      claim: {
        ...updated,
        estimatedCostEur: updated.estimatedCostEur ? Number(updated.estimatedCostEur) : null,
        actualCostEur: updated.actualCostEur ? Number(updated.actualCostEur) : null,
        reimbursedEur: updated.reimbursedEur ? Number(updated.reimbursedEur) : null,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Insurance] PUT claim error");
    return apiError("UPDATE_FAILED", 500, { message: "Fehler beim Aktualisieren der Versicherungsmeldung" });
  }
}

// =============================================================================
// DELETE /api/management-billing/insurance-claims/[id]
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("management-billing:create");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const { id } = await params;

    const existing = await prisma.insuranceClaim.findUnique({
      where: { id },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Versicherungsmeldung nicht gefunden" });
    }

    // Access control
    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    await prisma.insuranceClaim.delete({
      where: { id, tenantId: check.tenantId!},
    });

    logger.info(
      { claimId: id },
      "[Insurance] Claim deleted"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[Insurance] DELETE claim error");
    return apiError("DELETE_FAILED", 500, { message: "Fehler beim Loeschen der Versicherungsmeldung" });
  }
}
