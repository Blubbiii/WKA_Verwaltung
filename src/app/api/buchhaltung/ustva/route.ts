import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateUstva } from "@/lib/accounting/reports/ustva";

// GET /api/buchhaltung/ustva?from=2026-01-01&to=2026-03-31
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const now = new Date();
    // Default: current quarter
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const quarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0, 23, 59, 59);

    const periodStart = from ? new Date(from) : quarterStart;
    const periodEnd = to ? new Date(to) : quarterEnd;

    const result = await generateUstva(check.tenantId!, periodStart, periodEnd);
    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error({ err: error }, "Error generating UStVA");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}
