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

    // Verify ownership
    const existing = await prisma.mapAnnotation.findFirst({
      where: { id, tenantId: check.tenantId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Annotation nicht gefunden" }, { status: 404 });
    }

    const updated = await prisma.mapAnnotation.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.geometry !== undefined ? { geometry: data.geometry as Prisma.InputJsonValue } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.style !== undefined ? { style: data.style as Prisma.InputJsonValue } : {}),
      },
    });

    return NextResponse.json(updated);
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

    const existing = await prisma.mapAnnotation.findFirst({
      where: { id, tenantId: check.tenantId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Annotation nicht gefunden" }, { status: 404 });
    }

    await prisma.mapAnnotation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting annotation");
    return NextResponse.json({ error: "Fehler beim Löschen" }, { status: 500 });
  }
}
