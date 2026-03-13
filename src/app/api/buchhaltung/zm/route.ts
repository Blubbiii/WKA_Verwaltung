import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateZm } from "@/lib/accounting/reports/zm";

// GET /api/buchhaltung/zm?from=2026-01-01&to=2026-03-31
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Default: current quarter
    const now = new Date();
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const periodStart = from
      ? new Date(from)
      : new Date(now.getFullYear(), currentQuarter * 3, 1);
    const periodEnd = to
      ? new Date(to)
      : new Date(now.getFullYear(), currentQuarter * 3 + 3, 0, 23, 59, 59);

    const result = await generateZm(check.tenantId!, periodStart, periodEnd);
    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error({ err: error }, "Error generating ZM");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
