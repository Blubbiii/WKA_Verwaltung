import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { getMetrics } from "@/lib/monitoring";
import { apiLogger as logger } from "@/lib/logger";

/**
 * GET /api/admin/metrics
 * Returns performance metrics snapshot (last 5 minutes).
 * Restricted to SUPERADMIN role.
 */
export async function GET() {
  const check = await requireSuperadmin();
  if (!check.authorized) return check.error!;

  try {
    const metrics = getMetrics();
    return NextResponse.json(metrics);
  } catch (err) {
    logger.error({ err }, "Failed to collect metrics");
    return NextResponse.json({ error: "Metrics collection failed" }, { status: 500 });
  }
}
