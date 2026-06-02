/**
 * GET /api/buchhaltung/kontoblatt?account=XXXX&from=YYYY-MM-DD&to=YYYY-MM-DD
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateKontoblatt } from "@/lib/accounting/reports/kontoblatt";

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { searchParams } = new URL(request.url);
    const account = searchParams.get("account");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!account) {
      return apiError("BAD_REQUEST", 400, { message: "Parameter 'account' fehlt" });
    }

    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);

    const periodStart = from ? new Date(from) : yearStart;
    const periodEnd = to ? new Date(to) : yearEnd;

    if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
      return apiError("BAD_REQUEST", 400, {
        message: "Ungültiges Datumsformat (erwartet: YYYY-MM-DD)",
      });
    }

    const result = await generateKontoblatt(check.tenantId, account, periodStart, periodEnd);
    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error({ err: error }, "Error generating Kontoblatt");
    return apiError("INTERNAL_ERROR", 500, {
      message: "Fehler beim Generieren des Kontoblatts",
    });
  }
}
