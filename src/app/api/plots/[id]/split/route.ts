import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-utils";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api-errors";

const splitSchema = z.object({
  geometries: z.array(z.object({
    type: z.enum(["Polygon", "MultiPolygon"]),
    coordinates: z.array(z.unknown()),
  })).min(2, "Mindestens 2 Teilflächen erforderlich"),
  plotNumbers: z.array(z.string().min(1)).min(2, "Mindestens 2 Flurstücknummern erforderlich"),
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
      return apiError("BAD_REQUEST", undefined, { message: "Anzahl Flurstücknummern muss mit Anzahl Geometrien übereinstimmen" });
    }

    // Get original plot with areas
    const original = await prisma.plot.findFirst({
      where: { id, tenantId: check.tenantId },
      include: { plotAreas: true },
    });
    if (!original) {
      return apiError("NOT_FOUND", undefined, { message: "Flurstück nicht gefunden" });
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

      // Move all LeasePlot relations from the original plot onto the FIRST
      // sub-plot (conservative default) so no lease is orphaned.
      // TODO: allow per-lease targeting via tenant config for finer control.
      const originalLeaseRelations = await tx.leasePlot.findMany({
        where: { plotId: id },
        select: { id: true, leaseId: true },
      });

      if (originalLeaseRelations.length > 0) {
        const targetPlotId = newPlots[0].id;
        // Respect (leaseId, plotId) unique constraint on the target
        const existingOnTarget = await tx.leasePlot.findMany({
          where: {
            plotId: targetPlotId,
            leaseId: { in: originalLeaseRelations.map((r) => r.leaseId) },
          },
          select: { leaseId: true },
        });
        const existingLeaseIds = new Set(existingOnTarget.map((r) => r.leaseId));

        for (const rel of originalLeaseRelations) {
          if (existingLeaseIds.has(rel.leaseId)) {
            await tx.leasePlot.delete({ where: { id: rel.id } });
          } else {
            await tx.leasePlot.update({
              where: { id: rel.id },
              data: { plotId: targetPlotId },
            });
            existingLeaseIds.add(rel.leaseId);
          }
        }

        logger.warn(
          {
            action: "plot_split_lease_relations_moved",
            originalPlotId: id,
            targetPlotId,
            movedCount: originalLeaseRelations.length,
          },
          "Plot-Split: all LeasePlot-Relations moved to first sub-plot",
        );
      }

      // Mark original as deleted (clear geometry + set INACTIVE)
      await tx.plot.update({
        where: { id },
        data: { geometry: Prisma.DbNull, status: "INACTIVE" },
      });

      return newPlots;
    });

    logger.info({
      action: "plot_split",
      originalPlotId: id,
      newPlotIds: result.map((p) => p.id),
      userId: check.userId,
    }, "Plot split completed");

    return NextResponse.json({ plots: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Fehler beim Teilen des Flurstücks");
  }
}
