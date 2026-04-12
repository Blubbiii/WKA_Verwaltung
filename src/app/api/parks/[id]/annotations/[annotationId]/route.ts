import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";

const annotationUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["CABLE_ROUTE", "COMPENSATION_AREA", "ACCESS_ROAD", "EXCLUSION_ZONE", "CUSTOM"]).optional(),
  geometry: z.record(z.string(), z.unknown()).optional(),
  style: z.record(z.string(), z.unknown()).nullable().optional(),
  description: z.string().nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string; annotationId: string }> };

// =============================================================================
// PUT /api/parks/[id]/annotations/[annotationId]
// Update an annotation
// =============================================================================

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const check = await requirePermission("energy:update");
    if (!check.authorized) return check.error;

    const { id: parkId, annotationId } = await params;
    const body = await request.json();
    const parsed = annotationUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { name, type, geometry, style, description } = parsed.data;

    const existing = await prisma.mapAnnotation.findFirst({
      where: { id: annotationId, tenantId: check.tenantId!, parkId },
    });

    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Annotation nicht gefunden" });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (type !== undefined) updateData.type = type;
    if (geometry !== undefined) updateData.geometry = geometry;
    if (style !== undefined) updateData.style = style;
    if (description !== undefined) updateData.description = description?.trim() || null;

    const updated = await prisma.mapAnnotation.update({
      where: { id: annotationId, tenantId: check.tenantId! },
      data: updateData,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Aktualisieren der Annotation");
    return apiError("UPDATE_FAILED", undefined, { message: "Fehler beim Aktualisieren der Annotation" });
  }
}

// =============================================================================
// DELETE /api/parks/[id]/annotations/[annotationId]
// =============================================================================

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const check = await requirePermission("energy:delete");
    if (!check.authorized) return check.error;

    const { id: parkId, annotationId } = await params;

    const existing = await prisma.mapAnnotation.findFirst({
      where: { id: annotationId, tenantId: check.tenantId!, parkId },
    });

    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Annotation nicht gefunden" });
    }

    await prisma.mapAnnotation.delete({ where: { id: annotationId, tenantId: check.tenantId! } });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Löschen der Annotation");
    return apiError("DELETE_FAILED", undefined, { message: "Fehler beim Löschen der Annotation" });
  }
}
