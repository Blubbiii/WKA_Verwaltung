import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { mandantDb } from "@/lib/mandant/mandant-db";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// DELETE /api/plots/[id]/areas/[areaId] - Delete a single plot area
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; areaId: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_UPDATE);
    if (!check.authorized) return check.error!;
    const db = mandantDb(check.tenantId!);

    const { id, areaId } = await params;

    // Verify plot belongs to tenant
    const plot = await db.plot.findFirst({
      where: {
        id,
        park: {
          tenantId: check.tenantId,
        },
      },
    });

    if (!plot) {
      return apiError("NOT_FOUND", undefined, { message: "Flurstück nicht gefunden" });
    }

    // Verify area belongs to this plot
    const area = await db.plotArea.findFirst({
      where: {
        id: areaId,
        plotId: id,
      },
    });

    if (!area) {
      return apiError("NOT_FOUND", undefined, { message: "Teilfläche nicht gefunden" });
    }

    await db.plotArea.delete({
      where: { id: areaId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting plot area");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen der Teilfläche" });
  }
}
