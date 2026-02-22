/**
 * Dashboard Statistics Cache for WindparkManager
 *
 * Provides caching utilities for dashboard statistics.
 * Dashboard stats are cached for 1 minute to reduce database load.
 *
 * Supports:
 * - System-wide stats (SUPERADMIN)
 * - Tenant-level aggregate stats
 * - Park/Fund-specific stats
 * - Per-widget data caching with tenant isolation
 * - Analytics cache (KPIs + Charts)
 */

import { cache } from './index';
import { DashboardStats, TenantDashboardStats, CACHE_TTL, CACHE_PREFIXES, DASHBOARD_CACHE_KEYS } from './types';
import { cacheLogger } from '@/lib/logger';

/**
 * Cache key builders for dashboard
 */
const keys = {
  /** System-wide dashboard stats (admin only) */
  systemStats: () => `${CACHE_PREFIXES.DASHBOARD}:system`,

  /** Tenant-specific dashboard stats */
  tenantStats: (tenantId: string) => `${CACHE_PREFIXES.DASHBOARD}:tenant:${tenantId}`,

  /** Park-specific stats */
  parkStats: (parkId: string) => `${CACHE_PREFIXES.DASHBOARD}:park:${parkId}`,

  /** Fund-specific stats */
  fundStats: (fundId: string) => `${CACHE_PREFIXES.DASHBOARD}:fund:${fundId}`,

  /** Widget-specific data with tenant isolation */
  widgetData: (tenantId: string, widgetKey: string) =>
    `${CACHE_PREFIXES.DASHBOARD}:widget:${tenantId}:${widgetKey}`,

  /** Analytics data (KPIs + Charts) with tenant isolation */
  analytics: (tenantId: string, subKey: string) =>
    `${CACHE_PREFIXES.ANALYTICS}:${subKey}:${tenantId}`,
};

/**
 * Dashboard cache utilities
 */
export const dashboardCache = {
  /**
   * Cache system-wide dashboard statistics (for SUPERADMIN)
   * @param stats Dashboard statistics to cache
   * @param ttl Optional TTL in seconds (default: 60)
   */
  async cacheSystemStats(stats: DashboardStats, ttl: number = CACHE_TTL.DASHBOARD): Promise<boolean> {
    return cache.set(keys.systemStats(), stats, ttl);
  },

  /**
   * Get cached system-wide dashboard statistics
   */
  async getSystemStats(): Promise<DashboardStats | null> {
    return cache.get<DashboardStats>(keys.systemStats());
  },

  /**
   * Get or fetch system-wide dashboard statistics
   * @param fetchFn Function to fetch stats if not cached
   * @param ttl Optional TTL in seconds
   */
  async getOrFetchSystemStats(
    fetchFn: () => Promise<DashboardStats>,
    ttl: number = CACHE_TTL.DASHBOARD
  ): Promise<DashboardStats> {
    return cache.getOrSet(keys.systemStats(), fetchFn, ttl);
  },

  /**
   * Invalidate system-wide dashboard statistics
   */
  async invalidateSystemStats(): Promise<boolean> {
    return cache.del(keys.systemStats());
  },

  /**
   * Cache tenant-specific dashboard statistics
   * @param tenantId Tenant ID
   * @param stats Dashboard statistics to cache
   * @param ttl Optional TTL in seconds (default: 60)
   */
  async cacheTenantStats(
    tenantId: string,
    stats: TenantDashboardStats,
    ttl: number = CACHE_TTL.DASHBOARD
  ): Promise<boolean> {
    return cache.set(keys.tenantStats(tenantId), stats, ttl, tenantId);
  },

  /**
   * Get cached tenant-specific dashboard statistics
   * @param tenantId Tenant ID
   */
  async getTenantStats(tenantId: string): Promise<TenantDashboardStats | null> {
    return cache.get<TenantDashboardStats>(keys.tenantStats(tenantId), tenantId);
  },

  /**
   * Get or fetch tenant-specific dashboard statistics
   * @param tenantId Tenant ID
   * @param fetchFn Function to fetch stats if not cached
   * @param ttl Optional TTL in seconds
   */
  async getOrFetchTenantStats(
    tenantId: string,
    fetchFn: () => Promise<TenantDashboardStats>,
    ttl: number = CACHE_TTL.DASHBOARD
  ): Promise<TenantDashboardStats> {
    return cache.getOrSet(keys.tenantStats(tenantId), fetchFn, ttl, tenantId);
  },

  /**
   * Invalidate tenant-specific dashboard statistics
   * @param tenantId Tenant ID
   */
  async invalidateTenantStats(tenantId: string): Promise<boolean> {
    return cache.del(keys.tenantStats(tenantId), tenantId);
  },

  /**
   * Cache park-specific statistics
   * @param parkId Park ID
   * @param stats Park statistics to cache
   * @param tenantId Optional tenant ID for isolation
   * @param ttl Optional TTL in seconds
   */
  async cacheParkStats<T>(
    parkId: string,
    stats: T,
    tenantId?: string,
    ttl: number = CACHE_TTL.DASHBOARD
  ): Promise<boolean> {
    return cache.set(keys.parkStats(parkId), stats, ttl, tenantId);
  },

  /**
   * Get cached park-specific statistics
   * @param parkId Park ID
   * @param tenantId Optional tenant ID for isolation
   */
  async getParkStats<T>(parkId: string, tenantId?: string): Promise<T | null> {
    return cache.get<T>(keys.parkStats(parkId), tenantId);
  },

  /**
   * Invalidate park-specific statistics
   * @param parkId Park ID
   * @param tenantId Optional tenant ID for isolation
   */
  async invalidateParkStats(parkId: string, tenantId?: string): Promise<boolean> {
    return cache.del(keys.parkStats(parkId), tenantId);
  },

  /**
   * Cache fund-specific statistics
   * @param fundId Fund ID
   * @param stats Fund statistics to cache
   * @param tenantId Optional tenant ID for isolation
   * @param ttl Optional TTL in seconds
   */
  async cacheFundStats<T>(
    fundId: string,
    stats: T,
    tenantId?: string,
    ttl: number = CACHE_TTL.DASHBOARD
  ): Promise<boolean> {
    return cache.set(keys.fundStats(fundId), stats, ttl, tenantId);
  },

  /**
   * Get cached fund-specific statistics
   * @param fundId Fund ID
   * @param tenantId Optional tenant ID for isolation
   */
  async getFundStats<T>(fundId: string, tenantId?: string): Promise<T | null> {
    return cache.get<T>(keys.fundStats(fundId), tenantId);
  },

  /**
   * Invalidate fund-specific statistics
   * @param fundId Fund ID
   * @param tenantId Optional tenant ID for isolation
   */
  async invalidateFundStats(fundId: string, tenantId?: string): Promise<boolean> {
    return cache.del(keys.fundStats(fundId), tenantId);
  },

  // =========================================================================
  // Per-Widget Data Caching
  // =========================================================================

  /**
   * Get or fetch cached data for a specific dashboard widget.
   * This is the primary method for widget-level caching.
   *
   * @param tenantId Tenant ID for cache isolation
   * @param widgetKey One of DASHBOARD_CACHE_KEYS (e.g. 'parks-stats')
   * @param fetchFn Function to fetch fresh data if cache is empty
   * @param ttl TTL in seconds (default: CACHE_TTL.DASHBOARD = 60s)
   * @returns Cached or freshly fetched data
   */
  async getOrFetchWidgetData<T>(
    tenantId: string,
    widgetKey: string,
    fetchFn: () => Promise<T>,
    ttl: number = CACHE_TTL.DASHBOARD,
  ): Promise<{ data: T; fromCache: boolean }> {
    const cacheKey = keys.widgetData(tenantId, widgetKey);

    try {
      const cached = await cache.get<T>(cacheKey, tenantId);
      if (cached !== null) {
        return { data: cached, fromCache: true };
      }
    } catch (error) {
      cacheLogger.warn({ err: error, widgetKey }, 'Widget cache read error');
    }

    // Cache miss: fetch fresh data
    const data = await fetchFn();

    // Store in cache (non-blocking)
    cache.set(cacheKey, data, ttl, tenantId).catch((err) => {
      cacheLogger.warn({ err, widgetKey }, 'Widget cache write error');
    });

    return { data, fromCache: false };
  },

  /**
   * Invalidate cached data for a specific widget key
   * @param tenantId Tenant ID
   * @param widgetKey One of DASHBOARD_CACHE_KEYS
   */
  async invalidateWidgetData(tenantId: string, widgetKey: string): Promise<boolean> {
    return cache.del(keys.widgetData(tenantId, widgetKey), tenantId);
  },

  /**
   * Invalidate multiple widget keys for a tenant at once.
   * Use after mutations that affect several widgets.
   * @param tenantId Tenant ID
   * @param widgetKeys Array of DASHBOARD_CACHE_KEYS values
   */
  async invalidateWidgetKeys(tenantId: string, widgetKeys: string[]): Promise<void> {
    await Promise.all(
      widgetKeys.map((key) => cache.del(keys.widgetData(tenantId, key), tenantId))
    );
  },

  // =========================================================================
  // Analytics Cache (Full KPIs + Charts)
  // =========================================================================

  /**
   * Invalidate analytics caches for a tenant.
   * Clears both full analytics and chart-only caches.
   * @param tenantId Tenant ID
   */
  async invalidateAnalytics(tenantId: string): Promise<void> {
    await Promise.all([
      cache.del(keys.analytics(tenantId, 'full')),
      cache.del(keys.analytics(tenantId, 'charts')),
    ]);
  },

  // =========================================================================
  // Bulk Invalidation
  // =========================================================================

  /**
   * Invalidate all dashboard caches for a tenant
   * Use this when major data changes occur
   * @param tenantId Tenant ID
   */
  async invalidateAllTenantDashboards(tenantId: string): Promise<boolean> {
    // Invalidate tenant stats
    await cache.delPattern(`${CACHE_PREFIXES.DASHBOARD}:*`, tenantId);
    // Invalidate analytics caches
    await this.invalidateAnalytics(tenantId);
    return true;
  },

  /**
   * Invalidate all dashboard caches system-wide
   * Use with caution - only for major system changes
   */
  async invalidateAll(): Promise<boolean> {
    // Invalidate system stats
    await cache.del(keys.systemStats());
    // Invalidate all tenant stats (pattern match)
    await cache.delPattern(`${CACHE_PREFIXES.DASHBOARD}:*`);
    // Invalidate all analytics caches
    await cache.delPattern(`${CACHE_PREFIXES.ANALYTICS}:*`);
    return true;
  },
};

// Re-export cache keys for convenience
export { DASHBOARD_CACHE_KEYS };

// Legacy function aliases for backward compatibility
export const cacheDashboardStats = dashboardCache.cacheTenantStats;
export const getCachedDashboardStats = dashboardCache.getTenantStats;
export const invalidateDashboardStats = dashboardCache.invalidateTenantStats;
