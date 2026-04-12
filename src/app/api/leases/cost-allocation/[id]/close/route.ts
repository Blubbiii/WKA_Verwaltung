import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// POST /api/leases/cost-allocation/[id]/close - Close a cost allocation
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const allocation = await prisma.parkCostAllocation.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!allocation) {
      return apiError("NOT_FOUND", undefined, { message: "Kostenaufteilung nicht gefunden" });
    }

    if (allocation.status !== "INVOICED") {
      return apiError("BAD_REQUEST", undefined, { message: "Nur abgerechnete Kostenaufteilungen können abgeschlossen werden", details: `Aktueller Status: ${allocation.status}` });
    }

    const updated = await prisma.parkCostAllocation.update({
      where: { id },
      data: { status: "CLOSED" },
    });

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error closing cost allocation");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Abschliessen der Kostenaufteilung" });
  }
}
