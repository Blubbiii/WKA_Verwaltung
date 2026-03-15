import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// GET /api/admin/scada-codes — List all controller types with code counts
export async function GET() {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    const groups = await prisma.scadaStatusCode.groupBy({
      by: ["controllerType"],
      _count: { id: true },
      _max: { updatedAt: true },
    });

    const data = groups.map((g) => ({
      controllerType: g.controllerType,
      codeCount: g._count.id,
      lastUpdated: g._max.updatedAt,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    logger.error({ err: error }, "Error listing SCADA code groups");
    return NextResponse.json(
      { error: "Fehler beim Laden der Code-Listen" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/scada-codes?controllerType=CS82 — Delete all codes for a type
export async function DELETE(request: NextRequest) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const controllerType = searchParams.get("controllerType");

    if (!controllerType) {
      return NextResponse.json(
        { error: "controllerType Parameter erforderlich" },
        { status: 400 }
      );
    }

    const deleted = await prisma.scadaStatusCode.deleteMany({
      where: { controllerType },
    });

    logger.info(
      { controllerType, deleted: deleted.count },
      "SCADA status codes deleted"
    );

    return NextResponse.json({
      deleted: deleted.count,
      controllerType,
    });
  } catch (error) {
    logger.error({ err: error }, "Error deleting SCADA status codes");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Code-Liste" },
      { status: 500 }
    );
  }
}
