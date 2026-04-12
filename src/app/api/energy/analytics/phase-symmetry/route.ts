import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  fetchPhaseSymmetryTrend,
  fetchPhaseSymmetryPerTurbine,
  fetchPhasePowersMonthly,
} from "@/lib/analytics/module-fetchers";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// GET /api/energy/analytics/phase-symmetry
// Phase Symmetry Analytics: Imbalance Trend, Per-Turbine, Phase Powers
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
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültiges Jahr (2000-2100 erwartet)" });
    }

    // Fetch all data in parallel
    const [symmetryTrend, perTurbine, phasePowers] = await Promise.all([
      fetchPhaseSymmetryTrend(tenantId, year, parkId),
      fetchPhaseSymmetryPerTurbine(tenantId, year, parkId),
      fetchPhasePowersMonthly(tenantId, year, parkId),
    ]);

    // Build summary from per-turbine data
    const turbinesWithData = perTurbine.filter((t) => t.dataPoints > 0);
    const fleetAvgImbalancePct =
      turbinesWithData.length > 0
        ? Math.round(
            (turbinesWithData.reduce((s, t) => s + t.avgImbalancePct, 0) /
              turbinesWithData.length) *
              100
          ) / 100
        : 0;

    const worstTurbine = turbinesWithData.reduce(
      (worst, t) =>
        t.avgImbalancePct > (worst?.avgImbalancePct ?? 0) ? t : worst,
      turbinesWithData[0] ?? null
    );

    const totalDataPoints = turbinesWithData.reduce(
      (s, t) => s + t.dataPoints,
      0
    );

    const summary = {
      fleetAvgImbalancePct,
      worstTurbineDesignation: worstTurbine?.designation ?? null,
      worstTurbineImbalancePct: worstTurbine?.avgImbalancePct ?? 0,
      totalDataPoints,
    };

    return NextResponse.json({
      symmetryTrend,
      perTurbine,
      phasePowers,
      summary,
      meta: {
        year,
        parkId: parkId || "all",
      },
    });
  } catch (error) {
    logger.error(
      { err: error },
      "Fehler beim Laden der Phasensymmetrie-Analytics"
    );
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Phasensymmetrie-Analytics" });
  }
}
