import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { handleApiError } from "@/lib/api-utils";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

const addPlotsSchema = z.object({
  plotIds: z.array(z.string().uuid("Ungültige Flurstück-ID")).min(1, "Mindestens ein Flurstück erforderlich"),
});

const removePlotsSchema = z.object({
  plotIds: z.array(z.string().uuid("Ungültige Flurstück-ID")).min(1, "Mindestens ein Flurstück erforderlich"),
});

// GET /api/leases/[id]/plots - Get plots for a lease
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.LEASES_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const lease = await prisma.lease.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
      include: {
        leasePlots: {
          include: {
            plot: {
              include: {
                park: {
                  select: { id: true, name: true, shortName: true },
                },
                plotAreas: true,
              },
            },
          },
        },
      },
    });

    if (!lease) {
      return apiError("NOT_FOUND", undefined, { message: "Pachtvertrag nicht gefunden" });
    }

    const plots = lease.leasePlots.map((lp) => lp.plot);

    return NextResponse.json({ plots });
  } catch (error) {
    logger.error({ err: error }, "Error fetching lease plots");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Flurstücke" });
  }
}

// POST /api/leases/[id]/plots - Add plots to a lease
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Verify lease exists and belongs to tenant
    const lease = await prisma.lease.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
    });

    if (!lease) {
      return apiError("NOT_FOUND", undefined, { message: "Pachtvertrag nicht gefunden" });
    }

    const body = await request.json();
    const { plotIds } = addPlotsSchema.parse(body);

    // Verify all plots belong to tenant
    const plots = await prisma.plot.findMany({
      where: {
        id: { in: plotIds },
        tenantId: check.tenantId,
      },
    });

    if (plots.length !== plotIds.length) {
      return apiError("NOT_FOUND", undefined, { message: "Ein oder mehrere Flurstücke nicht gefunden" });
    }

    // Check which plots are already assigned
    const existingRelations = await prisma.leasePlot.findMany({
      where: {
        leaseId: id,
        plotId: { in: plotIds },
      },
    });

    const existingPlotIds = existingRelations.map((r) => r.plotId);
    const newPlotIds = plotIds.filter((pid) => !existingPlotIds.includes(pid));

    if (newPlotIds.length === 0) {
      return apiError("BAD_REQUEST", undefined, { message: "Alle angegebenen Flurstücke sind bereits diesem Vertrag zugeordnet" });
    }

    // Add new plot relations
    await prisma.leasePlot.createMany({
      data: newPlotIds.map((plotId) => ({
        leaseId: id,
        plotId,
      })),
    });

    // Fetch updated plots
    const updatedLease = await prisma.lease.findUnique({
      where: { id },
      include: {
        leasePlots: {
          include: {
            plot: {
              include: {
                park: {
                  select: { id: true, name: true, shortName: true },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      addedCount: newPlotIds.length,
      plots: updatedLease?.leasePlots.map((lp) => lp.plot) || [],
    });
  } catch (error) {
    return handleApiError(error, "Fehler beim Hinzufügen der Flurstücke");
  }
}

// DELETE /api/leases/[id]/plots - Remove plots from a lease
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.LEASES_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Verify lease exists and belongs to tenant
    const lease = await prisma.lease.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
      include: {
        _count: {
          select: { leasePlots: true },
        },
      },
    });

    if (!lease) {
      return apiError("NOT_FOUND", undefined, { message: "Pachtvertrag nicht gefunden" });
    }

    const body = await request.json();
    const { plotIds } = removePlotsSchema.parse(body);

    // Check if we would remove all plots
    const currentPlotCount = lease._count.leasePlots;
    if (plotIds.length >= currentPlotCount) {
      return apiError("BAD_REQUEST", undefined, { message: "Ein Pachtvertrag muss mindestens ein Flurstück haben" });
    }

    // Remove plot relations
    const result = await prisma.leasePlot.deleteMany({
      where: {
        leaseId: id,
        plotId: { in: plotIds },
      },
    });

    // Fetch updated plots
    const updatedLease = await prisma.lease.findUnique({
      where: { id },
      include: {
        leasePlots: {
          include: {
            plot: {
              include: {
                park: {
                  select: { id: true, name: true, shortName: true },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      removedCount: result.count,
      plots: updatedLease?.leasePlots.map((lp) => lp.plot) || [],
    });
  } catch (error) {
    return handleApiError(error, "Fehler beim Entfernen der Flurstücke");
  }
}
