import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";

const annotationCreateSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  type: z.enum(["CABLE_ROUTE", "COMPENSATION_AREA", "ACCESS_ROAD", "EXCLUSION_ZONE", "CUSTOM"]).optional().default("CUSTOM"),
  geometry: z.record(z.string(), z.unknown()).refine((v) => v !== null && typeof v === "object", { message: "geometry (GeoJSON) ist erforderlich" }),
  style: z.record(z.string(), z.unknown()).nullable().optional(),
  description: z.string().nullable().optional(),
});

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
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Annotationen" });
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
    const parsed = annotationCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { name, type, geometry, style, description } = parsed.data;

    const annotation = await prisma.mapAnnotation.create({
      data: {
        tenantId: check.tenantId!,
        parkId,
        name: name.trim(),
        type,
        geometry,
        style: style ?? undefined,
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
    return apiError("CREATE_FAILED", undefined, { message: "Fehler beim Erstellen der Annotation" });
  }
}
