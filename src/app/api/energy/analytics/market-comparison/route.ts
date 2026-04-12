import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiLogger as logger } from "@/lib/logger";
import { calculateMarketComparison } from "@/lib/market-data/aggregator";
import { apiError } from "@/lib/api-errors";

// GET /api/energy/analytics/market-comparison?parkId=xxx&year=2026
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.ENERGY_READ);
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

    if (!parkId) {
      return apiError("MISSING_FIELD", undefined, { message: "parkId ist erforderlich" });
    }

    const result = await calculateMarketComparison(check.tenantId!, parkId, year);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fehler beim Berechnen des Marktwert-Vergleichs";
    logger.error({ err: error }, "Error calculating market comparison");
    return apiError("INTERNAL_ERROR", undefined, { message: message });
  }
}
