import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { withMonitoring } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["DRAFT", "APPROVED", "LOCKED"]).optional(),
  notes: z.string().optional().nullable(),
});

async function getHandler(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("wirtschaftsplan:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    const budget = await prisma.annualBudget.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        lines: {
          include: {
            costCenter: {
              select: { id: true, code: true, name: true, type: true },
            },
          },
          orderBy: [{ category: "asc" }, { costCenter: { code: "asc" } }],
        },
      },
    });

    if (!budget) {
      return NextResponse.json({ error: "Budgetplan nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json(budget);
  } catch (error) {
    logger.error({ err: error }, "Error fetching budget");
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

    // Check if budget exists and is not locked
    const existing = await prisma.annualBudget.findFirst({
      where: { id, tenantId: check.tenantId! },
    });
    if (!existing) {
      return NextResponse.json({ error: "Budgetplan nicht gefunden" }, { status: 404 });
    }
    if (existing.status === "LOCKED") {
      return NextResponse.json({ error: "Gesperrter Budget kann nicht bearbeitet werden" }, { status: 403 });
    }

    const body = await request.json();
    const data = updateSchema.parse(body);

    const updated = await prisma.annualBudget.update({
      where: { id, tenantId: check.tenantId! },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validierungsfehler", details: error.issues }, { status: 400 });
    }
    logger.error({ err: error }, "Error updating budget");
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

    const existing = await prisma.annualBudget.findFirst({
      where: { id, tenantId: check.tenantId! },
    });
    if (!existing) {
      return NextResponse.json({ error: "Budgetplan nicht gefunden" }, { status: 404 });
    }
    if (existing.status === "LOCKED") {
      return NextResponse.json({ error: "Gesperrter Budget kann nicht gelöscht werden" }, { status: 403 });
    }

    await prisma.annualBudget.delete({ where: { id, tenantId: check.tenantId! } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting budget");
    return NextResponse.json({ error: "Fehler beim Löschen" }, { status: 500 });
  }
}

export const GET = withMonitoring(getHandler);
export const PUT = withMonitoring(putHandler);
export const DELETE = withMonitoring(deleteHandler);
