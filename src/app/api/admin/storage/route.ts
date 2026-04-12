import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  getStorageInfoWithBreakdown,
  recalculateStorageUsage,
  getStorageInfo,
} from "@/lib/storage-tracking";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// Category labels for the breakdown (German UI)
const CATEGORY_LABELS: Record<string, string> = {
  CONTRACT: "Verträge",
  PROTOCOL: "Protokolle",
  REPORT: "Berichte",
  INVOICE: "Rechnungen",
  PERMIT: "Genehmigungen",
  CORRESPONDENCE: "Korrespondenz",
  OTHER: "Sonstiges",
};

/**
 * GET /api/admin/storage
 * Returns storage usage info for the current tenant, including breakdown by category.
 * Permission: settings:read
 */
export async function GET(_request: NextRequest) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const storageInfo = await getStorageInfoWithBreakdown(check.tenantId);

    if (!storageInfo) {
      return apiError("NOT_FOUND", undefined, { message: "Speicherinformationen nicht verfügbar" });
    }

    // Enrich breakdown with German labels
    const enrichedBreakdown = storageInfo.breakdown.map((item) => ({
      ...item,
      label: CATEGORY_LABELS[item.category] || item.category,
    }));

    return NextResponse.json({
      usedBytes: storageInfo.usedBytes,
      limitBytes: storageInfo.limitBytes,
      usedFormatted: storageInfo.usedFormatted,
      limitFormatted: storageInfo.limitFormatted,
      percentUsed: storageInfo.percentUsed,
      isNearLimit: storageInfo.isNearLimit,
      isOverLimit: storageInfo.isOverLimit,
      breakdown: enrichedBreakdown,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching storage info");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Speicherinformationen" });
  }
}

/**
 * POST /api/admin/storage
 * Recalculates storage usage from actual document files.
 * Permission: settings:update
 */
export async function POST(_request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    // Recalculate from actual documents
    const totalBytes = await recalculateStorageUsage(check.tenantId);

    // Return updated info
    const storageInfo = await getStorageInfo(check.tenantId);

    return NextResponse.json({
      message: "Speicherverbrauch wurde neu berechnet",
      recalculatedBytes: totalBytes,
      ...storageInfo,
    });
  } catch (error) {
    logger.error({ err: error }, "Error recalculating storage usage");
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler beim Neuberechnen des Speicherverbrauchs" });
  }
}
