/**
 * Defects API - List and Create
 *
 * GET  - List defects (filters: parkId, turbineId, severity, status, inspectionReportId)
 * POST - Create a new defect
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { Prisma, DefectSeverity, OperationalTaskStatus } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const defectCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullish(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional().default("MEDIUM"),
  dueDate: z.string().nullish(),
  costEstimateEur: z.number().nullish(),
  inspectionReportId: z.string().nullish(),
  parkId: z.string().nullish(),
  turbineId: z.string().nullish(),
});

// =============================================================================
// Feature Flag Check
// =============================================================================

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
// GET /api/management-billing/defects
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("management-billing:read");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");
    const turbineId = searchParams.get("turbineId");
    const severity = searchParams.get("severity");
    const status = searchParams.get("status");
    const inspectionReportId = searchParams.get("inspectionReportId");

    // Build where clause
    const where: Prisma.DefectWhereInput = {};

    // Tenant filter
    if (check.tenantId) {
      where.tenantId = check.tenantId;
    }

    if (parkId) where.parkId = parkId;
    if (turbineId) where.turbineId = turbineId;
    if (severity) where.severity = severity as DefectSeverity;
    if (status) where.status = status as OperationalTaskStatus;
    if (inspectionReportId) where.inspectionReportId = inspectionReportId;

    const defects = await prisma.defect.findMany({
      where,
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        inspectionReport: { select: { id: true, inspectionDate: true, inspector: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [
        { severity: "desc" },
        { dueDate: "asc" },
      ],
    });

    // Convert Decimal fields
    const enriched = defects.map((d) => ({
      ...d,
      costEstimateEur: d.costEstimateEur ? Number(d.costEstimateEur) : null,
      actualCostEur: d.actualCostEur ? Number(d.actualCostEur) : null,
    }));

    return NextResponse.json({ defects: enriched });
  } catch (error) {
    logger.error({ err: error }, "[Inspections] GET defects error");
    return NextResponse.json(
      { error: "Fehler beim Laden der Maengel" },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/management-billing/defects
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("management-billing:create");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const body = await request.json();
    const parsed = defectCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { title, description, severity, dueDate, costEstimateEur, inspectionReportId, parkId, turbineId } = parsed.data;

    // Determine tenant
    const tenantId = check.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { error: "Mandant konnte nicht ermittelt werden" },
        { status: 400 }
      );
    }

    const defect = await prisma.defect.create({
      data: {
        tenantId,
        title,
        description: description || null,
        severity,
        dueDate: dueDate ? new Date(dueDate) : null,
        costEstimateEur: costEstimateEur ?? null,
        inspectionReportId: inspectionReportId || null,
        parkId: parkId || null,
        turbineId: turbineId || null,
        createdById: check.userId!,
      },
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        inspectionReport: { select: { id: true, inspectionDate: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    logger.info(
      { defectId: defect.id, title, severity: defect.severity },
      "[Inspections] Defect created"
    );

    return NextResponse.json({
      defect: {
        ...defect,
        costEstimateEur: defect.costEstimateEur ? Number(defect.costEstimateEur) : null,
        actualCostEur: defect.actualCostEur ? Number(defect.actualCostEur) : null,
      },
    }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[Inspections] POST defect error");
    return NextResponse.json(
      { error: "Fehler beim Erstellen des Mangels" },
      { status: 500 }
    );
  }
}
