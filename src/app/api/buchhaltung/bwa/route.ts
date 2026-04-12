import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateBwa } from "@/lib/accounting/reports/bwa";

// GET /api/buchhaltung/bwa?from=2026-01-01&to=2026-12-31
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const now = new Date();
    const periodStart = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const result = await generateBwa(check.tenantId!, periodStart, periodEnd);
    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error({ err: error }, "Error generating BWA");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}
