import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { withMonitoring } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import { Prisma } from "@prisma/client";

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
      return apiError("NOT_FOUND", 404, { message: "Kostenstelle nicht gefunden" });
    }

    return NextResponse.json(costCenter);
  } catch (error) {
    logger.error({ err: error }, "Error fetching cost center");
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
    const body = await request.json();
    const data = updateSchema.parse(body);

    const costCenter = await prisma.costCenter.updateMany({
      where: { id, tenantId: check.tenantId! },
      data,
    });

    if (costCenter.count === 0) {
      return apiError("NOT_FOUND", 404, { message: "Kostenstelle nicht gefunden" });
    }

    const updated = await prisma.costCenter.findFirst({ where: { id, tenantId: check.tenantId! } });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("VALIDATION_FAILED", 400, { message: "Validierungsfehler", details: error.issues });
    }
    logger.error({ err: error }, "Error updating cost center");
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

    const result = await prisma.costCenter.deleteMany({
      where: { id, tenantId: check.tenantId! },
    });

    if (result.count === 0) {
      return apiError("NOT_FOUND", 404, { message: "Kostenstelle nicht gefunden" });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    // FK constraint violation: cost center still has dependent records
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return apiError("OPERATION_NOT_ALLOWED", 409, { message: "Kostenstelle kann nicht gelöscht werden, da noch abhängige Einträge existieren (z.B. Budgetpositionen)" });
    }
    logger.error({ err: error }, "Error deleting cost center");
    return apiError("DELETE_FAILED", 500, { message: "Fehler beim Löschen" });
  }
}

export const GET = withMonitoring(getHandler);
export const PUT = withMonitoring(putHandler);
export const DELETE = withMonitoring(deleteHandler);
