import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { analyzeDegradation, getMaintenanceRecommendations } from "@/lib/scada/degradation-analysis";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// GET /api/energy/analytics/degradation
// Returns degradation trends + maintenance recommendations

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId");
    const monthsParam = searchParams.get("months");
    const months = monthsParam ? parseInt(monthsParam, 10) : 24;

    const [degradation, recommendations] = await Promise.all([
      analyzeDegradation(tenantId, parkId, months),
      getMaintenanceRecommendations(tenantId, parkId),
    ]);

    return NextResponse.json({
      degradation,
      recommendations,
      meta: {
        parkId: parkId || "all",
        months,
        turbineCount: degradation.length,
        recommendationCount: recommendations.length,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler bei Degradationsanalyse");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler bei Degradationsanalyse" });
  }
}
