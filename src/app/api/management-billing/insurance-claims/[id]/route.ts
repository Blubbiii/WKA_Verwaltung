/**
 * Insurance Claim Detail API
 *
 * GET    - Get claim details with all relations
 * PUT    - Update claim (auto-set resolvedAt on RESOLVED)
 * DELETE - Delete claim
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { ClaimStatus } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return NextResponse.json(
      { error: "Management-Billing Feature ist nicht aktiviert" },
      { status: 404 }
    );
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
      return NextResponse.json(
        { error: "Versicherungsmeldung nicht gefunden" },
        { status: 404 }
      );
    }

    // Access control
    if (check.tenantId && claim.tenantId !== check.tenantId) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
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
    return NextResponse.json(
      { error: "Fehler beim Laden der Versicherungsmeldung" },
      { status: 500 }
    );
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

    const existing = await prisma.insuranceClaim.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Versicherungsmeldung nicht gefunden" },
        { status: 404 }
      );
    }

    // Access control
    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    const {
      title,
      claimNumber,
      description,
      status,
      claimType,
      estimatedCostEur,
      actualCostEur,
      reimbursedEur,
      resolutionNotes,
      contractId,
      vendorId,
      defectId,
      parkId,
      turbineId,
    } = body;

    // Auto-set resolvedAt when status changes to RESOLVED
    let resolvedAt = undefined;
    if (status === "RESOLVED" as ClaimStatus && existing.status !== "RESOLVED") {
      resolvedAt = new Date();
    } else if (status && status !== "RESOLVED" && existing.status === "RESOLVED") {
      // Re-opening: clear resolvedAt
      resolvedAt = null;
    }

    const updated = await prisma.insuranceClaim.update({
      where: { id },
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
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Versicherungsmeldung" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Versicherungsmeldung nicht gefunden" },
        { status: 404 }
      );
    }

    // Access control
    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    await prisma.insuranceClaim.delete({
      where: { id },
    });

    logger.info(
      { claimId: id },
      "[Insurance] Claim deleted"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[Insurance] DELETE claim error");
    return NextResponse.json(
      { error: "Fehler beim Loeschen der Versicherungsmeldung" },
      { status: 500 }
    );
  }
}
