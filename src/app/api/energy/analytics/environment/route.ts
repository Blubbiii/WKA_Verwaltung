import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  fetchWindDistribution,
  fetchSeasonalPatterns,
  fetchDirectionEfficiency,
} from "@/lib/analytics/module-fetchers";
import { apiLogger as logger } from "@/lib/logger";
import type { EnvironmentResponse } from "@/types/analytics";

// =============================================================================
// GET /api/energy/analytics/environment
// Wind & Environment Analytics: Distribution, Seasonal Patterns, Direction
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
        { error: "Ungueltiges Jahr (2000-2100 erwartet)" },
        { status: 400 }
      );
    }

    // Fetch all data in parallel
    const [windDistribution, seasonalPatterns, directionEfficiency] =
      await Promise.all([
        fetchWindDistribution(tenantId, year, parkId),
        fetchSeasonalPatterns(tenantId, year, parkId),
        fetchDirectionEfficiency(tenantId, year, parkId),
      ]);

    // Calculate summary from seasonal patterns (avg of monthly averages)
    const patternsWithWind = seasonalPatterns.filter((p) => p.avgWindSpeed > 0);
    const patternsWithPressure = seasonalPatterns.filter(
      (p) => p.avgAirPressure != null
    );
    const patternsWithHumidity = seasonalPatterns.filter(
      (p) => p.avgHumidity != null
    );
    const patternsWithRain = seasonalPatterns.filter(
      (p) => p.avgRain != null
    );

    const avgWindSpeed =
      patternsWithWind.length > 0
        ? Math.round(
            (patternsWithWind.reduce((s, p) => s + p.avgWindSpeed, 0) /
              patternsWithWind.length) *
              100
          ) / 100
        : 0;

    const avgAirPressure =
      patternsWithPressure.length > 0
        ? Math.round(
            (patternsWithPressure.reduce(
              (s, p) => s + (p.avgAirPressure ?? 0),
              0
            ) /
              patternsWithPressure.length) *
              10
          ) / 10
        : null;

    const avgHumidity =
      patternsWithHumidity.length > 0
        ? Math.round(
            (patternsWithHumidity.reduce(
              (s, p) => s + (p.avgHumidity ?? 0),
              0
            ) /
              patternsWithHumidity.length) *
              10
          ) / 10
        : null;

    const totalRain =
      patternsWithRain.length > 0
        ? Math.round(
            patternsWithRain.reduce((s, p) => s + (p.avgRain ?? 0), 0) * 100
          ) / 100
        : null;

    const response: EnvironmentResponse = {
      windDistribution,
      seasonalPatterns,
      directionEfficiency,
      summary: {
        avgWindSpeed,
        avgAirPressure,
        avgHumidity,
        totalRain,
      },
    };

    return NextResponse.json({
      ...response,
      meta: {
        year,
        parkId: parkId || "all",
      },
    });
  } catch (error) {
    logger.error(
      { err: error },
      "Fehler beim Laden der Umwelt-Analytics"
    );
    return NextResponse.json(
      { error: "Fehler beim Laden der Umwelt-Analytics" },
      { status: 500 }
    );
  }
}
