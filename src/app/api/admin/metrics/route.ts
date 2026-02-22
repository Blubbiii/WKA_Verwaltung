import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { getMetrics } from "@/lib/monitoring";

/**
 * GET /api/admin/metrics
 * Returns performance metrics snapshot (last 5 minutes).
 * Restricted to SUPERADMIN role.
 */
export async function GET() {
  const check = await requireSuperadmin();
  if (!check.authorized) return check.error!;

  const metrics = getMetrics();
  return NextResponse.json(metrics);
}
