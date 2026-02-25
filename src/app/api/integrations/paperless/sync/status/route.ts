/**
 * Paperless Sync Status API
 *
 * GET /api/integrations/paperless/sync/status
 * Returns aggregated sync status overview.
 */

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getConfigBoolean } from "@/lib/config";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_READ);
    if (!check.authorized) return check.error;

    const enabled = await getConfigBoolean("paperless.enabled", check.tenantId, false);
    if (!enabled) {
      return NextResponse.json({ error: "Paperless integration not enabled" }, { status: 404 });
    }

    const [total, synced, pending, failed, skipped] = await Promise.all([
      prisma.document.count({ where: { tenantId: check.tenantId, paperlessSyncStatus: { not: null } } }),
      prisma.document.count({ where: { tenantId: check.tenantId, paperlessSyncStatus: "SYNCED" } }),
      prisma.document.count({ where: { tenantId: check.tenantId, paperlessSyncStatus: "PENDING" } }),
      prisma.document.count({ where: { tenantId: check.tenantId, paperlessSyncStatus: "FAILED" } }),
      prisma.document.count({ where: { tenantId: check.tenantId, paperlessSyncStatus: "SKIPPED" } }),
    ]);

    return NextResponse.json({
      total,
      synced,
      pending,
      failed,
      skipped,
      notSynced: await prisma.document.count({
        where: { tenantId: check.tenantId, paperlessSyncStatus: null, fileUrl: { not: "" } },
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
