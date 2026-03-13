import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateEuer } from "@/lib/accounting/reports/euer";

// GET /api/buchhaltung/euer?from=2026-01-01&to=2026-12-31
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Default: full current year
    const now = new Date();
    const periodStart = from ? new Date(from) : new Date(now.getFullYear(), 0, 1);
    const periodEnd = to ? new Date(to) : new Date(now.getFullYear(), 11, 31, 23, 59, 59);

    const result = await generateEuer(check.tenantId!, periodStart, periodEnd);
    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error({ err: error }, "Error generating EÜR");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
