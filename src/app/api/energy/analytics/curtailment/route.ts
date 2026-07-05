import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { fetchCurtailment } from "@/lib/analytics/module-fetchers";
import { apiLogger as logger } from "@/lib/logger";
import type { CurtailmentResponse } from "@/types/analytics";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// GET /api/energy/analytics/curtailment
// Curtailment Analysis (§13a EnWG Redispatch):
//   - Monthly time-series of curtailment categories
//   - Aggregation by category (wind / technical / forced / external)
//   - Summary with redispatch-relevant loss (externalKw = §13a EnWG)
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const { searchParams } = new URL(request.url);

    const parkId = searchParams.get("parkId");
    const yearParam = searchParams.get("year");

    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (isNaN(year) || year < 2000 || year > 2100) {
      return apiError("VALIDATION_FAILED", undefined, {
        message: "Ungültiges Jahr (2000-2100 erwartet)",
      });
    }

    const data: CurtailmentResponse = await fetchCurtailment(
      tenantId,
      year,
      parkId,
    );

    return NextResponse.json({
      ...data,
      meta: {
        year,
        parkId: parkId || "all",
      },
    });
  } catch (error) {
    logger.error(
      { err: error },
      "Fehler beim Laden der Curtailment-Analytics",
    );
    return apiError("FETCH_FAILED", undefined, {
      message: "Fehler beim Laden der Curtailment-Analytics",
    });
  }
}
