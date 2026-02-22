import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  fetchMonthlyRevenue,
  fetchLostRevenue,
  fetchFinancialSummary,
} from "@/lib/analytics/module-fetchers";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/energy/analytics/financial
// Financial Performance: Monthly Revenue, Lost Revenue, Summary
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
    const [monthly, lostRevenue, summary] = await Promise.all([
      fetchMonthlyRevenue(tenantId, year, parkId),
      fetchLostRevenue(tenantId, year, parkId),
      fetchFinancialSummary(tenantId, year, parkId),
    ]);

    return NextResponse.json({
      monthly,
      lostRevenue,
      summary,
      meta: {
        year,
        parkId: parkId || "all",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der Finanz-Analytics");
    return NextResponse.json(
      { error: "Fehler beim Laden der Finanz-Analytics" },
      { status: 500 }
    );
  }
}
