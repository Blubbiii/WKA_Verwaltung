import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const plotAreaSchema = z.object({
  areaType: z.enum(["WEA_STANDORT", "POOL", "WEG", "AUSGLEICH", "KABEL"]),
  areaSqm: z.number().optional().nullable(),
  lengthM: z.number().optional().nullable(),
  compensationType: z.enum(["ANNUAL", "ONE_TIME"]).default("ANNUAL"),
  compensationFixedAmount: z.number().optional().nullable(),
  compensationPercentage: z.number().min(0).max(100).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const plotAreasArraySchema = z.array(plotAreaSchema);

// GET /api/plots/[id]/areas
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.PLOTS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Verify plot belongs to tenant via park
    const plot = await prisma.plot.findFirst({
      where: {
        id,
        park: {
          tenantId: check.tenantId,
        },
      },
    });

    if (!plot) {
      return NextResponse.json(
        { error: "Flurstück nicht gefunden" },
        { status: 404 }
      );
    }

    const areas = await prisma.plotArea.findMany({
      where: { plotId: id },
      orderBy: { areaType: "asc" },
    });

    return NextResponse.json(areas);
  } catch (error) {
    logger.error({ err: error }, "Error fetching plot areas");
    return NextResponse.json(
      { error: "Fehler beim Laden der Teilflächen" },
      { status: 500 }
    );
  }
}

// POST /api/plots/[id]/areas - Create a new area
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.PLOTS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Verify plot belongs to tenant
    const plot = await prisma.plot.findFirst({
      where: {
        id,
        park: {
          tenantId: check.tenantId,
        },
      },
    });

    if (!plot) {
      return NextResponse.json(
        { error: "Flurstück nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = plotAreaSchema.parse(body);

    const area = await prisma.plotArea.create({
      data: {
        ...validatedData,
        plotId: id,
      },
    });

    return NextResponse.json(area, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating plot area");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Teilfläche" },
      { status: 500 }
    );
  }
}

// PUT /api/plots/[id]/areas - Replace all areas
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.PLOTS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Verify plot belongs to tenant
    const plot = await prisma.plot.findFirst({
      where: {
        id,
        park: {
          tenantId: check.tenantId,
        },
      },
    });

    if (!plot) {
      return NextResponse.json(
        { error: "Flurstück nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedAreas = plotAreasArraySchema.parse(body);

    // Replace all areas in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.plotArea.deleteMany({
        where: { plotId: id },
      });

      if (validatedAreas.length > 0) {
        await tx.plotArea.createMany({
          data: validatedAreas.map((area) => ({
            ...area,
            plotId: id,
          })),
        });
      }
    });

    const areas = await prisma.plotArea.findMany({
      where: { plotId: id },
      orderBy: { areaType: "asc" },
    });

    return NextResponse.json(areas);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating plot areas");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Teilflächen" },
      { status: 500 }
    );
  }
}
