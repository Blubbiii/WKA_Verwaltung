import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import { Prisma } from "@prisma/client";

const mergeSchema = z.object({
  plotIds: z.array(z.string().uuid()).min(2, "Mindestens 2 Flurstücke zum Zusammenlegen"),
  mergedGeometry: z.object({
    type: z.enum(["Polygon", "MultiPolygon"]),
    coordinates: z.array(z.unknown()),
  }),
  plotNumber: z.string().min(1, "Flurstücknummer ist erforderlich"),
  cadastralDistrict: z.string().optional(),
});

// POST /api/plots/merge
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_CREATE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const data = mergeSchema.parse(body);

    // Fetch all source plots
    const sourcePlots = await prisma.plot.findMany({
      where: {
        id: { in: data.plotIds },
        tenantId: check.tenantId,
      },
      include: { plotAreas: true },
    });

    if (sourcePlots.length !== data.plotIds.length) {
      return NextResponse.json(
        { error: "Nicht alle Flurstücke gefunden" },
        { status: 404 }
      );
    }

    // Validate all plots are in the same park
    const parkIds = [...new Set(sourcePlots.map((p) => p.parkId).filter(Boolean))];
    if (parkIds.length > 1) {
      return NextResponse.json(
        { error: "Alle Flurstücke müssen im selben Park liegen" },
        { status: 400 }
      );
    }
    const parkId = parkIds[0] ?? sourcePlots[0].parkId;

    // Sum up areas
    const totalArea = sourcePlots.reduce((s, p) => s + (p.areaSqm ? Number(p.areaSqm) : 0), 0);

    // Aggregate plot areas by type
    const areaByType: Record<string, number> = {};
    sourcePlots.forEach((p) => {
      p.plotAreas.forEach((a) => {
        areaByType[a.areaType] = (areaByType[a.areaType] ?? 0) + Number(a.areaSqm);
      });
    });

    const result = await prisma.$transaction(async (tx) => {
      // Create merged plot
      const merged = await tx.plot.create({
        data: {
          tenantId: check.tenantId!,
          cadastralDistrict: data.cadastralDistrict ?? sourcePlots[0].cadastralDistrict,
          fieldNumber: sourcePlots[0].fieldNumber,
          plotNumber: data.plotNumber,
          parkId,
          areaSqm: totalArea,
          geometry: data.mergedGeometry as unknown as Prisma.InputJsonValue,
        },
      });

      // Create aggregated plot areas
      const plotAreaData = Object.entries(areaByType).map(([areaType, areaSqm]) => ({
        plotId: merged.id,
        areaType: areaType as "WEA_STANDORT" | "POOL" | "WEG" | "AUSGLEICH" | "KABEL",
        areaSqm: Math.round(areaSqm),
      }));

      if (plotAreaData.length > 0) {
        await tx.plotArea.createMany({ data: plotAreaData });
      }

      // Deactivate source plots (clear geometry)
      await tx.plot.updateMany({
        where: { id: { in: data.plotIds } },
        data: { geometry: Prisma.DbNull },
      });

      return merged;
    });

    logger.info({
      action: "plot_merge",
      sourcePlotIds: data.plotIds,
      mergedPlotId: result.id,
      userId: check.userId,
    }, "Plot merge completed");

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logger.error({ err: error }, "Error merging plots");
    return NextResponse.json({ error: "Fehler beim Zusammenlegen" }, { status: 500 });
  }
}
