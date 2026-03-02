import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

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
    const { name, type, geometry, style, description } = body;

    const existing = await prisma.mapAnnotation.findFirst({
      where: { id: annotationId, tenantId: check.tenantId!, parkId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Annotation nicht gefunden" },
        { status: 404 },
      );
    }

    const validTypes = ["CABLE_ROUTE", "COMPENSATION_AREA", "ACCESS_ROAD", "EXCLUSION_ZONE", "CUSTOM"];

    const updated = await prisma.mapAnnotation.update({
      where: { id: annotationId },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(type !== undefined && validTypes.includes(type) ? { type } : {}),
        ...(geometry !== undefined ? { geometry } : {}),
        ...(style !== undefined ? { style } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Aktualisieren der Annotation");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Annotation" },
      { status: 500 },
    );
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
      return NextResponse.json(
        { error: "Annotation nicht gefunden" },
        { status: 404 },
      );
    }

    await prisma.mapAnnotation.delete({ where: { id: annotationId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Löschen der Annotation");
    return NextResponse.json(
      { error: "Fehler beim Löschen der Annotation" },
      { status: 500 },
    );
  }
}
