/**
 * GET /api/leases/cpi-due
 *
 * Liefert Pachtverträge mit fälliger Wertsicherungs-Anpassung (CPI/§9 PrKG).
 * Query-Param: horizonDays (default 30) — Vorlaufzeit für "demnächst fällig".
 *
 * Wird verwendet von:
 *  - Dashboard-Widget "Indexierung-Erinnerungen"
 *  - Optional von Cron-Job für E-Mail-Notification
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { findDueCpiAdjustments } from "@/lib/leases/cpi-check";

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("leases:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { searchParams } = new URL(request.url);
    const horizonDays = Math.max(
      0,
      Math.min(parseInt(searchParams.get("horizonDays") ?? "30", 10) || 30, 365),
    );

    const due = await findDueCpiAdjustments(check.tenantId, new Date(), horizonDays);

    return NextResponse.json({
      data: due.map((d) => ({
        leaseId: d.leaseId,
        lessorName: d.lessorName,
        startDate: d.startDate.toISOString(),
        cpiAdjustmentMonths: d.cpiAdjustmentMonths,
        cpiLastAdjustedAt: d.cpiLastAdjustedAt?.toISOString() ?? null,
        nextDueDate: d.nextDueDate.toISOString(),
        daysOverdue: d.daysOverdue,
      })),
      total: due.length,
      overdueCount: due.filter((d) => d.daysOverdue > 0).length,
    });
  } catch (error) {
    logger.error({ err: error }, "CPI-Check fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "CPI-Check fehlgeschlagen" });
  }
}
