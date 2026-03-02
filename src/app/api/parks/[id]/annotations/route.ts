import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/parks/[id]/annotations
// Returns all map annotations for a park
// =============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const { id: parkId } = await params;

    const annotations = await prisma.mapAnnotation.findMany({
      where: {
        tenantId: check.tenantId!,
        parkId,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: annotations });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der Annotationen");
    return NextResponse.json(
      { error: "Fehler beim Laden der Annotationen" },
      { status: 500 },
    );
  }
}

// =============================================================================
// POST /api/parks/[id]/annotations
// Create a new map annotation
//
// Body: { name, type, geometry, style?, description? }
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("energy:create");
    if (!check.authorized) return check.error;

    const { id: parkId } = await params;
    const body = await request.json();
    const { name, type, geometry, style, description } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "name ist erforderlich" },
        { status: 400 },
      );
    }

    if (!geometry || typeof geometry !== "object") {
      return NextResponse.json(
        { error: "geometry (GeoJSON) ist erforderlich" },
        { status: 400 },
      );
    }

    const validTypes = ["CABLE_ROUTE", "COMPENSATION_AREA", "ACCESS_ROAD", "EXCLUSION_ZONE", "CUSTOM"];
    const annotationType = validTypes.includes(type) ? type : "CUSTOM";

    const annotation = await prisma.mapAnnotation.create({
      data: {
        tenantId: check.tenantId!,
        parkId,
        name: name.trim(),
        type: annotationType,
        geometry,
        style: style ?? null,
        description: description?.trim() || null,
        createdById: check.userId!,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return NextResponse.json({ data: annotation }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Erstellen der Annotation");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Annotation" },
      { status: 500 },
    );
  }
}
