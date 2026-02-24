import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  fetchAvailabilityBreakdown,
  fetchAvailabilityTrend,
  fetchAvailabilityHeatmap,
  fetchDowntimePareto,
} from "@/lib/analytics/module-fetchers";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/analytics/availability
// IEC 61400-26 Availability: T1-T6 breakdown, trends, heatmap, pareto
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const { searchParams } = new URL(request.url);

    const parkId = searchParams.get("parkId");
    const yearParam = searchParams.get("year");

    // Validate year
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Ungültiges Jahr (2000-2100 erwartet)" },
        { status: 400 }
      );
    }

    // Fetch all data in parallel
    const [breakdown, trend, heatmap, pareto] = await Promise.all([
      fetchAvailabilityBreakdown(tenantId, year, parkId),
      fetchAvailabilityTrend(tenantId, year, parkId),
      fetchAvailabilityHeatmap(tenantId, year, parkId),
      fetchDowntimePareto(tenantId, year, parkId),
    ]);

    // Calculate fleet summary from breakdown
    const totalT1 = breakdown.reduce((s, b) => s + b.t1, 0);
    const totalT4 = breakdown.reduce((s, b) => s + b.t4, 0);
    const totalT5 = breakdown.reduce((s, b) => s + b.t5, 0);
    const avgAvail = breakdown.length > 0
      ? breakdown.reduce((s, b) => s + b.availabilityPct, 0) / breakdown.length
      : 0;

    return NextResponse.json({
      breakdown,
      trend,
      heatmap,
      pareto,
      fleet: {
        avgAvailability: Math.round(avgAvail * 100) / 100,
        totalProductionHours: Math.round(totalT1 / 3600),
        totalDowntimeHours: Math.round(totalT5 / 3600),
        totalMaintenanceHours: Math.round(totalT4 / 3600),
      },
      meta: {
        year,
        parkId: parkId || "all",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der Verfügbarkeits-Analytics");
    return NextResponse.json(
      { error: "Fehler beim Laden der Verfügbarkeits-Analytics" },
      { status: 500 }
    );
  }
}
