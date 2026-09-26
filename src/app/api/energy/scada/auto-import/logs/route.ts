import { NextRequest, NextResponse } from "next/server";
import { mandantDb } from "@/lib/mandant/mandant-db";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// GET /api/energy/scada/auto-import/logs
// Returns auto-import log history
//
// Query params:
//   ?limit=20      - Number of entries to return (default: 20, max: 100)
//   ?offset=0      - Pagination offset (default: 0)
//   ?status=SUCCESS - Optional filter by status
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;
    const db = mandantDb(check.tenantId!);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "20", 10) || 20,
      100,
    );
    const offset = parseInt(searchParams.get("offset") || "0", 10) || 0;
    const statusFilter = searchParams.get("status");

    const where: Record<string, unknown> = {
      tenantId: check.tenantId!,
    };

    if (statusFilter && ["RUNNING", "SUCCESS", "PARTIAL", "FAILED"].includes(statusFilter)) {
      where.status = statusFilter;
    }

    const [logs, total] = await Promise.all([
      db.scadaAutoImportLog.findMany({
        where,
        orderBy: { startedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.scadaAutoImportLog.count({ where }),
    ]);

    return NextResponse.json({
      data: logs,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden der Auto-Import Logs");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Auto-Import Logs" });
  }
}
