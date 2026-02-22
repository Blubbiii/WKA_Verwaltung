import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { cache } from "@/lib/cache";
import { dashboardCache } from "@/lib/cache/dashboard";
import type { DashboardStats } from "@/lib/cache/types";
import { apiLogger as logger } from "@/lib/logger";

/**
 * Fetch fresh system statistics from database
 */
async function fetchSystemStats(): Promise<DashboardStats> {
  const startTime = Date.now();

  // Database statistics - record counts per table
  const [
    tenantsCount,
    usersCount,
    parksCount,
    turbinesCount,
    fundsCount,
    shareholdersCount,
    plotsCount,
    leasesCount,
    contractsCount,
    documentsCount,
    invoicesCount,
    auditLogsCount,
    votesCount,
    personsCount,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
    prisma.park.count(),
    prisma.turbine.count(),
    prisma.fund.count(),
    prisma.shareholder.count(),
    prisma.plot.count(),
    prisma.lease.count(),
    prisma.contract.count(),
    prisma.document.count(),
    prisma.invoice.count(),
    prisma.auditLog.count(),
    prisma.vote.count(),
    prisma.person.count(),
  ]);

  const dbResponseTime = Date.now() - startTime;

  // Document statistics
  const documentStats = await prisma.document.aggregate({
    _sum: {
      fileSizeBytes: true,
    },
    _count: true,
  });

  // Documents by category
  const documentsByCategory = await prisma.document.groupBy({
    by: ["category"],
    _count: true,
  });

  // Recent audit logs (last 10)
  const recentAuditLogs = await prisma.auditLog.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  // Get system info
  const systemInfo = {
    nodeVersion: process.version,
    nextVersion: "15.x",
    prismaVersion: "6.x",
    platform: process.platform,
    arch: process.arch,
    uptime: Math.floor(process.uptime()),
    memoryUsage: process.memoryUsage(),
    serverTime: new Date().toISOString(),
  };

  // Database record counts
  const databaseStats = {
    tenants: tenantsCount,
    users: usersCount,
    parks: parksCount,
    turbines: turbinesCount,
    funds: fundsCount,
    shareholders: shareholdersCount,
    plots: plotsCount,
    leases: leasesCount,
    contracts: contractsCount,
    documents: documentsCount,
    invoices: invoicesCount,
    auditLogs: auditLogsCount,
    votes: votesCount,
    persons: personsCount,
  };

  // Storage stats
  const storageStats = {
    totalDocuments: documentStats._count,
    totalFileSizeBytes: documentStats._sum.fileSizeBytes
      ? Number(documentStats._sum.fileSizeBytes)
      : 0,
    documentsByCategory: documentsByCategory.map((d) => ({
      category: d.category,
      count: d._count,
    })),
  };

  // Server status
  const serverStatus = {
    status: "online",
    uptime: systemInfo.uptime,
    uptimeFormatted: formatUptime(systemInfo.uptime),
  };

  // Database status
  const databaseStatus = {
    status: "connected",
    responseTimeMs: dbResponseTime,
    type: "PostgreSQL",
  };

  // Storage status (MinIO/S3)
  const storageStatus = {
    status: "connected",
    type: process.env.STORAGE_TYPE || "local",
    endpoint: process.env.MINIO_ENDPOINT || process.env.S3_ENDPOINT || "local",
  };

  return {
    serverStatus,
    databaseStatus,
    storageStatus,
    databaseStats,
    storageStats,
    recentAuditLogs,
    systemInfo,
  };
}

// Get system statistics with caching
export async function GET(request: Request) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error!;

    // Check for cache bypass via query parameter
    const { searchParams } = new URL(request.url);
    const bypassCache = searchParams.get("fresh") === "true";

    // Get cache status for response headers
    const cacheStats = await cache.getStats();

    let stats: DashboardStats;
    let fromCache = false;

    if (bypassCache) {
      // Fetch fresh data and update cache
      stats = await fetchSystemStats();
      await dashboardCache.cacheSystemStats(stats);
    } else {
      // Try to get from cache, otherwise fetch fresh
      const cachedStats = await dashboardCache.getSystemStats();

      if (cachedStats) {
        stats = cachedStats;
        fromCache = true;
      } else {
        stats = await fetchSystemStats();
        // Cache the result asynchronously
        dashboardCache.cacheSystemStats(stats).catch((err) => {
          logger.warn({ err: err }, "[Stats] Failed to cache system stats");
        });
      }
    }

    // Build response with cache headers
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

    // Custom header to indicate cache status
    response.headers.set("X-Cache", fromCache ? "HIT" : "MISS");
    response.headers.set(
      "X-Cache-Backend",
      cacheStats.isConnected ? "redis" : "memory"
    );

    return response;
  } catch (error) {
    logger.error({ err: error }, "Error fetching system stats");
    return NextResponse.json(
      { error: "Fehler beim Laden der System-Statistiken" },
      { status: 500 }
    );
  }
}

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}
