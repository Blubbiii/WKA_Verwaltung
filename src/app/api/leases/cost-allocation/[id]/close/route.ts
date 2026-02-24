import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { apiLogger as logger } from "@/lib/logger";

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
      return NextResponse.json(
        { error: "Kostenaufteilung nicht gefunden" },
        { status: 404 }
      );
    }

    if (allocation.status !== "INVOICED") {
      return NextResponse.json(
        {
          error: "Nur abgerechnete Kostenaufteilungen können abgeschlossen werden",
          details: `Aktueller Status: ${allocation.status}`,
        },
        { status: 400 }
      );
    }

    const updated = await prisma.parkCostAllocation.update({
      where: { id },
      data: { status: "CLOSED" },
    });

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error closing cost allocation");
    return NextResponse.json(
      { error: "Fehler beim Abschliessen der Kostenaufteilung" },
      { status: 500 }
    );
  }
}
