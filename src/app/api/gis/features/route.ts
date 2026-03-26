import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

// GET /api/gis/features?parkId=xxx (optional filter)
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.PLOTS_READ);
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId") || undefined;

    const tenantFilter = { tenantId: check.tenantId };
    const parkFilter = parkId ? { parkId } : {};

    // Fetch all GIS data in parallel
    const [parks, turbines, plots, annotations] = await Promise.all([
      // Parks
      prisma.park.findMany({
        where: { ...tenantFilter, ...(parkId ? { id: parkId } : {}) },
        select: {
          id: true,
          name: true,
          shortName: true,
          latitude: true,
          longitude: true,
          status: true,
          _count: { select: { turbines: true } },
        },
      }),

      // Turbines with coordinates
      prisma.turbine.findMany({
        where: {
          ...tenantFilter,
          ...parkFilter,
          latitude: { not: null },
          longitude: { not: null },
        },
        select: {
          id: true,
          designation: true,
          latitude: true,
          longitude: true,
          status: true,
          ratedPowerKw: true,
          parkId: true,
        },
      }),

      // Plots with geometry and lease info
      prisma.plot.findMany({
        where: {
          ...tenantFilter,
          ...parkFilter,
          geometry: { not: null },
        },
        include: {
          plotAreas: true,
          leasePlots: {
            include: {
              lease: {
                select: {
                  id: true,
                  status: true,
                  startDate: true,
                  endDate: true,
                  lessor: {
                    select: {
                      id: true,
                      personType: true,
                      firstName: true,
                      lastName: true,
                      companyName: true,
                    },
                  },
                },
              },
            },
          },
          park: {
            select: { id: true, name: true, shortName: true },
          },
        },
      }),

      // Annotations with geometry
      prisma.mapAnnotation.findMany({
        where: {
          ...tenantFilter,
          ...parkFilter,
          geometry: { not: null },
        },
        select: {
          id: true,
          name: true,
          type: true,
          geometry: true,
          description: true,
          style: true,
          parkId: true,
        },
      }),
    ]);

    // Helper to derive lessor display name
    function getLessorName(lessor: {
      personType: string;
      firstName: string | null;
      lastName: string | null;
      companyName: string | null;
    }): string | null {
      if (lessor.personType === "legal") return lessor.companyName ?? null;
      return [lessor.firstName, lessor.lastName].filter(Boolean).join(" ") || null;
    }

    // Transform plots: extract activeLease info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transformedPlots = plots.map((plot: any) => {
      const { leasePlots, ...basePlot } = plot;

      const activeLeasePlot = leasePlots?.find(
        (lp: { lease: { status: string } }) =>
          lp.lease.status === "ACTIVE" || lp.lease.status === "EXPIRING"
      );
      const fallbackLeasePlot =
        !activeLeasePlot && leasePlots?.length > 0 ? leasePlots[0] : null;
      const effectiveLease = activeLeasePlot ?? fallbackLeasePlot;

      let activeLease = null;
      if (effectiveLease) {
        activeLease = {
          leaseId: effectiveLease.lease.id,
          status: effectiveLease.lease.status,
          lessorName: getLessorName(effectiveLease.lease.lessor),
          lessorId: effectiveLease.lease.lessor.id,
        };
      }

      return {
        ...basePlot,
        activeLease,
        leaseCount: leasePlots?.length ?? 0,
      };
    });

    return NextResponse.json({
      parks,
      turbines,
      plots: transformedPlots,
      annotations,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching GIS features");
    return NextResponse.json(
      { error: "Fehler beim Laden der GIS-Daten" },
      { status: 500 }
    );
  }
}
