import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  getStorageInfoWithBreakdown,
  recalculateStorageUsage,
  getStorageInfo,
} from "@/lib/storage-tracking";
import { apiLogger as logger } from "@/lib/logger";

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
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 400 }
      );
    }

    const storageInfo = await getStorageInfoWithBreakdown(check.tenantId);

    if (!storageInfo) {
      return NextResponse.json(
        { error: "Speicherinformationen nicht verfügbar" },
        { status: 404 }
      );
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
    return NextResponse.json(
      { error: "Fehler beim Laden der Speicherinformationen" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/storage
 * Recalculates storage usage from actual document files.
 * Permission: settings:update
 */
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 400 }
      );
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
    return NextResponse.json(
      { error: "Fehler beim Neuberechnen des Speicherverbrauchs" },
      { status: 500 }
    );
  }
}
