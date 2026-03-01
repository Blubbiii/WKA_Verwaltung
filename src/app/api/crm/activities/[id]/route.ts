import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(["DONE", "PENDING", "CANCELLED"]).optional(),
  direction: z.enum(["INBOUND", "OUTBOUND"]).optional().nullable(),
  duration: z.number().int().positive().optional().nullable(),
  startTime: z.string().datetime().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
});

// GET /api/crm/activities/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("crm:read");
    if (!check.authorized) return check.error;
    if (!await getConfigBoolean("crm.enabled", check.tenantId, false))
      return NextResponse.json({ error: "CRM nicht aktiviert" }, { status: 404 });
    const { id } = await params;

    const activity = await prisma.crmActivity.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        person: { select: { id: true, firstName: true, lastName: true } },
        fund: { select: { id: true, name: true } },
        lease: { select: { id: true, lessor: { select: { firstName: true, lastName: true } } } },
        park: { select: { id: true, name: true } },
      },
    });

    if (!activity) {
      return NextResponse.json({ error: "Aktivität nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json(serializePrisma(activity));
  } catch (error) {
    logger.error({ err: error }, "Error fetching CRM activity");
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }
}

// PUT /api/crm/activities/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("crm:update");
    if (!check.authorized) return check.error;
    if (!await getConfigBoolean("crm.enabled", check.tenantId, false))
      return NextResponse.json({ error: "CRM nicht aktiviert" }, { status: 404 });
    const { id } = await params;

    const existing = await prisma.crmActivity.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
    });
    if (!existing) {
      return NextResponse.json({ error: "Aktivität nicht gefunden" }, { status: 404 });
    }

    const raw = await request.json();
    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const updated = await prisma.crmActivity.update({
      where: { id },
      data: {
        ...(d.title !== undefined && { title: d.title }),
        ...(d.description !== undefined && { description: d.description }),
        ...(d.status !== undefined && { status: d.status }),
        ...(d.direction !== undefined && { direction: d.direction }),
        ...(d.duration !== undefined && { duration: d.duration }),
        ...(d.startTime !== undefined && { startTime: d.startTime ? new Date(d.startTime) : null }),
        ...(d.dueDate !== undefined && { dueDate: d.dueDate ? new Date(d.dueDate) : null }),
        ...(d.assignedToId !== undefined && { assignedToId: d.assignedToId }),
      },
    });

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error updating CRM activity");
    return NextResponse.json({ error: "Fehler beim Aktualisieren" }, { status: 500 });
  }
}

// DELETE /api/crm/activities/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("crm:delete");
    if (!check.authorized) return check.error;
    if (!await getConfigBoolean("crm.enabled", check.tenantId, false))
      return NextResponse.json({ error: "CRM nicht aktiviert" }, { status: 404 });
    const { id } = await params;

    const existing = await prisma.crmActivity.findFirst({
      where: { id, tenantId: check.tenantId!, deletedAt: null },
    });
    if (!existing) {
      return NextResponse.json({ error: "Aktivität nicht gefunden" }, { status: 404 });
    }

    await prisma.crmActivity.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting CRM activity");
    return NextResponse.json({ error: "Fehler beim Löschen" }, { status: 500 });
  }
}
