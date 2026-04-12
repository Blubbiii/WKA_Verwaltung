import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
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
      return apiError("NOT_FOUND", 404, { message: "Budgetplan nicht gefunden" });
    }

    return NextResponse.json(budget);
  } catch (error) {
    logger.error({ err: error }, "Error fetching budget");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden" });
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
      return apiError("NOT_FOUND", 404, { message: "Budgetplan nicht gefunden" });
    }
    if (existing.status === "LOCKED") {
      return apiError("OPERATION_NOT_ALLOWED", 403, { message: "Gesperrter Budget kann nicht bearbeitet werden" });
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
      return apiError("VALIDATION_FAILED", 400, { message: "Validierungsfehler", details: error.issues });
    }
    logger.error({ err: error }, "Error updating budget");
    return apiError("UPDATE_FAILED", 500, { message: "Fehler beim Aktualisieren" });
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
      return apiError("NOT_FOUND", 404, { message: "Budgetplan nicht gefunden" });
    }
    if (existing.status === "LOCKED") {
      return apiError("OPERATION_NOT_ALLOWED", 403, { message: "Gesperrter Budget kann nicht gelöscht werden" });
    }

    await prisma.annualBudget.delete({ where: { id, tenantId: check.tenantId! } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting budget");
    return apiError("DELETE_FAILED", 500, { message: "Fehler beim Löschen" });
  }
}

export const GET = withMonitoring(getHandler);
export const PUT = withMonitoring(putHandler);
export const DELETE = withMonitoring(deleteHandler);
