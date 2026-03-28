import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import { Prisma } from "@prisma/client";

const updateAnnotationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(["CABLE_ROUTE", "COMPENSATION_AREA", "ACCESS_ROAD", "EXCLUSION_ZONE", "CUSTOM"]).optional(),
  geometry: z.record(z.string(), z.unknown()).optional(),
  description: z.string().optional(),
  style: z.record(z.string(), z.unknown()).optional(),
});

// PUT /api/gis/annotations/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;
    const body = await request.json();
    const data = updateAnnotationSchema.parse(body);

    // Verify ownership — count ensures tenant isolation
    const count = await prisma.mapAnnotation.count({
      where: { id, tenantId: check.tenantId },
    });
    if (count === 0) {
      return NextResponse.json({ error: "Annotation nicht gefunden" }, { status: 404 });
    }

    // Build update payload — only set provided fields
    const updateData: Prisma.MapAnnotationUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.geometry !== undefined) updateData.geometry = data.geometry as Prisma.InputJsonValue;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.style !== undefined) updateData.style = data.style as Prisma.InputJsonValue;

    // Use deleteMany/updateMany pattern for tenant-safe operations
    const updated = await prisma.mapAnnotation.updateMany({
      where: { id, tenantId: check.tenantId },
      data: updateData,
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Annotation nicht gefunden" }, { status: 404 });
    }

    // Return the updated annotation
    const result = await prisma.mapAnnotation.findUnique({ where: { id } });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logger.error({ err: error }, "Error updating annotation");
    return NextResponse.json({ error: "Fehler beim Aktualisieren" }, { status: 500 });
  }
}

// DELETE /api/gis/annotations/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_DELETE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Tenant-safe delete: deleteMany with tenant filter
    const deleted = await prisma.mapAnnotation.deleteMany({
      where: { id, tenantId: check.tenantId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Annotation nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting annotation");
    return NextResponse.json({ error: "Fehler beim Löschen" }, { status: 500 });
  }
}
