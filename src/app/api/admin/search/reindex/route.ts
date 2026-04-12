/**
 * POST /api/admin/search/reindex
 * Triggers a full re-index of all entities for the current tenant.
 * Requires admin permission.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { reindexAll, ensureIndices } from "@/lib/search/indexer";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

export async function POST() {
  try {
    const check = await requirePermission("system:settings");
    if (!check.authorized) return check.error;
    if (!check.tenantId) return apiError("BAD_REQUEST", undefined, { message: "Kein Mandant" });

    await ensureIndices();
    const { indexed, errors } = await reindexAll(check.tenantId);

    logger.info({ indexed, errors, tenantId: check.tenantId }, "[Search] Re-index triggered");

    return NextResponse.json({ success: true, indexed, errors });
  } catch (error) {
    logger.error({ err: error }, "[Search] Re-index failed");
    return apiError("INTERNAL_ERROR", undefined, { message: "Re-Index fehlgeschlagen" });
  }
}
