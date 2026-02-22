import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  fetchFaultPareto,
  fetchWarningTrend,
  fetchFaultPerTurbine,
} from "@/lib/analytics/module-fetchers";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/analytics/faults
// Fault & Warning analytics: State Pareto, Warning Trend, Per-Turbine faults
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
    const [statePareto, warningTrend, perTurbine] = await Promise.all([
      fetchFaultPareto(tenantId, year, parkId),
      fetchWarningTrend(tenantId, year, parkId),
      fetchFaultPerTurbine(tenantId, year, parkId),
    ]);

    return NextResponse.json({
      statePareto,
      warningTrend,
      perTurbine,
      meta: {
        year,
        parkId: parkId || "all",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der Stoerungsanalyse");
    return NextResponse.json(
      { error: "Fehler beim Laden der Stoerungsanalyse" },
      { status: 500 }
    );
  }
}
