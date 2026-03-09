/**
 * Inspection Report Detail API
 *
 * GET    - Get report details with defects
 * PUT    - Update report fields
 * DELETE - Delete report (only if no defects reference it)
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
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
      return NextResponse.json(
        { error: "Begehungsbericht nicht gefunden" },
        { status: 404 }
      );
    }

    // Access control
    if (check.tenantId && report.tenantId !== check.tenantId) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
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
    return NextResponse.json(
      { error: "Fehler beim Laden des Begehungsberichts" },
      { status: 500 }
    );
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

    const existing = await prisma.inspectionReport.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Begehungsbericht nicht gefunden" },
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

    const { inspectionDate, inspector, result, summary, parkId, turbineId } = body;

    const updated = await prisma.inspectionReport.update({
      where: { id },
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
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Begehungsberichts" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Begehungsbericht nicht gefunden" },
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

    // Prevent deletion if defects reference this report
    if (existing._count.defects > 0) {
      return NextResponse.json(
        { error: `Begehungsbericht kann nicht geloescht werden, da ${existing._count.defects} Maengel zugeordnet sind` },
        { status: 409 }
      );
    }

    await prisma.inspectionReport.delete({
      where: { id },
    });

    logger.info(
      { reportId: id },
      "[Inspections] Inspection report deleted"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[Inspections] DELETE inspection-report error");
    return NextResponse.json(
      { error: "Fehler beim Loeschen des Begehungsberichts" },
      { status: 500 }
    );
  }
}
