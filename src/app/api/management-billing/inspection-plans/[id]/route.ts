/**
 * Inspection Plan Detail API
 *
 * GET    - Get plan details with recent reports
 * PUT    - Update plan fields
 * DELETE - Delete plan
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const inspectionPlanUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullish(),
  recurrence: z.string().min(1).optional(),
  nextDueDate: z.string().optional(),
  parkId: z.string().nullish(),
  turbineId: z.string().nullish(),
  isActive: z.boolean().optional(),
});

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return apiError("NOT_FOUND", 404, { message: "Management-Billing Feature ist nicht aktiviert" });
  }
  return null;
}

// =============================================================================
// GET /api/management-billing/inspection-plans/[id]
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

    const plan = await prisma.inspectionPlan.findUnique({
      where: { id },
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        inspectionReports: {
          take: 5,
          orderBy: { inspectionDate: "desc" },
          include: {
            _count: { select: { defects: true } },
          },
        },
      },
    });

    if (!plan) {
      return apiError("NOT_FOUND", 404, { message: "Begehungsplan nicht gefunden" });
    }

    // Access control: non-superadmin can only see their own tenant's plans
    if (check.tenantId && plan.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    return NextResponse.json({ plan });
  } catch (error) {
    logger.error({ err: error }, "[Inspections] GET inspection-plan detail error");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden des Begehungsplans" });
  }
}

// =============================================================================
// PUT /api/management-billing/inspection-plans/[id]
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
    const parsed = inspectionPlanUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { title, description, recurrence, nextDueDate, parkId, turbineId, isActive } = parsed.data;

    const existing = await prisma.inspectionPlan.findUnique({
      where: { id },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Begehungsplan nicht gefunden" });
    }

    // Access control
    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    const updated = await prisma.inspectionPlan.update({
      where: { id, tenantId: check.tenantId!},
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(recurrence !== undefined && { recurrence }),
        ...(nextDueDate !== undefined && { nextDueDate: new Date(nextDueDate) }),
        ...(parkId !== undefined && { parkId: parkId || null }),
        ...(turbineId !== undefined && { turbineId: turbineId || null }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    logger.info(
      { planId: id },
      "[Inspections] Inspection plan updated"
    );

    return NextResponse.json({ plan: updated });
  } catch (error) {
    logger.error({ err: error }, "[Inspections] PUT inspection-plan error");
    return apiError("UPDATE_FAILED", 500, { message: "Fehler beim Aktualisieren des Begehungsplans" });
  }
}

// =============================================================================
// DELETE /api/management-billing/inspection-plans/[id]
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

    const existing = await prisma.inspectionPlan.findUnique({
      where: { id },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Begehungsplan nicht gefunden" });
    }

    // Access control
    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    await prisma.inspectionPlan.delete({
      where: { id, tenantId: check.tenantId!},
    });

    logger.info(
      { planId: id },
      "[Inspections] Inspection plan deleted"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[Inspections] DELETE inspection-plan error");
    return apiError("DELETE_FAILED", 500, { message: "Fehler beim Loeschen des Begehungsplans" });
  }
}
