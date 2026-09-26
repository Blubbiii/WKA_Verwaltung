/**
 * Paperless Sync Status API
 *
 * GET /api/integrations/paperless/sync/status
 * Returns aggregated sync status overview.
 */

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getConfigBoolean } from "@/lib/config";
import { mandantDb } from "@/lib/mandant/mandant-db";

export async function GET() {
  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_READ);
    if (!check.authorized) return check.error;
    const db = mandantDb(check.tenantId!);

    const enabled = await getConfigBoolean("paperless.enabled", check.tenantId, false);
    if (!enabled) {
      return apiError("NOT_FOUND", 404, { message: "Paperless integration not enabled" });
    }

    const [total, synced, pending, failed, skipped] = await Promise.all([
      db.document.count({ where: { tenantId: check.tenantId, paperlessSyncStatus: { not: null } } }),
      db.document.count({ where: { tenantId: check.tenantId, paperlessSyncStatus: "SYNCED" } }),
      db.document.count({ where: { tenantId: check.tenantId, paperlessSyncStatus: "PENDING" } }),
      db.document.count({ where: { tenantId: check.tenantId, paperlessSyncStatus: "FAILED" } }),
      db.document.count({ where: { tenantId: check.tenantId, paperlessSyncStatus: "SKIPPED" } }),
    ]);

    return NextResponse.json({
      total,
      synced,
      pending,
      failed,
      skipped,
      notSynced: await db.document.count({
        where: { tenantId: check.tenantId, paperlessSyncStatus: null, fileUrl: { not: "" } },
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError("INTERNAL_ERROR", 500, { message });
  }
}
