/**
 * Tenant Settings Cache for WindparkManager
 *
 * Provides caching utilities for tenant settings.
 * Tenant settings are cached for 10 minutes since they change rarely.
 */

import { cache } from './index';
import { TenantSettings, CACHE_TTL, CACHE_PREFIXES } from './types';

/**
 * Cache key builders for tenant data
 */
const keys = {
  /** Tenant settings */
  settings: (tenantId: string) => `${CACHE_PREFIXES.TENANT}:${tenantId}:settings`,

  /** Tenant by slug (for lookup) */
  bySlug: (slug: string) => `${CACHE_PREFIXES.TENANT}:slug:${slug}`,

  /** Tenant features/capabilities */
  features: (tenantId: string) => `${CACHE_PREFIXES.TENANT}:${tenantId}:features`,

  /** Tenant email configuration */
  emailConfig: (tenantId: string) => `${CACHE_PREFIXES.TENANT}:${tenantId}:email`,

  /** Tenant branding/theme */
  branding: (tenantId: string) => `${CACHE_PREFIXES.TENANT}:${tenantId}:branding`,
};

/**
 * Tenant cache utilities
 */
export const tenantCache = {
  /**
   * Cache tenant settings
   * @param tenantId Tenant ID
   * @param settings Tenant settings to cache
   * @param ttl Optional TTL in seconds (default: 600 = 10 minutes)
   */
  async cacheSettings(
    tenantId: string,
    settings: TenantSettings,
    ttl: number = CACHE_TTL.TENANT_SETTINGS
  ): Promise<boolean> {
    // Also cache by slug for quick lookup
    if (settings.slug) {
      await cache.set(keys.bySlug(settings.slug), tenantId, ttl);
    }
    return cache.set(keys.settings(tenantId), settings, ttl, tenantId);
  },

  /**
   * Get cached tenant settings
   * @param tenantId Tenant ID
   */
  async getSettings(tenantId: string): Promise<TenantSettings | null> {
    return cache.get<TenantSettings>(keys.settings(tenantId), tenantId);
  },

  /**
   * Get or fetch tenant settings
   * @param tenantId Tenant ID
   * @param fetchFn Function to fetch settings if not cached
   * @param ttl Optional TTL in seconds
   */
  async getOrFetchSettings(
    tenantId: string,
    fetchFn: () => Promise<TenantSettings>,
    ttl: number = CACHE_TTL.TENANT_SETTINGS
  ): Promise<TenantSettings> {
    return cache.getOrSet(keys.settings(tenantId), fetchFn, ttl, tenantId);
  },

  /**
   * Invalidate tenant settings cache
   * Call this when tenant settings are updated
   * @param tenantId Tenant ID
   * @param slug Optional slug to also invalidate slug lookup
   */
  async invalidateSettings(tenantId: string, slug?: string): Promise<boolean> {
    if (slug) {
      await cache.del(keys.bySlug(slug));
    }
    return cache.del(keys.settings(tenantId), tenantId);
  },

  /**
   * Get tenant ID by slug
   * @param slug Tenant slug
   */
  async getTenantIdBySlug(slug: string): Promise<string | null> {
    return cache.get<string>(keys.bySlug(slug));
  },

  /**
   * Cache tenant branding/theme settings
   * @param tenantId Tenant ID
   * @param branding Branding configuration
   * @param ttl Optional TTL in seconds
   */
  async cacheBranding<T>(
    tenantId: string,
    branding: T,
    ttl: number = CACHE_TTL.TENANT_SETTINGS
  ): Promise<boolean> {
    return cache.set(keys.branding(tenantId), branding, ttl, tenantId);
  },

  /**
   * Get cached tenant branding
   * @param tenantId Tenant ID
   */
  async getBranding<T>(tenantId: string): Promise<T | null> {
    return cache.get<T>(keys.branding(tenantId), tenantId);
  },

  /**
   * Invalidate tenant branding cache
   * @param tenantId Tenant ID
   */
  async invalidateBranding(tenantId: string): Promise<boolean> {
    return cache.del(keys.branding(tenantId), tenantId);
  },

  /**
   * Cache tenant email configuration
   * @param tenantId Tenant ID
   * @param emailConfig Email configuration
   * @param ttl Optional TTL in seconds
   */
  async cacheEmailConfig<T>(
    tenantId: string,
    emailConfig: T,
    ttl: number = CACHE_TTL.TENANT_SETTINGS
  ): Promise<boolean> {
    return cache.set(keys.emailConfig(tenantId), emailConfig, ttl, tenantId);
  },

  /**
   * Get cached tenant email configuration
   * @param tenantId Tenant ID
   */
  async getEmailConfig<T>(tenantId: string): Promise<T | null> {
    return cache.get<T>(keys.emailConfig(tenantId), tenantId);
  },

  /**
   * Invalidate tenant email configuration cache
   * @param tenantId Tenant ID
   */
  async invalidateEmailConfig(tenantId: string): Promise<boolean> {
    return cache.del(keys.emailConfig(tenantId), tenantId);
  },

  /**
   * Cache tenant features/capabilities
   * @param tenantId Tenant ID
   * @param features Features configuration
   * @param ttl Optional TTL in seconds
   */
  async cacheFeatures<T>(
    tenantId: string,
    features: T,
    ttl: number = CACHE_TTL.TENANT_SETTINGS
  ): Promise<boolean> {
    return cache.set(keys.features(tenantId), features, ttl, tenantId);
  },

  /**
   * Get cached tenant features
   * @param tenantId Tenant ID
   */
  async getFeatures<T>(tenantId: string): Promise<T | null> {
    return cache.get<T>(keys.features(tenantId), tenantId);
  },

  /**
   * Invalidate tenant features cache
   * @param tenantId Tenant ID
   */
  async invalidateFeatures(tenantId: string): Promise<boolean> {
    return cache.del(keys.features(tenantId), tenantId);
  },

  /**
   * Invalidate all cached data for a tenant
   * Use this when the tenant is updated or deleted
   * @param tenantId Tenant ID
   * @param slug Optional slug to also invalidate
   */
  async invalidateAll(tenantId: string, slug?: string): Promise<boolean> {
    const promises: Promise<boolean>[] = [
      cache.del(keys.settings(tenantId), tenantId),
      cache.del(keys.branding(tenantId), tenantId),
      cache.del(keys.emailConfig(tenantId), tenantId),
      cache.del(keys.features(tenantId), tenantId),
    ];

    if (slug) {
      promises.push(cache.del(keys.bySlug(slug)));
    }

    await Promise.all(promises);
    return true;
  },
};

// Legacy function aliases for backward compatibility
export const cacheTenantSettings = tenantCache.cacheSettings;
export const getCachedTenantSettings = tenantCache.getSettings;
export const invalidateTenantSettings = tenantCache.invalidateSettings;
