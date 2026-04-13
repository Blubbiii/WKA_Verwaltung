/**
 * Operational Task Detail API
 *
 * GET    - Get single task with relations
 * PUT    - Update task fields (auto-sets completedAt when status changes to DONE)
 * DELETE - Delete task
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const taskUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullish(),
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
  priority: z.number().int().optional(),
  taskType: z.string().optional(),
  category: z.string().nullish(),
  dueDate: z.string().nullish(),
  notes: z.string().nullish(),
  checklistData: z.any().nullish(),
  parkId: z.string().nullish(),
  turbineId: z.string().nullish(),
  checklistId: z.string().nullish(),
  assignedToId: z.string().nullish(),
  costEstimateEur: z.number().nullish(),
  actualCostEur: z.number().nullish(),
  benefitNotes: z.string().nullish(),
});

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return apiError("FEATURE_DISABLED", 404, { message: "Feature nicht aktiviert" });
  }
  return null;
}

// =============================================================================
// GET /api/management-billing/tasks/[id]
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

    const task = await prisma.operationalTask.findUnique({
      where: { id },
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        checklist: { select: { id: true, title: true, items: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!task) {
      return apiError("NOT_FOUND", 404, { message: "Aufgabe nicht gefunden" });
    }

    // Tenant access control
    if (check.tenantId && task.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    return NextResponse.json({
      task: {
        ...task,
        costEstimateEur: task.costEstimateEur ? Number(task.costEstimateEur) : null,
        actualCostEur: task.actualCostEur ? Number(task.actualCostEur) : null,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] GET task detail error");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Aufgabe" });
  }
}

// =============================================================================
// PUT /api/management-billing/tasks/[id]
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

    // Verify task exists and belongs to tenant
    const existing = await prisma.operationalTask.findUnique({
      where: { id },
      select: { id: true, tenantId: true, status: true },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Aufgabe nicht gefunden" });
    }

    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    const body = await request.json();
    const parsed = taskUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { title, description, status, priority, taskType, category, dueDate, notes, checklistData, parkId, turbineId, checklistId, assignedToId, costEstimateEur, actualCostEur, benefitNotes } = parsed.data;

    // Build update data - only include provided fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};

    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description || null;
    if (status !== undefined) data.status = status;
    if (priority !== undefined) data.priority = priority;
    if (taskType !== undefined) data.taskType = taskType;
    if (category !== undefined) data.category = category || null;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (notes !== undefined) data.notes = notes || null;
    if (checklistData !== undefined) data.checklistData = checklistData || null;
    if (parkId !== undefined) data.parkId = parkId || null;
    if (turbineId !== undefined) data.turbineId = turbineId || null;
    if (checklistId !== undefined) data.checklistId = checklistId || null;
    if (assignedToId !== undefined) data.assignedToId = assignedToId || null;
    if (costEstimateEur !== undefined) data.costEstimateEur = costEstimateEur ?? null;
    if (actualCostEur !== undefined) data.actualCostEur = actualCostEur ?? null;
    if (benefitNotes !== undefined) data.benefitNotes = benefitNotes || null;

    // Auto-set completedAt when status changes to DONE
    if (status === "DONE" && existing.status !== "DONE") {
      data.completedAt = new Date();
    }
    // Clear completedAt if status changes away from DONE
    if (status && status !== "DONE" && existing.status === "DONE") {
      data.completedAt = null;
    }

    const task = await prisma.operationalTask.update({
      where: { id },
      data,
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        checklist: { select: { id: true, title: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    logger.info(
      { taskId: task.id, updatedFields: Object.keys(data) },
      "[Management-Billing] Task updated"
    );

    return NextResponse.json({
      task: {
        ...task,
        costEstimateEur: task.costEstimateEur ? Number(task.costEstimateEur) : null,
        actualCostEur: task.actualCostEur ? Number(task.actualCostEur) : null,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] PUT task error");
    return apiError("UPDATE_FAILED", 500, { message: "Fehler beim Aktualisieren der Aufgabe" });
  }
}

// =============================================================================
// DELETE /api/management-billing/tasks/[id]
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

    // Verify task exists and belongs to tenant
    const existing = await prisma.operationalTask.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Aufgabe nicht gefunden" });
    }

    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    await prisma.operationalTask.delete({ where: { id } });

    logger.info(
      { taskId: id, tenantId: check.tenantId },
      "[Management-Billing] Task deleted"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] DELETE task error");
    return apiError("DELETE_FAILED", 500, { message: "Fehler beim Loeschen der Aufgabe" });
  }
}
