/**
 * Cache Types for WindparkManager
 *
 * Type definitions for the caching system.
 */

/**
 * Dashboard statistics that can be cached
 */
export interface DashboardStats {
  serverStatus: {
    status: string;
    uptime: number;
    uptimeFormatted: string;
  };
  databaseStatus: {
    status: string;
    responseTimeMs: number;
    type: string;
  };
  storageStatus: {
    status: string;
    type: string;
    endpoint: string;
  };
  databaseStats: {
    tenants: number;
    users: number;
    parks: number;
    turbines: number;
    funds: number;
    shareholders: number;
    plots: number;
    leases: number;
    contracts: number;
    documents: number;
    invoices: number;
    auditLogs: number;
    votes: number;
    persons: number;
  };
  storageStats: {
    totalDocuments: number;
    totalFileSizeBytes: number;
    documentsByCategory: Array<{
      category: string;
      count: number;
    }>;
  };
  recentAuditLogs: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    createdAt: Date | string;
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
    } | null;
  }>;
  systemInfo: {
    nodeVersion: string;
    nextVersion: string;
    prismaVersion: string;
    platform: string;
    arch: string;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    serverTime: string;
  };
}

/**
 * Tenant-specific dashboard stats (filtered by tenant)
 */
export interface TenantDashboardStats {
  parks: number;
  turbines: number;
  funds: number;
  shareholders: number;
  plots: number;
  leases: number;
  contracts: number;
  documents: number;
  invoices: number;
  votes: number;
  activeContracts: number;
  expiringContracts: number;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    createdAt: Date | string;
  }>;
}

/**
 * Tenant settings that can be cached
 */
export interface TenantSettings {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  settings: Record<string, unknown>;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  bankName: string | null;
  iban: string | null;
  bic: string | null;
  taxId: string | null;
  vatId: string | null;
  emailProvider: string | null;
  emailFromAddress: string | null;
  emailFromName: string | null;
}

/**
 * Cache options for set operations
 */
export interface CacheSetOptions {
  /** Time to live in seconds */
  ttl?: number;
  /** Custom key prefix (overrides tenant prefix) */
  prefix?: string;
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  isConnected: boolean;
  hits: number;
  misses: number;
  keys: number;
  memoryUsage?: string;
}

/**
 * Cache key prefixes for different data types
 */
export const CACHE_PREFIXES = {
  DASHBOARD: 'dashboard',
  TENANT: 'tenant',
  USER: 'user',
  PARK: 'park',
  FUND: 'fund',
  SETTINGS: 'settings',
  ANALYTICS: 'analytics',
  ENERGY: 'energy',
} as const;

/**
 * Default TTL values in seconds
 */
export const CACHE_TTL = {
  /** Dashboard stats: 1 minute */
  DASHBOARD: 60,
  /** Dashboard analytics (heavier queries): 5 minutes */
  DASHBOARD_ANALYTICS: 300,
  /** Tenant settings: 10 minutes */
  TENANT_SETTINGS: 600,
  /** User profile: 5 minutes */
  USER_PROFILE: 300,
  /** Park data: 5 minutes */
  PARK_DATA: 300,
  /** Fund data: 5 minutes */
  FUND_DATA: 300,
  /** Energy/SCADA data: 5 minutes */
  ENERGY_DATA: 300,
  /** Short-lived cache: 30 seconds */
  SHORT: 30,
  /** Medium cache: 5 minutes */
  MEDIUM: 300,
  /** Long cache: 1 hour */
  LONG: 3600,
} as const;

/**
 * Pre-defined cache keys for dashboard widget data.
 * Used to consistently reference and invalidate cached widget data.
 */
export const DASHBOARD_CACHE_KEYS = {
  /** Tenant-level aggregate counts (parks, turbines, funds, etc.) */
  TENANT_STATS: 'tenant-stats',
  /** Full analytics (KPIs + Charts) */
  FULL_ANALYTICS: 'full-analytics',
  /** Chart data only (monthly invoices, capital development, docs by type) */
  CHART_DATA: 'chart-data',
  /** Parks overview stats */
  PARKS_STATS: 'parks-stats',
  /** Turbines overview stats */
  TURBINES_STATS: 'turbines-stats',
  /** Invoices overview stats */
  INVOICES_STATS: 'invoices-stats',
  /** Funds overview stats */
  FUNDS_STATS: 'funds-stats',
  /** Shareholders overview stats */
  SHAREHOLDERS_STATS: 'shareholders-stats',
  /** Contracts overview stats */
  CONTRACTS_STATS: 'contracts-stats',
  /** Energy/SCADA overview stats */
  ENERGY_STATS: 'energy-stats',
  /** Recent activity feed */
  RECENT_ACTIVITY: 'recent-activity',
  /** Weather data */
  WEATHER: 'weather',
  /** SCADA summary dashboard data */
  SCADA_SUMMARY: 'scada-summary',
} as const;
