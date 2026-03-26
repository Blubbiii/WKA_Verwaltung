import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { withMonitoring } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const updateSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  type: z.enum(["PARK", "TURBINE", "FUND", "OVERHEAD", "CUSTOM"]).optional(),
  description: z.string().optional().nullable(),
  parkId: z.string().optional().nullable(),
  turbineId: z.string().optional().nullable(),
  fundId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

async function getHandler(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("wirtschaftsplan:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const costCenter = await prisma.costCenter.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        park: { select: { id: true, name: true } },
        turbine: { select: { id: true, designation: true } },
        fund: { select: { id: true, name: true } },
        parent: { select: { id: true, code: true, name: true } },
        children: { select: { id: true, code: true, name: true, type: true, isActive: true } },
        _count: { select: { budgetLines: true } },
      },
    });

    if (!costCenter) {
      return NextResponse.json({ error: "Kostenstelle nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json(costCenter);
  } catch (error) {
    logger.error({ err: error }, "Error fetching cost center");
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }
}

async function putHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("wirtschaftsplan:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const data = updateSchema.parse(body);

    const costCenter = await prisma.costCenter.updateMany({
      where: { id, tenantId: check.tenantId! },
      data,
    });

    if (costCenter.count === 0) {
      return NextResponse.json({ error: "Kostenstelle nicht gefunden" }, { status: 404 });
    }

    const updated = await prisma.costCenter.findFirst({ where: { id, tenantId: check.tenantId! } });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validierungsfehler", details: error.issues }, { status: 400 });
    }
    logger.error({ err: error }, "Error updating cost center");
    return NextResponse.json({ error: "Fehler beim Aktualisieren" }, { status: 500 });
  }
}

async function deleteHandler(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("wirtschaftsplan:delete");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const result = await prisma.costCenter.deleteMany({
      where: { id, tenantId: check.tenantId! },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Kostenstelle nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting cost center");
    return NextResponse.json({ error: "Fehler beim Löschen" }, { status: 500 });
  }
}

export const GET = withMonitoring(getHandler);
export const PUT = withMonitoring(putHandler);
export const DELETE = withMonitoring(deleteHandler);
