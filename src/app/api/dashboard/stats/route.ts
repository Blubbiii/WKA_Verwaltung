import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { getAllAccessibleIds } from "@/lib/auth/resourceFilter";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { cache } from "@/lib/cache";
import { dashboardCache } from "@/lib/cache/dashboard";
import type { TenantDashboardStats } from "@/lib/cache/types";
import { withMonitoring } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";

/**
 * Build resource filter WHERE clause for parks or funds.
 * Returns undefined (no filter) if user has global access, or an { in: [...] } clause.
 * Falls back to no filtering on error to prevent dashboard from breaking.
 */
async function buildIdFilter(
  userId: string,
  resourceType: "PARK" | "FUND",
  permission: string
): Promise<{ in: string[] } | undefined> {
  try {
    const { ids, hasGlobalAccess } = await getAllAccessibleIds(
      userId,
      resourceType,
      permission
    );

    if (hasGlobalAccess) return undefined; // No restriction needed
    // If no IDs returned but also no global access, this might be
    // a SuperAdmin without explicit permission rows - fall back to no filter
    if (ids.length === 0) return undefined;
    return { in: ids };
  } catch (err) {
    logger.warn({ err }, "[Dashboard] Resource filter failed, falling back to no filter");
    return undefined; // Fall back to showing all (tenant-scoped)
  }
}

/**
 * Fetch tenant-specific dashboard statistics from database.
 * Applies resource-level filtering for parks and funds based on the user's
 * role assignments and direct resource access grants.
 */
async function fetchTenantStats(
  tenantId: string,
  userId: string
): Promise<TenantDashboardStats> {
  // Determine which parks/funds this user can see
  const [parkIdFilter, fundIdFilter] = await Promise.all([
    buildIdFilter(userId, "PARK", PERMISSIONS.PARKS_READ),
    buildIdFilter(userId, "FUND", PERMISSIONS.FUNDS_READ),
  ]);

  const parkWhere = {
    tenantId,
    ...(parkIdFilter && { id: parkIdFilter }),
  };

  const fundWhere = {
    tenantId,
    ...(fundIdFilter && { id: fundIdFilter }),
  };

  // Parallel queries for all counts
  const [
    parksCount,
    turbinesCount,
    fundsCount,
    shareholdersCount,
    plotsCount,
    leasesCount,
    contractsCount,
    documentsCount,
    invoicesCount,
    votesCount,
    activeContractsCount,
    expiringContractsCount,
    recentActivity,
  ] = await Promise.all([
    // Parks (filtered by user access)
    prisma.park.count({ where: parkWhere }),

    // Turbines in user-accessible parks
    prisma.turbine.count({
      where: { park: parkWhere },
    }),

    // Funds (filtered by user access)
    prisma.fund.count({ where: fundWhere }),

    // Shareholders in user-accessible funds
    prisma.shareholder.count({
      where: { fund: fundWhere },
    }),

    // Plots in tenant (scoped to accessible parks if restricted)
    prisma.plot.count({
      where: {
        tenantId,
        ...(parkIdFilter && { parkId: parkIdFilter }),
      },
    }),

    // Leases in tenant
    prisma.lease.count({ where: { tenantId } }),

    // All contracts in tenant
    prisma.contract.count({ where: { tenantId } }),

    // Documents in tenant
    prisma.document.count({ where: { tenantId } }),

    // Invoices in tenant (scoped to accessible funds if restricted)
    prisma.invoice.count({
      where: {
        tenantId,
        ...(fundIdFilter && { fundId: fundIdFilter }),
      },
    }),

    // Votes in tenant
    prisma.vote.count({ where: { tenantId } }),

    // Active contracts
    prisma.contract.count({
      where: {
        tenantId,
        status: "ACTIVE",
      },
    }),

    // Expiring contracts (within next 90 days)
    prisma.contract.count({
      where: {
        tenantId,
        status: "ACTIVE",
        endDate: {
          lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          gte: new Date(),
        },
      },
    }),

    // Recent activity (last 10 audit logs for tenant)
    prisma.auditLog.findMany({
      where: { tenantId },
      take: 10,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    parks: parksCount,
    turbines: turbinesCount,
    funds: fundsCount,
    shareholders: shareholdersCount,
    plots: plotsCount,
    leases: leasesCount,
    contracts: contractsCount,
    documents: documentsCount,
    invoices: invoicesCount,
    votes: votesCount,
    activeContracts: activeContractsCount,
    expiringContracts: expiringContractsCount,
    recentActivity,
  };
}

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics for the current user's tenant
 */
async function getHandler(request: NextRequest) {
  try {
const check = await requireAuth();
    if (!check.authorized) return check.error!;

    const tenantId = check.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { error: "Kein Mandant zugeordnet" },
        { status: 400 }
      );
    }

    // Check for cache bypass via query parameter
    const { searchParams } = new URL(request.url);
    const bypassCache = searchParams.get("fresh") === "true";

    // Get cache status for response
    const cacheStats = await cache.getStats();

    let stats: TenantDashboardStats;
    let fromCache = false;

    // Use userId+tenantId composite cache key for resource-filtered results
    const userId = check.userId!;

    if (bypassCache) {
      // Fetch fresh data and update cache
      stats = await fetchTenantStats(tenantId, userId);
      await dashboardCache.cacheTenantStats(tenantId, stats);
    } else {
      // Try to get from cache, otherwise fetch fresh
      const cachedStats = await dashboardCache.getTenantStats(tenantId);

      if (cachedStats) {
        stats = cachedStats;
        fromCache = true;
      } else {
        stats = await fetchTenantStats(tenantId, userId);
        // Cache the result asynchronously
        dashboardCache.cacheTenantStats(tenantId, stats).catch((err) => {
          logger.warn({ err: err }, "[Dashboard] Failed to cache tenant stats");
        });
      }
    }

    // Build response with cache metadata
    const response = NextResponse.json({
      ...stats,
      _cache: {
        fromCache,
        cacheAvailable: cacheStats.isConnected,
        usingMemoryFallback: cacheStats.usingMemoryFallback,
      },
    });

    // Set cache-control headers for client-side caching
    response.headers.set(
      "Cache-Control",
      "private, max-age=30, stale-while-revalidate=60"
    );

    // Custom headers to indicate cache status
    response.headers.set("X-Cache", fromCache ? "HIT" : "MISS");
    response.headers.set(
      "X-Cache-Backend",
      cacheStats.isConnected ? "redis" : "memory"
    );

    return response;
  } catch (error) {
    logger.error({ err: error }, "Error fetching dashboard stats");
    return NextResponse.json(
      { error: "Fehler beim Laden der Dashboard-Statistiken" },
      { status: 500 }
    );
  }
}

export const GET = withMonitoring(getHandler);

/**
 * DELETE /api/dashboard/stats
 * Invalidate dashboard cache for the current tenant
 */
export async function DELETE() {
  try {
const check = await requireAuth();
    if (!check.authorized) return check.error!;

    const tenantId = check.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { error: "Kein Mandant zugeordnet" },
        { status: 400 }
      );
    }

    await dashboardCache.invalidateTenantStats(tenantId);

    return NextResponse.json({
      message: "Dashboard-Cache wurde invalidiert",
      tenantId,
    });
  } catch (error) {
    logger.error({ err: error }, "Error invalidating dashboard cache");
    return NextResponse.json(
      { error: "Fehler beim Invalidieren des Caches" },
      { status: 500 }
    );
  }
}
