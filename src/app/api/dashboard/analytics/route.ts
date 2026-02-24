import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin } from "@/lib/auth/withPermission";
import { getFullAnalytics, clearAnalyticsCache } from "@/lib/analytics";
import { withMonitoring } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/dashboard/analytics
// Liefert alle Dashboard-KPIs und Chart-Daten (with Redis caching)
// =============================================================================

async function getHandler(_request: NextRequest) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const analytics = await getFullAnalytics(tenantId);

    // Extract cache hit indicator (set by getFullAnalytics)
    const cacheHit = analytics._cacheHit ?? false;

    // Remove internal _cacheHit flag from response payload
    const { _cacheHit, ...responseData } = analytics;

    return NextResponse.json(responseData, {
      headers: {
        "X-Cache": cacheHit ? "HIT" : "MISS",
        // Browser-Cache für 30 Sekunden, dann revalidieren
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching analytics");
    return NextResponse.json(
      { error: "Fehler beim Laden der Analytics-Daten" },
      { status: 500 }
    );
  }
}

export const GET = withMonitoring(getHandler);

// =============================================================================
// POST /api/dashboard/analytics
// Cache invalidieren (Admin-Funktion) -- now clears Redis cache
// =============================================================================

async function postHandler(_request: NextRequest) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    await clearAnalyticsCache(tenantId);

    return NextResponse.json({
      success: true,
      message: "Analytics-Cache wurde geleert",
    });
  } catch (error) {
    logger.error({ err: error }, "Error clearing analytics cache");
    return NextResponse.json(
      { error: "Fehler beim Leeren des Caches" },
      { status: 500 }
    );
  }
}

export const POST = withMonitoring(postHandler);
