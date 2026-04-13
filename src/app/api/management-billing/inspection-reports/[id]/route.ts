/**
 * Inspection Report Detail API
 *
 * GET    - Get report details with defects
 * PUT    - Update report fields
 * DELETE - Delete report (only if no defects reference it)
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const reportUpdateSchema = z.object({
  inspectionDate: z.string().optional(),
  inspector: z.string().nullish(),
  result: z.string().nullish(),
  summary: z.string().nullish(),
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
// GET /api/management-billing/inspection-reports/[id]
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

    const report = await prisma.inspectionReport.findUnique({
      where: { id },
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        inspectionPlan: { select: { id: true, title: true } },
        defects: {
          include: {
            park: { select: { id: true, name: true } },
            turbine: { select: { id: true, designation: true } },
          },
          orderBy: { severity: "desc" },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!report) {
      return apiError("NOT_FOUND", 404, { message: "Begehungsbericht nicht gefunden" });
    }

    // Access control
    if (check.tenantId && report.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    // Convert Decimal fields in defects
    const enrichedReport = {
      ...report,
      defects: report.defects.map((d) => ({
        ...d,
        costEstimateEur: d.costEstimateEur ? Number(d.costEstimateEur) : null,
        actualCostEur: d.actualCostEur ? Number(d.actualCostEur) : null,
      })),
    };

    return NextResponse.json({ report: enrichedReport });
  } catch (error) {
    logger.error({ err: error }, "[Inspections] GET inspection-report detail error");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden des Begehungsberichts" });
  }
}

// =============================================================================
// PUT /api/management-billing/inspection-reports/[id]
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
    const parsed = reportUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { inspectionDate, inspector, result, summary, parkId, turbineId } = parsed.data;

    const existing = await prisma.inspectionReport.findUnique({
      where: { id },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Begehungsbericht nicht gefunden" });
    }

    // Access control
    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    const updated = await prisma.inspectionReport.update({
      where: { id, tenantId: check.tenantId!},
      data: {
        ...(inspectionDate !== undefined && { inspectionDate: new Date(inspectionDate) }),
        ...(inspector !== undefined && { inspector }),
        ...(result !== undefined && { result }),
        ...(summary !== undefined && { summary }),
        ...(parkId !== undefined && { parkId: parkId || null }),
        ...(turbineId !== undefined && { turbineId: turbineId || null }),
      },
    });

    logger.info(
      { reportId: id },
      "[Inspections] Inspection report updated"
    );

    return NextResponse.json({ report: updated });
  } catch (error) {
    logger.error({ err: error }, "[Inspections] PUT inspection-report error");
    return apiError("UPDATE_FAILED", 500, { message: "Fehler beim Aktualisieren des Begehungsberichts" });
  }
}

// =============================================================================
// DELETE /api/management-billing/inspection-reports/[id]
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

    const existing = await prisma.inspectionReport.findUnique({
      where: { id },
      include: {
        _count: { select: { defects: true } },
      },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Begehungsbericht nicht gefunden" });
    }

    // Access control
    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    // Prevent deletion if defects reference this report
    if (existing._count.defects > 0) {
      return apiError("OPERATION_NOT_ALLOWED", 409, { message: `Begehungsbericht kann nicht geloescht werden, da ${existing._count.defects} Maengel zugeordnet sind` });
    }

    await prisma.inspectionReport.delete({
      where: { id, tenantId: check.tenantId!},
    });

    logger.info(
      { reportId: id },
      "[Inspections] Inspection report deleted"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[Inspections] DELETE inspection-report error");
    return apiError("DELETE_FAILED", 500, { message: "Fehler beim Loeschen des Begehungsberichts" });
  }
}
