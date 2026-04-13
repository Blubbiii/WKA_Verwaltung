/**
 * Defect Detail API
 *
 * GET    - Get defect details with relations
 * PUT    - Update defect (auto-set resolvedAt on DONE)
 * DELETE - Delete defect (only if no insurance claims reference it)
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { OperationalTaskStatus } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const defectUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullish(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
  dueDate: z.string().nullish(),
  resolutionNotes: z.string().nullish(),
  costEstimateEur: z.number().nullish(),
  actualCostEur: z.number().nullish(),
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
// GET /api/management-billing/defects/[id]
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

    const defect = await prisma.defect.findUnique({
      where: { id },
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        inspectionReport: {
          select: { id: true, inspectionDate: true, inspector: true, result: true },
        },
        insuranceClaims: {
          select: {
            id: true,
            claimNumber: true,
            title: true,
            status: true,
            incidentDate: true,
          },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!defect) {
      return apiError("NOT_FOUND", 404, { message: "Mangel nicht gefunden" });
    }

    // Access control
    if (check.tenantId && defect.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    return NextResponse.json({
      defect: {
        ...defect,
        costEstimateEur: defect.costEstimateEur ? Number(defect.costEstimateEur) : null,
        actualCostEur: defect.actualCostEur ? Number(defect.actualCostEur) : null,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Inspections] GET defect detail error");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden des Mangels" });
  }
}

// =============================================================================
// PUT /api/management-billing/defects/[id]
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
    const parsed = defectUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { title, description, severity, status, dueDate, resolutionNotes, costEstimateEur, actualCostEur, parkId, turbineId } = parsed.data;

    const existing = await prisma.defect.findUnique({
      where: { id },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Mangel nicht gefunden" });
    }

    // Access control
    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    // Auto-set resolvedAt when status changes to DONE
    let resolvedAt = undefined;
    if (status === "DONE" as OperationalTaskStatus && existing.status !== "DONE") {
      resolvedAt = new Date();
    } else if (status && status !== "DONE" && existing.status === "DONE") {
      // Re-opening: clear resolvedAt
      resolvedAt = null;
    }

    const updated = await prisma.defect.update({
      where: { id, tenantId: check.tenantId!},
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(severity !== undefined && { severity }),
        ...(status !== undefined && { status }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(resolutionNotes !== undefined && { resolutionNotes }),
        ...(costEstimateEur !== undefined && { costEstimateEur }),
        ...(actualCostEur !== undefined && { actualCostEur }),
        ...(parkId !== undefined && { parkId: parkId || null }),
        ...(turbineId !== undefined && { turbineId: turbineId || null }),
        ...(resolvedAt !== undefined && { resolvedAt }),
      },
    });

    logger.info(
      { defectId: id, status: updated.status },
      "[Inspections] Defect updated"
    );

    return NextResponse.json({
      defect: {
        ...updated,
        costEstimateEur: updated.costEstimateEur ? Number(updated.costEstimateEur) : null,
        actualCostEur: updated.actualCostEur ? Number(updated.actualCostEur) : null,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Inspections] PUT defect error");
    return apiError("UPDATE_FAILED", 500, { message: "Fehler beim Aktualisieren des Mangels" });
  }
}

// =============================================================================
// DELETE /api/management-billing/defects/[id]
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

    const existing = await prisma.defect.findUnique({
      where: { id },
      include: {
        _count: { select: { insuranceClaims: true } },
      },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Mangel nicht gefunden" });
    }

    // Access control
    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    // Prevent deletion if insurance claims reference this defect
    if (existing._count.insuranceClaims > 0) {
      return apiError("OPERATION_NOT_ALLOWED", 409, { message: `Mangel kann nicht geloescht werden, da ${existing._count.insuranceClaims} Versicherungsmeldungen zugeordnet sind` });
    }

    await prisma.defect.delete({
      where: { id, tenantId: check.tenantId!},
    });

    logger.info(
      { defectId: id },
      "[Inspections] Defect deleted"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[Inspections] DELETE defect error");
    return apiError("DELETE_FAILED", 500, { message: "Fehler beim Loeschen des Mangels" });
  }
}
