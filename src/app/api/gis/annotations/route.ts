import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import { Prisma } from "@prisma/client";

const createAnnotationSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(200),
  type: z.enum(["CABLE_ROUTE", "COMPENSATION_AREA", "ACCESS_ROAD", "EXCLUSION_ZONE", "CUSTOM"]).default("CUSTOM"),
  geometry: z.record(z.string(), z.unknown()), // GeoJSON
  description: z.string().optional(),
  style: z.record(z.string(), z.unknown()).optional(),
  parkId: z.string(),
});

// GET /api/gis/annotations?parkId=xxx
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_READ);
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId") || undefined;

    const annotations = await prisma.mapAnnotation.findMany({
      where: {
        tenantId: check.tenantId,
        ...(parkId ? { parkId } : {}),
        geometry: { not: Prisma.AnyNull },
      },
      select: {
        id: true,
        name: true,
        type: true,
        geometry: true,
        description: true,
        style: true,
        parkId: true,
        createdAt: true,
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(annotations);
  } catch (error) {
    logger.error({ err: error }, "Error fetching annotations");
    return NextResponse.json({ error: "Fehler beim Laden der Annotationen" }, { status: 500 });
  }
}

// POST /api/gis/annotations
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_CREATE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const data = createAnnotationSchema.parse(body);

    const annotation = await prisma.mapAnnotation.create({
      data: {
        tenantId: check.tenantId!,
        name: data.name,
        type: data.type,
        geometry: data.geometry as Prisma.InputJsonValue,
        description: data.description,
        style: data.style as Prisma.InputJsonValue | undefined,
        parkId: data.parkId,
        createdById: check.userId!,
      },
    });

    return NextResponse.json(annotation, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logger.error({ err: error }, "Error creating annotation");
    return NextResponse.json({ error: "Fehler beim Erstellen der Annotation" }, { status: 500 });
  }
}
