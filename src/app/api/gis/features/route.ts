import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";

// Lessor display name helper
interface LessorFields {
  personType: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}

function getLessorName(lessor: LessorFields): string | null {
  if (lessor.personType === "legal") return lessor.companyName ?? null;
  return [lessor.firstName, lessor.lastName].filter(Boolean).join(" ") || null;
}

// Lease info from LeasePlot join
interface LeasePlotWithLease {
  lease: {
    id: string;
    status: string;
    startDate: Date | null;
    endDate: Date | null;
    lessor: LessorFields & { id: string };
  };
}

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

      // Turbines with coordinates (no tenantId on Turbine — filter via park relation)
      prisma.turbine.findMany({
        where: {
          park: tenantFilter,
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
          geometry: { not: Prisma.AnyNull },
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
        },
      }),
    ]);

    // Transform plots: extract active + all lease info
    const transformedPlots = plots.map((plot) => {
      const { leasePlots, ...basePlot } = plot;
      const typedLeasePlots = leasePlots as LeasePlotWithLease[];

      // Find active lease
      const activeLeasePlot = typedLeasePlots.find(
        (lp) => lp.lease.status === "ACTIVE" || lp.lease.status === "EXPIRING"
      );
      const fallbackLeasePlot =
        !activeLeasePlot && typedLeasePlots.length > 0 ? typedLeasePlots[0] : null;
      const effectiveLease = activeLeasePlot ?? fallbackLeasePlot;

      let activeLease = null;
      if (effectiveLease) {
        activeLease = {
          leaseId: effectiveLease.lease.id,
          status: effectiveLease.lease.status,
          lessorName: getLessorName(effectiveLease.lease.lessor),
          lessorId: effectiveLease.lease.lessor.id,
          startDate: effectiveLease.lease.startDate?.toISOString() ?? null,
          endDate: effectiveLease.lease.endDate?.toISOString() ?? null,
        };
      }

      // Build full lease history for timeline
      const allLeases = typedLeasePlots.map((lp) => ({
        leaseId: lp.lease.id,
        status: lp.lease.status,
        lessorName: getLessorName(lp.lease.lessor),
        startDate: lp.lease.startDate?.toISOString() ?? null,
        endDate: lp.lease.endDate?.toISOString() ?? null,
      }));

      return {
        ...basePlot,
        activeLease,
        allLeases,
        leaseCount: typedLeasePlots.length,
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
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der GIS-Daten" });
  }
}
