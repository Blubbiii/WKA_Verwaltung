import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  fetchShadowPerTurbine,
  fetchShadowMonthlyTrend,
  fetchShadowDailyProfile,
} from "@/lib/analytics/module-fetchers";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/analytics/shadow
// Shadow Casting Analytics: Per-Turbine hours, Monthly Trend, Daily Profile
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
    const [perTurbine, monthlyTrend, dailyProfile] = await Promise.all([
      fetchShadowPerTurbine(tenantId, year, parkId),
      fetchShadowMonthlyTrend(tenantId, year, parkId),
      fetchShadowDailyProfile(tenantId, year, parkId),
    ]);

    // Build summary from per-turbine data
    const BIMSCHG_LIMIT_HOURS = 30; // BImSchG limit per turbine per year

    const totalShadowHoursYear = perTurbine.reduce(
      (sum, t) => sum + t.totalShadowHoursYear,
      0
    );

    let worstTurbineDesignation: string | null = null;
    let budgetUsedPercent = 0;

    if (perTurbine.length > 0) {
      const worstTurbine = perTurbine.reduce((worst, t) =>
        t.totalShadowHoursYear > worst.totalShadowHoursYear ? t : worst
      );
      worstTurbineDesignation = worstTurbine.designation;
      budgetUsedPercent =
        Math.round(
          (worstTurbine.totalShadowHoursYear / BIMSCHG_LIMIT_HOURS) * 100 * 100
        ) / 100;
    }

    const summary = {
      totalShadowHoursYear: Math.round(totalShadowHoursYear * 100) / 100,
      budgetUsedPercent,
      worstTurbineDesignation,
    };

    return NextResponse.json({
      perTurbine,
      monthlyTrend,
      dailyProfile,
      summary,
      meta: {
        year,
        parkId: parkId || "all",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der Schattenwurf-Analytics");
    return NextResponse.json(
      { error: "Fehler beim Laden der Schattenwurf-Analytics" },
      { status: 500 }
    );
  }
}
