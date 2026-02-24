import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  fetchPerformanceKpis,
  fetchYearOverYear,
  fetchAvailabilityTrend,
  fetchAvailabilityBreakdown,
} from "@/lib/analytics/module-fetchers";
import { apiLogger as logger } from "@/lib/logger";
import type { PortalAnalyticsResponse, PortalTurbineOverview } from "@/types/analytics";

// =============================================================================
// GET /api/portal/energy-analytics
// Simplified analytics dashboard for portal investors.
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Nicht autorisiert" },
        { status: 401 }
      );
    }

    const tenantId = session.user.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { error: "Kein Mandant zugeordnet" },
        { status: 403 }
      );
    }

    // Check tenant portal settings
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 404 }
      );
    }

    const settings = tenant.settings as Record<string, unknown> | null;
    const portalVisibleSections = (settings?.portalVisibleSections as string[]) ?? [];

    if (!portalVisibleSections.includes("energyReports")) {
      return NextResponse.json({
        data: null,
        message: "Energiedaten sind im Portal nicht aktiviert",
      });
    }

    // Parse year param
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Ungültiges Jahr" },
        { status: 400 }
      );
    }

    // Fetch all data in parallel (no park filter for portal - shows all)
    const [currentKpis, previousKpis, yearOverYear, availTrend, availBreakdown] =
      await Promise.all([
        fetchPerformanceKpis(tenantId, year),
        fetchPerformanceKpis(tenantId, year - 1),
        fetchYearOverYear(tenantId, year, year - 1),
        fetchAvailabilityTrend(tenantId, year),
        fetchAvailabilityBreakdown(tenantId, year),
      ]);

    // Build KPIs
    const fleet = currentKpis.fleet;
    const prevFleet = previousKpis.fleet;
    const monthlyProductionMwh =
      fleet.totalProductionKwh > 0
        ? Math.round((fleet.totalProductionKwh / 1000 / 12) * 10) / 10
        : 0;
    const previousYearMonthlyMwh =
      prevFleet.totalProductionKwh > 0
        ? Math.round((prevFleet.totalProductionKwh / 1000 / 12) * 10) / 10
        : 0;

    // Trend indicator
    let trendIndicator: "green" | "yellow" | "red" = "green";
    if (previousYearMonthlyMwh > 0) {
      const ratio = monthlyProductionMwh / previousYearMonthlyMwh;
      if (ratio < 0.8) trendIndicator = "red";
      else if (ratio < 0.95) trendIndicator = "yellow";
    }

    // Availability average
    const avgAvailability =
      availTrend.length > 0
        ? Math.round(
            (availTrend.reduce((s, t) => s + t.avgAvailability, 0) /
              availTrend.length) *
              100
          ) / 100
        : 0;

    // Build availability map for turbines
    const availMap = new Map(
      availBreakdown.map((a) => [a.turbineId, a.availabilityPct])
    );

    // Turbine overview with status
    const fleetAvgCf = fleet.avgCapacityFactor;
    const turbineOverview: PortalTurbineOverview[] = currentKpis.turbines.map(
      (t) => {
        let status: "good" | "warning" | "poor" = "warning";
        if (fleetAvgCf > 0) {
          if (t.capacityFactor >= fleetAvgCf * 0.9) status = "good";
          else if (t.capacityFactor < fleetAvgCf * 0.7) status = "poor";
        }

        return {
          designation: t.designation,
          productionMwh:
            Math.round((t.productionKwh / 1000) * 10) / 10,
          availabilityPct: availMap.get(t.turbineId) ?? 0,
          status,
        };
      }
    );

    // Wind summary
    const windSummary = {
      avgWindSpeed: fleet.avgWindSpeed ?? 0,
      dominantDirection: "W", // Default - no direction data in basic KPIs
    };

    const response: PortalAnalyticsResponse = {
      kpis: {
        monthlyProductionMwh,
        previousYearMonthlyMwh,
        capacityFactor: fleet.avgCapacityFactor,
        availabilityPct: avgAvailability,
        specificYield: fleet.avgSpecificYield,
        trendIndicator,
      },
      productionChart: yearOverYear,
      availabilityTrend: availTrend,
      turbineOverview,
      windSummary,
    };

    return NextResponse.json({ data: response });
  } catch (error) {
    logger.error({ err: error }, "Error fetching portal energy analytics");
    return NextResponse.json(
      { error: "Fehler beim Laden der Anlagen-Performance" },
      { status: 500 }
    );
  }
}
