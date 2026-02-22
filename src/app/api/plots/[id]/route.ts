import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { logDeletion } from "@/lib/audit";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const plotUpdateSchema = z.object({
  parkId: z.string().uuid().optional().nullable(),
  county: z.string().optional().nullable(),
  municipality: z.string().optional().nullable(),
  cadastralDistrict: z.string().min(1).optional(),
  fieldNumber: z.string().optional(),
  plotNumber: z.string().min(1).optional(),
  areaSqm: z.number().optional().nullable(),
  usageType: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  mapImageUrl: z.string().url().optional().nullable(),
  mapDocumentUrl: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

// GET /api/plots/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.PLOTS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const plot = await prisma.plot.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
      include: {
        park: {
          select: {
            id: true,
            name: true,
            shortName: true,
            minimumRentPerTurbine: true,
            weaSharePercentage: true,
            poolSharePercentage: true,
          },
        },
        plotAreas: {
          orderBy: { areaType: "asc" },
        },
        leasePlots: {
          include: {
            lease: {
              include: {
                lessor: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    companyName: true,
                    personType: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!plot) {
      return NextResponse.json(
        { error: "Flurstück nicht gefunden" },
        { status: 404 }
      );
    }

    // Transform to include leases array for easier frontend consumption
    const transformedPlot = {
      ...plot,
      leases: plot.leasePlots.map((lp) => lp.lease),
    };

    return NextResponse.json(transformedPlot);
  } catch (error) {
    logger.error({ err: error }, "Error fetching plot");
    return NextResponse.json(
      { error: "Fehler beim Laden des Flurstücks" },
      { status: 500 }
    );
  }
}

// PATCH /api/plots/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.PLOTS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Verify plot exists and belongs to tenant
    const existingPlot = await prisma.plot.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
    });

    if (!existingPlot) {
      return NextResponse.json(
        { error: "Flurstück nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = plotUpdateSchema.parse(body);

    // Verify park belongs to tenant if changing parkId
    if (validatedData.parkId) {
      const park = await prisma.park.findFirst({
        where: {
          id: validatedData.parkId,
          tenantId: check.tenantId,
        },
      });

      if (!park) {
        return NextResponse.json(
          { error: "Park nicht gefunden" },
          { status: 404 }
        );
      }
    }

    // Check for duplicate if changing cadastralDistrict, fieldNumber, or plotNumber
    if (validatedData.cadastralDistrict || validatedData.fieldNumber || validatedData.plotNumber) {
      const newCadastralDistrict = validatedData.cadastralDistrict ?? existingPlot.cadastralDistrict;
      const newFieldNumber = validatedData.fieldNumber ?? existingPlot.fieldNumber;
      const newPlotNumber = validatedData.plotNumber ?? existingPlot.plotNumber;

      const duplicate = await prisma.plot.findFirst({
        where: {
          tenantId: check.tenantId,
          cadastralDistrict: newCadastralDistrict,
          fieldNumber: newFieldNumber,
          plotNumber: newPlotNumber,
          id: { not: id },
        },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: "Ein Flurstück mit dieser Kombination (Gemarkung, Flur, Flurstück) existiert bereits" },
          { status: 409 }
        );
      }
    }

    // Build update data, excluding undefined values
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    const updateData: any = {};
    for (const [key, value] of Object.entries(validatedData)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    const plot = await prisma.plot.update({
      where: { id },
      data: updateData,
      include: {
        park: {
          select: { id: true, name: true, shortName: true },
        },
        plotAreas: true,
      },
    });

    return NextResponse.json(plot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating plot");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Flurstücks" },
      { status: 500 }
    );
  }
}

// DELETE /api/plots/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.PLOTS_DELETE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Before delete, get the full data for audit log
    const plotToDelete = await prisma.plot.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
      include: {
        _count: { select: { leasePlots: true } },
      },
    });

    if (!plotToDelete) {
      return NextResponse.json(
        { error: "Flurstück nicht gefunden" },
        { status: 404 }
      );
    }

    if (plotToDelete._count.leasePlots > 0) {
      return NextResponse.json(
        { error: "Flurstück hat noch aktive Pachtverträge" },
        { status: 400 }
      );
    }

    // Perform the deletion
    await prisma.plot.delete({
      where: { id },
    });

    // Log the deletion
    await logDeletion("Plot", id, plotToDelete as Record<string, unknown>);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting plot");
    return NextResponse.json(
      { error: "Fehler beim Löschen des Flurstücks" },
      { status: 500 }
    );
  }
}
