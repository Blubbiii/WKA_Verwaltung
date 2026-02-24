import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { fetchTurbineComparison } from "@/lib/analytics/module-fetchers";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/analytics/turbine-comparison
// Turbine Comparison: Ranked performance + Power Curve Overlays
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

    const result = await fetchTurbineComparison(tenantId, year, parkId);

    return NextResponse.json({
      comparison: result.comparison,
      powerCurves: result.powerCurves,
      meta: {
        year,
        parkId: parkId || "all",
      },
    });
  } catch (error) {
    logger.error(
      { err: error },
      "Fehler beim Laden der Turbinen-Vergleichsdaten"
    );
    return NextResponse.json(
      { error: "Fehler beim Laden der Turbinen-Vergleichsdaten" },
      { status: 500 }
    );
  }
}
