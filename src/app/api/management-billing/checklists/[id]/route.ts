/**
 * Operational Checklist Detail API
 *
 * GET    - Get single checklist with park relation
 * PUT    - Update checklist
 * DELETE - Delete checklist (only if no tasks reference it)
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const checklistUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullish(),
  items: z.array(z.any()).optional(),
  recurrence: z.string().nullish(),
  parkId: z.string().nullish(),
  isActive: z.boolean().optional(),
});

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return apiError("FEATURE_DISABLED", 404, { message: "Feature nicht aktiviert" });
  }
  return null;
}

// =============================================================================
// GET /api/management-billing/checklists/[id]
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

    const checklist = await prisma.operationalChecklist.findUnique({
      where: { id },
      include: {
        park: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
    });

    if (!checklist) {
      return apiError("NOT_FOUND", 404, { message: "Checkliste nicht gefunden" });
    }

    // Tenant access control
    if (check.tenantId && checklist.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    return NextResponse.json({ checklist });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] GET checklist detail error");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Checkliste" });
  }
}

// =============================================================================
// PUT /api/management-billing/checklists/[id]
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

    // Verify checklist exists and belongs to tenant
    const existing = await prisma.operationalChecklist.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Checkliste nicht gefunden" });
    }

    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    const body = await request.json();
    const parsed = checklistUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { title, description, items, recurrence, parkId, isActive } = parsed.data;

    // Build update data - only include provided fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};

    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description || null;
    if (items !== undefined) data.items = items;
    if (recurrence !== undefined) data.recurrence = recurrence || null;
    if (parkId !== undefined) data.parkId = parkId || null;
    if (isActive !== undefined) data.isActive = isActive;

    const checklist = await prisma.operationalChecklist.update({
      where: { id, tenantId: check.tenantId!},
      data,
      include: {
        park: { select: { id: true, name: true } },
        _count: { select: { tasks: true } },
      },
    });

    logger.info(
      { checklistId: checklist.id, updatedFields: Object.keys(data) },
      "[Management-Billing] Checklist updated"
    );

    return NextResponse.json({ checklist });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] PUT checklist error");
    return apiError("UPDATE_FAILED", 500, { message: "Fehler beim Aktualisieren der Checkliste" });
  }
}

// =============================================================================
// DELETE /api/management-billing/checklists/[id]
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

    // Verify checklist exists and belongs to tenant
    const existing = await prisma.operationalChecklist.findUnique({
      where: { id },
      select: { id: true, tenantId: true },

    });

    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Checkliste nicht gefunden" });
    }

    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    // Check if any tasks reference this checklist
    const taskCount = await prisma.operationalTask.count({
      where: { checklistId: id },
    });

    if (taskCount > 0) {
      return apiError("OPERATION_NOT_ALLOWED", 409, { message: `Checkliste kann nicht geloescht werden, da ${taskCount} Aufgabe(n) sie referenzieren` });
    }

    await prisma.operationalChecklist.delete({ where: { id, tenantId: check.tenantId!} });

    logger.info(
      { checklistId: id, tenantId: check.tenantId },
      "[Management-Billing] Checklist deleted"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] DELETE checklist error");
    return apiError("DELETE_FAILED", 500, { message: "Fehler beim Loeschen der Checkliste" });
  }
}
