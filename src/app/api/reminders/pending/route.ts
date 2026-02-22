/**
 * GET /api/reminders/pending
 *
 * Returns a summary of pending action counts per category for the
 * current user's tenant. Used by the dashboard "Handlungsbedarf" widget.
 *
 * Response format:
 * {
 *   overdueInvoices: { count, totalAmount, criticalCount },
 *   expiringContracts: { count, criticalCount },
 *   openSettlements: { count, criticalCount },
 *   expiringDocuments: { count, criticalCount },
 *   totalCount,
 *   hasCritical,
 * }
 */

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { getPendingActionsSummary } from "@/lib/reminders";
import { apiLogger as logger } from "@/lib/logger";

export async function GET() {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error!;

    const tenantId = check.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { error: "Kein Mandant zugeordnet" },
        { status: 400 }
      );
    }

    const summary = await getPendingActionsSummary(tenantId);

    const response = NextResponse.json(summary);

    // Cache for 5 minutes client-side (this data changes slowly)
    response.headers.set(
      "Cache-Control",
      "private, max-age=300, stale-while-revalidate=600"
    );

    return response;
  } catch (error) {
    logger.error(
      { err: error },
      "Error fetching pending actions summary"
    );
    return NextResponse.json(
      { error: "Fehler beim Laden der ausstehenden Aktionen" },
      { status: 500 }
    );
  }
}
