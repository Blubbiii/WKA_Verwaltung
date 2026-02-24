import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  fetchPerformanceKpis,
  fetchProductionHeatmap,
  fetchYearOverYear,
} from "@/lib/analytics/module-fetchers";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/analytics/performance
// Performance KPIs: Capacity Factor, Specific Yield, Production per Turbine
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const { searchParams } = new URL(request.url);

    const parkId = searchParams.get("parkId");
    const yearParam = searchParams.get("year");
    const compareYearParam = searchParams.get("compareYear");

    // Validate year
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Ungültiges Jahr (2000-2100 erwartet)" },
        { status: 400 }
      );
    }

    const compareYear = compareYearParam ? parseInt(compareYearParam, 10) : year - 1;

    // Fetch all data in parallel
    const [kpiResult, heatmap, yearOverYear] = await Promise.all([
      fetchPerformanceKpis(tenantId, year, parkId),
      fetchProductionHeatmap(tenantId, year, parkId),
      fetchYearOverYear(tenantId, year, compareYear, parkId),
    ]);

    return NextResponse.json({
      turbines: kpiResult.turbines,
      fleet: kpiResult.fleet,
      heatmap,
      yearOverYear,
      meta: {
        year,
        compareYear,
        parkId: parkId || "all",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der Performance-Analytics");
    return NextResponse.json(
      { error: "Fehler beim Laden der Performance-Analytics" },
      { status: 500 }
    );
  }
}
