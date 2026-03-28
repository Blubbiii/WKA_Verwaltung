import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import { Prisma } from "@prisma/client";

const splitSchema = z.object({
  geometries: z.array(z.object({
    type: z.enum(["Polygon", "MultiPolygon"]),
    coordinates: z.array(z.unknown()),
  })).min(2, "Mindestens 2 Teilflächen erforderlich"),
  plotNumbers: z.array(z.string().min(1)),
  areas: z.array(z.number().positive()).optional(),
});

// POST /api/plots/[id]/split
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_CREATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;
    const body = await request.json();
    const data = splitSchema.parse(body);

    if (data.plotNumbers.length !== data.geometries.length) {
      return NextResponse.json(
        { error: "Anzahl Flurstücknummern muss mit Anzahl Geometrien übereinstimmen" },
        { status: 400 }
      );
    }

    // Get original plot with areas
    const original = await prisma.plot.findFirst({
      where: { id, tenantId: check.tenantId },
      include: { plotAreas: true },
    });
    if (!original) {
      return NextResponse.json({ error: "Flurstück nicht gefunden" }, { status: 404 });
    }

    // Calculate proportional areas
    const totalOriginalArea = original.areaSqm ? Number(original.areaSqm) : 0;
    const splitAreas = data.areas ?? data.geometries.map(() => totalOriginalArea / data.geometries.length);
    const totalSplitArea = splitAreas.reduce((s, a) => s + a, 0);

    const result = await prisma.$transaction(async (tx) => {
      // Create new plots
      const newPlots = [];
      for (let i = 0; i < data.geometries.length; i++) {
        const proportion = totalSplitArea > 0 ? splitAreas[i] / totalSplitArea : 1 / data.geometries.length;

        const newPlot = await tx.plot.create({
          data: {
            tenantId: check.tenantId!,
            cadastralDistrict: original.cadastralDistrict,
            fieldNumber: original.fieldNumber,
            plotNumber: data.plotNumbers[i],
            parkId: original.parkId,
            areaSqm: splitAreas[i],
            geometry: data.geometries[i] as unknown as Prisma.InputJsonValue,
          },
        });

        // Create proportional plot areas
        if (original.plotAreas.length > 0) {
          await tx.plotArea.createMany({
            data: original.plotAreas.map((area) => ({
              plotId: newPlot.id,
              areaType: area.areaType,
              areaSqm: Math.round(Number(area.areaSqm) * proportion),
            })),
          });
        }

        newPlots.push(newPlot);
      }

      // Mark original as deleted (clear geometry)
      await tx.plot.update({
        where: { id },
        data: { geometry: Prisma.DbNull },
      });

      return newPlots;
    });

    return NextResponse.json({ plots: result }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logger.error({ err: error }, "Error splitting plot");
    return NextResponse.json({ error: "Fehler beim Teilen des Flurstücks" }, { status: 500 });
  }
}
