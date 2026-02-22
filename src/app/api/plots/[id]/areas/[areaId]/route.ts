import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

// DELETE /api/plots/[id]/areas/[areaId] - Delete a single plot area
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; areaId: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id, areaId } = await params;

    // Verify plot belongs to tenant
    const plot = await prisma.plot.findFirst({
      where: {
        id,
        park: {
          tenantId: check.tenantId,
        },
      },
    });

    if (!plot) {
      return NextResponse.json(
        { error: "Flurstück nicht gefunden" },
        { status: 404 }
      );
    }

    // Verify area belongs to this plot
    const area = await prisma.plotArea.findFirst({
      where: {
        id: areaId,
        plotId: id,
      },
    });

    if (!area) {
      return NextResponse.json(
        { error: "Teilfläche nicht gefunden" },
        { status: 404 }
      );
    }

    await prisma.plotArea.delete({
      where: { id: areaId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting plot area");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Teilfläche" },
      { status: 500 }
    );
  }
}
