import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const bulkSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assignLease"),
    plotIds: z.array(z.string().uuid()).min(1),
    data: z.object({
      leaseId: z.string().uuid(),
    }),
  }),
  z.object({
    action: z.literal("updateAreaType"),
    plotIds: z.array(z.string().uuid()).min(1),
    data: z.object({
      areaType: z.enum(["WEA_STANDORT", "POOL", "WEG", "AUSGLEICH", "KABEL"]),
      areaSqm: z.number().positive(),
    }),
  }),
]);

// POST /api/plots/bulk
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_UPDATE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const parsed = bulkSchema.parse(body);

    // Verify all plots belong to tenant
    const plotCount = await prisma.plot.count({
      where: {
        id: { in: parsed.plotIds },
        tenantId: check.tenantId,
      },
    });

    if (plotCount !== parsed.plotIds.length) {
      return NextResponse.json(
        { error: "Nicht alle Flurstücke gefunden" },
        { status: 404 }
      );
    }

    if (parsed.action === "assignLease") {
      // Verify lease exists and belongs to tenant
      const lease = await prisma.lease.findFirst({
        where: { id: parsed.data.leaseId, tenantId: check.tenantId },
      });
      if (!lease) {
        return NextResponse.json({ error: "Pachtvertrag nicht gefunden" }, { status: 404 });
      }

      // Batch: fetch existing relations, create only missing ones
      await prisma.$transaction(async (tx) => {
        const existing = await tx.leasePlot.findMany({
          where: {
            leaseId: parsed.data.leaseId,
            plotId: { in: parsed.plotIds },
          },
          select: { plotId: true },
        });
        const existingPlotIds = new Set(existing.map((e) => e.plotId));
        const toCreate = parsed.plotIds.filter((id) => !existingPlotIds.has(id));

        if (toCreate.length > 0) {
          await tx.leasePlot.createMany({
            data: toCreate.map((plotId) => ({
              leaseId: parsed.data.leaseId,
              plotId,
            })),
          });
        }
      });

      return NextResponse.json({
        success: true,
        message: `${parsed.plotIds.length} Flurstücke dem Vertrag zugeordnet`,
      });
    }

    if (parsed.action === "updateAreaType") {
      // Batch: fetch existing, split into create/update
      await prisma.$transaction(async (tx) => {
        const existing = await tx.plotArea.findMany({
          where: {
            plotId: { in: parsed.plotIds },
            areaType: parsed.data.areaType,
          },
        });
        const existingByPlotId = new Map(existing.map((e) => [e.plotId, e.id]));

        const toCreate = parsed.plotIds.filter((id) => !existingByPlotId.has(id));

        if (toCreate.length > 0) {
          await tx.plotArea.createMany({
            data: toCreate.map((plotId) => ({
              plotId,
              areaType: parsed.data.areaType,
              areaSqm: parsed.data.areaSqm,
            })),
          });
        }

        // Update existing ones
        for (const [, areaId] of existingByPlotId) {
          await tx.plotArea.update({
            where: { id: areaId },
            data: { areaSqm: parsed.data.areaSqm },
          });
        }
      });

      return NextResponse.json({
        success: true,
        message: `${parsed.plotIds.length} Flurstücke aktualisiert`,
      });
    }

    return NextResponse.json({ error: "Unbekannte Aktion" }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logger.error({ err: error }, "Error in bulk operation");
    return NextResponse.json({ error: "Fehler bei der Massenoperation" }, { status: 500 });
  }
}
