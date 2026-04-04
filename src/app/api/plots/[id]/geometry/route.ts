import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { z } from "zod";
import { Prisma } from "@prisma/client";

const geometrySchema = z.object({
  geometry: z.object({
    type: z.enum(["Polygon", "MultiPolygon"]),
    coordinates: z.array(z.unknown()) as z.ZodType<unknown[]>,
  }),
});

// PUT /api/plots/[id]/geometry
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;
    const body = await request.json();
    const data = geometrySchema.parse(body);

    // Verify plot exists and belongs to tenant
    const existing = await prisma.plot.findFirst({
      where: { id, tenantId: check.tenantId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Flurstück nicht gefunden" }, { status: 404 });
    }

    const updated = await prisma.plot.update({
      where: { id },
      data: {
        geometry: data.geometry as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ id: updated.id, geometry: updated.geometry });
  } catch (error) {
    return handleApiError(error, "Fehler beim Aktualisieren der Geometrie");
  }
}
