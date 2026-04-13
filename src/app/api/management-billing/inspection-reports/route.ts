/**
 * Inspection Reports API - List and Create
 *
 * GET  - List reports (filters: parkId, turbineId, inspectionPlanId, result, dateFrom, dateTo)
 * POST - Create a new inspection report
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const reportCreateSchema = z.object({
  inspectionDate: z.string().min(1),
  inspectionPlanId: z.string().nullish(),
  serviceEventId: z.string().nullish(),
  inspector: z.string().nullish(),
  result: z.string().nullish(),
  summary: z.string().nullish(),
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
// GET /api/management-billing/inspection-reports
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
    const inspectionPlanId = searchParams.get("inspectionPlanId");
    const result = searchParams.get("result");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    // Build where clause
    const where: Prisma.InspectionReportWhereInput = {};

    // Tenant filter
    if (check.tenantId) {
      where.tenantId = check.tenantId;
    }

    if (parkId) where.parkId = parkId;
    if (turbineId) where.turbineId = turbineId;
    if (inspectionPlanId) where.inspectionPlanId = inspectionPlanId;
    if (result) where.result = result;

    if (dateFrom || dateTo) {
      where.inspectionDate = {};
      if (dateFrom) where.inspectionDate.gte = new Date(dateFrom);
      if (dateTo) where.inspectionDate.lte = new Date(dateTo);
    }

    const reports = await prisma.inspectionReport.findMany({
      where,
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        inspectionPlan: { select: { id: true, title: true } },
        _count: { select: { defects: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { inspectionDate: "desc" },
    });

    return NextResponse.json({ reports });
  } catch (error) {
    logger.error({ err: error }, "[Inspections] GET inspection-reports error");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Begehungsberichte" });
  }
}

// =============================================================================
// POST /api/management-billing/inspection-reports
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("management-billing:create");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const body = await request.json();
    const parsed = reportCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { inspectionDate, inspectionPlanId, serviceEventId, inspector, result, summary, parkId, turbineId } = parsed.data;

    // Determine tenant
    const tenantId = check.tenantId;
    if (!tenantId) {
      return apiError("BAD_REQUEST", 400, { message: "Mandant konnte nicht ermittelt werden" });
    }

    const report = await prisma.inspectionReport.create({
      data: {
        tenantId,
        inspectionDate: new Date(inspectionDate),
        inspectionPlanId: inspectionPlanId || null,
        serviceEventId: serviceEventId || null,
        inspector: inspector || null,
        result: result || null,
        summary: summary || null,
        parkId: parkId || null,
        turbineId: turbineId || null,
        createdById: check.userId!,
      },
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        inspectionPlan: { select: { id: true, title: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // If linked to an inspection plan, update lastExecuted
    if (inspectionPlanId) {
      await prisma.inspectionPlan.update({
        where: { id: inspectionPlanId, tenantId: check.tenantId!},
        data: { lastExecuted: new Date(inspectionDate) },
      });
    }

    logger.info(
      { reportId: report.id, inspectionPlanId },
      "[Inspections] Inspection report created"
    );

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[Inspections] POST inspection-report error");
    return apiError("CREATE_FAILED", 500, { message: "Fehler beim Erstellen des Begehungsberichts" });
  }
}
