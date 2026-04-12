/**
 * Inspection Plans API - List and Create
 *
 * GET  - List inspection plans (filters: parkId, turbineId, isActive, recurrence)
 * POST - Create a new inspection plan
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const inspectionPlanCreateSchema = z.object({
  title: z.string().min(1),
  recurrence: z.string().min(1),
  nextDueDate: z.string().min(1),
  description: z.string().nullish(),
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
// GET /api/management-billing/inspection-plans
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
    const isActive = searchParams.get("isActive");
    const recurrence = searchParams.get("recurrence");

    // Build where clause
    const where: Prisma.InspectionPlanWhereInput = {};

    // Tenant filter: non-superadmin sees only their tenant
    if (check.tenantId) {
      where.tenantId = check.tenantId;
    }

    if (parkId) where.parkId = parkId;
    if (turbineId) where.turbineId = turbineId;
    if (isActive !== null && isActive !== undefined) {
      where.isActive = isActive === "true";
    }
    if (recurrence) where.recurrence = recurrence;

    const plans = await prisma.inspectionPlan.findMany({
      where,
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        _count: { select: { inspectionReports: true } },
      },
      orderBy: { nextDueDate: "asc" },
    });

    return NextResponse.json({ plans });
  } catch (error) {
    logger.error({ err: error }, "[Inspections] GET inspection-plans error");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Begehungsplaene" });
  }
}

// =============================================================================
// POST /api/management-billing/inspection-plans
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("management-billing:create");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const body = await request.json();
    const parsed = inspectionPlanCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { title, recurrence, nextDueDate, description, parkId, turbineId } = parsed.data;

    // Determine tenant
    const tenantId = check.tenantId;
    if (!tenantId) {
      return apiError("BAD_REQUEST", 400, { message: "Mandant konnte nicht ermittelt werden" });
    }

    const plan = await prisma.inspectionPlan.create({
      data: {
        tenantId,
        title,
        description: description || null,
        recurrence,
        nextDueDate: new Date(nextDueDate),
        parkId: parkId || null,
        turbineId: turbineId || null,
      },
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
      },
    });

    logger.info(
      { planId: plan.id, title },
      "[Inspections] Inspection plan created"
    );

    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[Inspections] POST inspection-plan error");
    return apiError("CREATE_FAILED", 500, { message: "Fehler beim Erstellen des Begehungsplans" });
  }
}
