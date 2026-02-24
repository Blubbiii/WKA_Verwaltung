import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { cache } from "@/lib/cache";
import { dashboardCache } from "@/lib/cache/dashboard";
import { apiLogger as logger } from "@/lib/logger";

/**
 * GET /api/admin/cache
 * Get cache status and statistics (SUPERADMIN only)
 *
 * Returns:
 * - Connection status (Redis vs. memory fallback)
 * - Hit/miss counters and hit rate
 * - Redis key count and memory usage
 * - In-process invalidation count
 */
export async function GET() {
  try {
const check = await requireSuperadmin();
    if (!check.authorized) return check.error!;

    const [stats, isHealthy] = await Promise.all([
      cache.getStats(),
      cache.isHealthy(),
    ]);

    return NextResponse.json({
      status: isHealthy ? "healthy" : "degraded",
      backend: stats.isConnected ? "redis" : "memory",
      usingMemoryFallback: stats.usingMemoryFallback,
      memoryCacheSize: stats.memoryCacheSize,
      performance: {
        hits: stats.hits,
        misses: stats.misses,
        hitRate: stats.hitRate,
        invalidations: stats.invalidations,
      },
      redis: stats.isConnected ? {
        keyCount: stats.redisKeyCount ?? null,
        memoryUsage: stats.redisMemoryUsage ?? null,
      } : null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching cache status");
    return NextResponse.json(
      { error: "Fehler beim Laden des Cache-Status" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/cache
 * Clear all caches (SUPERADMIN only)
 */
export async function DELETE(request: Request) {
  try {
const check = await requireSuperadmin();
    if (!check.authorized) return check.error!;

    // Check query params for specific cache type
    const { searchParams } = new URL(request.url);
    const cacheType = searchParams.get("type");
    const tenantId = searchParams.get("tenantId");

    let message = "";

    switch (cacheType) {
      case "dashboard":
        if (tenantId) {
          await dashboardCache.invalidateTenantStats(tenantId);
          message = `Dashboard-Cache für Mandant ${tenantId} wurde gelöscht`;
        } else {
          await dashboardCache.invalidateAll();
          message = "Alle Dashboard-Caches wurden gelöscht";
        }
        break;

      case "system":
        await dashboardCache.invalidateSystemStats();
        message = "System-Stats-Cache wurde gelöscht";
        break;

      case "tenant":
        if (tenantId) {
          await cache.clearTenant(tenantId);
          message = `Alle Caches für Mandant ${tenantId} wurden gelöscht`;
        } else {
          return NextResponse.json(
            { error: "tenantId erforderlich für type=tenant" },
            { status: 400 }
          );
        }
        break;

      default:
        // Clear everything
        await dashboardCache.invalidateAll();
        message = "Alle Caches wurden gelöscht";
    }

    return NextResponse.json({
      success: true,
      message,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, "Error clearing cache");
    return NextResponse.json(
      { error: "Fehler beim Löschen des Caches" },
      { status: 500 }
    );
  }
}
