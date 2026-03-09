/**
 * Operational Checklist Detail API
 *
 * GET    - Get single checklist with park relation
 * PUT    - Update checklist
 * DELETE - Delete checklist (only if no tasks reference it)
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return NextResponse.json({ error: "Feature nicht aktiviert" }, { status: 404 });
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
      return NextResponse.json(
        { error: "Checkliste nicht gefunden" },
        { status: 404 }
      );
    }

    // Tenant access control
    if (check.tenantId && checklist.tenantId !== check.tenantId) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    return NextResponse.json({ checklist });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] GET checklist detail error");
    return NextResponse.json(
      { error: "Fehler beim Laden der Checkliste" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Checkliste nicht gefunden" },
        { status: 404 }
      );
    }

    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    const body = await request.json();

    const { title, description, items, recurrence, parkId, isActive } = body;

    // Validate title if provided
    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length === 0) {
        return NextResponse.json(
          { error: "title darf nicht leer sein" },
          { status: 400 }
        );
      }
      if (title.length > 200) {
        return NextResponse.json(
          { error: "title darf maximal 200 Zeichen lang sein" },
          { status: 400 }
        );
      }
    }

    // Validate items if provided
    if (items !== undefined && !Array.isArray(items)) {
      return NextResponse.json(
        { error: "items muss ein Array sein" },
        { status: 400 }
      );
    }

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
      where: { id },
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
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Checkliste" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Checkliste nicht gefunden" },
        { status: 404 }
      );
    }

    if (check.tenantId && existing.tenantId !== check.tenantId) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    // Check if any tasks reference this checklist
    const taskCount = await prisma.operationalTask.count({
      where: { checklistId: id },
    });

    if (taskCount > 0) {
      return NextResponse.json(
        {
          error: `Checkliste kann nicht geloescht werden, da ${taskCount} Aufgabe(n) sie referenzieren`,
        },
        { status: 409 }
      );
    }

    await prisma.operationalChecklist.delete({ where: { id } });

    logger.info(
      { checklistId: id, tenantId: check.tenantId },
      "[Management-Billing] Checklist deleted"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] DELETE checklist error");
    return NextResponse.json(
      { error: "Fehler beim Loeschen der Checkliste" },
      { status: 500 }
    );
  }
}
