import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  fetchOperatingStatePareto,
  fetchOperatingStatePerTurbine,
  fetchOperatingStateTimeline,
} from "@/lib/analytics/module-fetchers";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/analytics/operating-states
// Operating States Analytics: Pareto, Per-Turbine, Daily Timeline
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const { searchParams } = new URL(request.url);

    const parkId = searchParams.get("parkId");
    const yearParam = searchParams.get("year");
    const turbineIdParam = searchParams.get("turbineId");

    // Validate turbineId format (UUID)
    if (turbineIdParam && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(turbineIdParam)) {
      return NextResponse.json(
        { error: "Ungültiges turbineId-Format (UUID erwartet)" },
        { status: 400 }
      );
    }

    // Validate year
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Ungültiges Jahr (2000-2100 erwartet)" },
        { status: 400 }
      );
    }

    // Fetch all data in parallel
    const [statePareto, perTurbine, timeline] = await Promise.all([
      fetchOperatingStatePareto(tenantId, year, parkId),
      fetchOperatingStatePerTurbine(tenantId, year, parkId),
      fetchOperatingStateTimeline(tenantId, year, parkId, turbineIdParam),
    ]);

    return NextResponse.json({
      statePareto,
      perTurbine,
      timeline,
      meta: {
        year,
        parkId: parkId || "all",
        turbineId: turbineIdParam || "all",
      },
    });
  } catch (error) {
    logger.error(
      { err: error },
      "Fehler beim Laden der Betriebszustands-Analytics"
    );
    return NextResponse.json(
      { error: "Fehler beim Laden der Betriebszustands-Analytics" },
      { status: 500 }
    );
  }
}
