/**
 * Cache Invalidation Helpers for WindparkManager
 *
 * Centralized cache invalidation logic to ensure data consistency.
 * Call these functions when entities are created, updated, or deleted.
 */

import { dashboardCache } from './dashboard';
import { tenantCache } from './tenant';
import { cache } from './index';
import { CACHE_PREFIXES } from './types';
import { cacheLogger as logger } from "@/lib/logger";

/**
 * Entity types that can trigger cache invalidation
 */
export type InvalidatableEntity =
  | 'tenant'
  | 'user'
  | 'park'
  | 'turbine'
  | 'fund'
  | 'shareholder'
  | 'plot'
  | 'lease'
  | 'contract'
  | 'document'
  | 'invoice'
  | 'vote'
  | 'energy-settlement'
  | 'energy-production';

/**
 * Cache invalidation context
 */
interface InvalidationContext {
  tenantId?: string;
  entityId?: string;
  entityType: InvalidatableEntity;
  action: 'create' | 'update' | 'delete';
  relatedIds?: {
    parkId?: string;
    fundId?: string;
    tenantSlug?: string;
  };
}

/**
 * Invalidate caches based on entity changes
 * Call this function after any entity modification
 */
export async function invalidateCaches(context: InvalidationContext): Promise<void> {
  const { tenantId, entityType, action, relatedIds } = context;

  // Always invalidate dashboard stats on any entity change
  if (tenantId) {
    await dashboardCache.invalidateTenantStats(tenantId);
  }

  // Always invalidate analytics caches on entity changes (KPIs and charts)
  if (tenantId) {
    await dashboardCache.invalidateAnalytics(tenantId);
  }

  // Entity-specific invalidation
  switch (entityType) {
    case 'tenant':
      if (tenantId) {
        await tenantCache.invalidateAll(tenantId, relatedIds?.tenantSlug);
      }
      // System-wide stats need refresh for tenant changes
      await dashboardCache.invalidateSystemStats();
      break;

    case 'user':
      // Users affect dashboard stats
      await dashboardCache.invalidateSystemStats();
      break;

    case 'park':
      if (relatedIds?.parkId) {
        await dashboardCache.invalidateParkStats(relatedIds.parkId, tenantId);
      }
      if (tenantId) {
        await dashboardCache.invalidateWidgetData(tenantId, 'parks-stats');
      }
      await dashboardCache.invalidateSystemStats();
      break;

    case 'turbine':
      if (relatedIds?.parkId) {
        await dashboardCache.invalidateParkStats(relatedIds.parkId, tenantId);
      }
      if (tenantId) {
        await dashboardCache.invalidateWidgetData(tenantId, 'turbines-stats');
      }
      await dashboardCache.invalidateSystemStats();
      break;

    case 'fund':
      if (relatedIds?.fundId) {
        await dashboardCache.invalidateFundStats(relatedIds.fundId, tenantId);
      }
      if (tenantId) {
        await dashboardCache.invalidateWidgetKeys(tenantId, [
          'funds-stats',
          'shareholders-stats',
        ]);
      }
      await dashboardCache.invalidateSystemStats();
      break;

    case 'shareholder':
      if (relatedIds?.fundId) {
        await dashboardCache.invalidateFundStats(relatedIds.fundId, tenantId);
      }
      if (tenantId) {
        await dashboardCache.invalidateWidgetData(tenantId, 'shareholders-stats');
      }
      break;

    case 'plot':
    case 'lease':
      if (relatedIds?.parkId) {
        await dashboardCache.invalidateParkStats(relatedIds.parkId, tenantId);
      }
      break;

    case 'contract':
      if (tenantId) {
        await dashboardCache.invalidateWidgetData(tenantId, 'contracts-stats');
      }
      break;

    case 'invoice':
      if (tenantId) {
        await dashboardCache.invalidateWidgetData(tenantId, 'invoices-stats');
      }
      break;

    case 'energy-settlement':
    case 'energy-production':
      if (tenantId) {
        await dashboardCache.invalidateWidgetKeys(tenantId, [
          'energy-stats',
          'scada-summary',
        ]);
      }
      if (relatedIds?.parkId) {
        await dashboardCache.invalidateParkStats(relatedIds.parkId, tenantId);
      }
      break;

    case 'document':
      // Documents affect tenant dashboard stats (already invalidated above)
      break;

    case 'vote':
      // Votes affect tenant dashboard stats (already invalidated above)
      break;
  }

  logger.info(`[Cache] Invalidated caches for ${entityType} ${action} (tenant: ${tenantId || 'global'})`);
}

/**
 * Convenience functions for common invalidation scenarios
 */
export const invalidate = {
  /**
   * Invalidate all caches when tenant settings change
   */
  async onTenantUpdate(tenantId: string, slug?: string): Promise<void> {
    await invalidateCaches({
      tenantId,
      entityType: 'tenant',
      action: 'update',
      relatedIds: { tenantSlug: slug },
    });
  },

  /**
   * Invalidate caches when a park is modified
   */
  async onParkChange(tenantId: string, parkId: string, action: 'create' | 'update' | 'delete'): Promise<void> {
    await invalidateCaches({
      tenantId,
      entityId: parkId,
      entityType: 'park',
      action,
      relatedIds: { parkId },
    });
  },

  /**
   * Invalidate caches when a fund is modified
   */
  async onFundChange(tenantId: string, fundId: string, action: 'create' | 'update' | 'delete'): Promise<void> {
    await invalidateCaches({
      tenantId,
      entityId: fundId,
      entityType: 'fund',
      action,
      relatedIds: { fundId },
    });
  },

  /**
   * Invalidate caches when an invoice is created/modified
   */
  async onInvoiceChange(tenantId: string, invoiceId: string, action: 'create' | 'update' | 'delete'): Promise<void> {
    await invalidateCaches({
      tenantId,
      entityId: invoiceId,
      entityType: 'invoice',
      action,
    });
  },

  /**
   * Invalidate caches when a document is uploaded/modified
   */
  async onDocumentChange(
    tenantId: string,
    documentId: string,
    action: 'create' | 'update' | 'delete',
    parkId?: string,
    fundId?: string
  ): Promise<void> {
    await invalidateCaches({
      tenantId,
      entityId: documentId,
      entityType: 'document',
      action,
      relatedIds: { parkId, fundId },
    });
  },

  /**
   * Invalidate caches when a contract is created/modified/deleted
   */
  async onContractChange(
    tenantId: string,
    contractId: string,
    action: 'create' | 'update' | 'delete',
    parkId?: string,
  ): Promise<void> {
    await invalidateCaches({
      tenantId,
      entityId: contractId,
      entityType: 'contract',
      action,
      relatedIds: { parkId },
    });
  },

  /**
   * Invalidate caches when an energy settlement is created/modified/deleted
   */
  async onEnergySettlementChange(
    tenantId: string,
    settlementId: string,
    action: 'create' | 'update' | 'delete',
    parkId?: string,
  ): Promise<void> {
    await invalidateCaches({
      tenantId,
      entityId: settlementId,
      entityType: 'energy-settlement',
      action,
      relatedIds: { parkId },
    });
  },

  /**
   * Invalidate caches when energy production data changes (SCADA import, etc.)
   */
  async onEnergyProductionChange(
    tenantId: string,
    action: 'create' | 'update' | 'delete',
    parkId?: string,
  ): Promise<void> {
    await invalidateCaches({
      tenantId,
      entityType: 'energy-production',
      action,
      relatedIds: { parkId },
    });
  },

  /**
   * Invalidate all dashboard caches for a tenant
   * Use when multiple entities change at once
   */
  async allDashboards(tenantId?: string): Promise<void> {
    if (tenantId) {
      await dashboardCache.invalidateTenantStats(tenantId);
      await dashboardCache.invalidateAnalytics(tenantId);
    }
    await dashboardCache.invalidateSystemStats();
  },

  /**
   * Clear all caches for a tenant
   * Use with caution - only for major changes
   */
  async allForTenant(tenantId: string, slug?: string): Promise<void> {
    await cache.clearTenant(tenantId);
    await tenantCache.invalidateAll(tenantId, slug);
    await dashboardCache.invalidateAllTenantDashboards(tenantId);
    await dashboardCache.invalidateSystemStats();
  },
};

/**
 * Decorator/wrapper to automatically invalidate caches after an operation
 * Usage:
 * ```typescript
 * const result = await withCacheInvalidation(
 *   async () => await prisma.park.create({ ... }),
 *   { tenantId, entityType: 'park', action: 'create' }
 * );
 * ```
 */
export async function withCacheInvalidation<T>(
  operation: () => Promise<T>,
  context: Omit<InvalidationContext, 'action'> & { action?: 'create' | 'update' | 'delete' }
): Promise<T> {
  const result = await operation();
  await invalidateCaches({
    ...context,
    action: context.action || 'update',
  });
  return result;
}
