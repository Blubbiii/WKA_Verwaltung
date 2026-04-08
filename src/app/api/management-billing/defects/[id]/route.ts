/**
 * Defect Detail API
 *
 * GET    - Get defect details with relations
 * PUT    - Update defect (auto-set resolvedAt on DONE)
 * DELETE - Delete defect (only if no insurance claims reference it)
 */

import { NextRequest, NextResponse } from "next/server";
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
    return NextResponse.json(
      { error: "Management-Billing Feature ist nicht aktiviert" },
      { status: 404 }
    );
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
      return NextResponse.json(
        { error: "Mangel nicht gefunden" },
        { status: 404 }
      );
    }

    // Access control
    if (check.tenantId && defect.tenantId !== check.tenantId) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
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
    return NextResponse.json(
      { error: "Fehler beim Laden des Mangels" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { title, description, severity, status, dueDate, resolutionNotes, costEstimateEur, actualCostEur, parkId, turbineId } = parsed.data;

    const existing = await prisma.defect.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Mangel nicht gefunden" },
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

    // Auto-set resolvedAt when status changes to DONE
    let resolvedAt = undefined;
    if (status === "DONE" as OperationalTaskStatus && existing.status !== "DONE") {
      resolvedAt = new Date();
    } else if (status && status !== "DONE" && existing.status === "DONE") {
      // Re-opening: clear resolvedAt
      resolvedAt = null;
    }

    const updated = await prisma.defect.update({
      where: { id },
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
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Mangels" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Mangel nicht gefunden" },
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

    // Prevent deletion if insurance claims reference this defect
    if (existing._count.insuranceClaims > 0) {
      return NextResponse.json(
        { error: `Mangel kann nicht geloescht werden, da ${existing._count.insuranceClaims} Versicherungsmeldungen zugeordnet sind` },
        { status: 409 }
      );
    }

    await prisma.defect.delete({
      where: { id },
    });

    logger.info(
      { defectId: id },
      "[Inspections] Defect deleted"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[Inspections] DELETE defect error");
    return NextResponse.json(
      { error: "Fehler beim Loeschen des Mangels" },
      { status: 500 }
    );
  }
}
