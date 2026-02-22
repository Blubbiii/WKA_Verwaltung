/**
 * Storage Tracking Module
 *
 * Tracks file storage usage per tenant. Integrates with upload/delete operations
 * to maintain an accurate running total of bytes used per tenant.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ============================================================================
// TYPES
// ============================================================================

export interface StorageInfo {
  usedBytes: number;
  limitBytes: number;
  usedFormatted: string;
  limitFormatted: string;
  percentUsed: number;
  isNearLimit: boolean;
  isOverLimit: boolean;
}

export interface StorageBreakdown {
  category: string;
  count: number;
  totalBytes: number;
  totalFormatted: string;
}

export interface StorageInfoWithBreakdown extends StorageInfo {
  breakdown: StorageBreakdown[];
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Increment tenant storage usage after a file upload.
 */
export async function incrementStorageUsage(
  tenantId: string,
  bytes: number
): Promise<void> {
  try {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { storageUsedBytes: { increment: bytes } },
    });
  } catch (error) {
    logger.error(
      { err: error, tenantId, bytes },
      "Failed to increment storage usage"
    );
    // Do not throw - storage tracking failure should not block uploads
  }
}

/**
 * Decrement tenant storage usage after a file deletion.
 * Ensures the value never goes below zero.
 */
export async function decrementStorageUsage(
  tenantId: string,
  bytes: number
): Promise<void> {
  try {
    // First, get current usage to avoid going negative
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { storageUsedBytes: true },
    });

    if (!tenant) return;

    const currentBytes = Number(tenant.storageUsedBytes);
    const decrementBy = Math.min(bytes, currentBytes);

    if (decrementBy > 0) {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { storageUsedBytes: { decrement: decrementBy } },
      });
    }
  } catch (error) {
    logger.error(
      { err: error, tenantId, bytes },
      "Failed to decrement storage usage"
    );
    // Do not throw - storage tracking failure should not block deletions
  }
}

/**
 * Check whether a tenant has enough storage remaining for a given file size.
 * Returns true if the upload is allowed, false if over limit.
 */
export async function checkStorageLimit(
  tenantId: string,
  additionalBytes: number
): Promise<{ allowed: boolean; info: StorageInfo }> {
  const info = await getStorageInfo(tenantId);

  if (!info) {
    // If we cannot determine storage info, allow the upload (fail open)
    return {
      allowed: true,
      info: {
        usedBytes: 0,
        limitBytes: 0,
        usedFormatted: "0 B",
        limitFormatted: "0 B",
        percentUsed: 0,
        isNearLimit: false,
        isOverLimit: false,
      },
    };
  }

  const wouldBeUsed = info.usedBytes + additionalBytes;
  const allowed = wouldBeUsed <= info.limitBytes;

  return { allowed, info };
}

/**
 * Get tenant storage info (usage, limit, percentage).
 */
export async function getStorageInfo(
  tenantId: string
): Promise<StorageInfo | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { storageUsedBytes: true, storageLimit: true },
  });

  if (!tenant) return null;

  const usedBytes = Number(tenant.storageUsedBytes);
  const limitBytes = Number(tenant.storageLimit);

  return {
    usedBytes,
    limitBytes,
    usedFormatted: formatBytes(usedBytes),
    limitFormatted: formatBytes(limitBytes),
    percentUsed:
      limitBytes > 0 ? Math.round((usedBytes / limitBytes) * 100) : 0,
    isNearLimit: usedBytes > limitBytes * 0.9,
    isOverLimit: usedBytes >= limitBytes,
  };
}

/**
 * Get storage info with breakdown by document category.
 */
export async function getStorageInfoWithBreakdown(
  tenantId: string
): Promise<StorageInfoWithBreakdown | null> {
  const info = await getStorageInfo(tenantId);
  if (!info) return null;

  // Aggregate document sizes by category
  const categoryAggregation = await prisma.document.groupBy({
    by: ["category"],
    where: { tenantId },
    _sum: { fileSizeBytes: true },
    _count: true,
  });

  const breakdown: StorageBreakdown[] = categoryAggregation.map((item) => {
    const totalBytes = Number(item._sum.fileSizeBytes || 0);
    return {
      category: item.category,
      count: item._count,
      totalBytes,
      totalFormatted: formatBytes(totalBytes),
    };
  });

  // Sort by totalBytes descending
  breakdown.sort((a, b) => b.totalBytes - a.totalBytes);

  return {
    ...info,
    breakdown,
  };
}

/**
 * Recalculate storage usage from actual document file sizes.
 * Use this for repair/sync when the counter has drifted.
 */
export async function recalculateStorageUsage(
  tenantId: string
): Promise<number> {
  const result = await prisma.document.aggregate({
    where: { tenantId },
    _sum: { fileSizeBytes: true },
  });

  const totalBytes = Number(result._sum.fileSizeBytes || 0);

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { storageUsedBytes: BigInt(totalBytes) },
  });

  logger.info(
    { tenantId, totalBytes },
    "Storage usage recalculated from documents"
  );

  return totalBytes;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
