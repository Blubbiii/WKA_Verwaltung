/**
 * GET /api/buchhaltung/cashflow?fiscalYear=2026
 *
 * C-1 Sprint 5: Kapitalflussrechnung DRS 21 (indirekte Methode).
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateCashflow } from "@/lib/accounting/reports/cashflow";

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { searchParams } = new URL(request.url);
    const fyParam = searchParams.get("fiscalYear");
    const fiscalYear = fyParam ? parseInt(fyParam, 10) : new Date().getFullYear();
    if (isNaN(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
      return apiError("BAD_REQUEST", 400, { message: "Ungültiges Wirtschaftsjahr" });
    }

    const result = await generateCashflow(check.tenantId, fiscalYear);
    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error({ err: error }, "Kapitalflussrechnung fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Kapitalflussrechnung fehlgeschlagen" });
  }
}
