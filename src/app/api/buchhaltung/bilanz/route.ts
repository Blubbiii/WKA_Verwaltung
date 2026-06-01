/**
 * GET /api/buchhaltung/bilanz?asOf=YYYY-MM-DD&fiscalYear=YYYY[&fundId=...&consolidate=true]
 *
 * Liefert die HGB §266 Bilanz für tenant zum Stichtag.
 * Bei fundId+consolidate: konsolidierte Bilanz über Fund-Hierarchy.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { computeBilanz } from "@/lib/accounting/reports/bilanz";
import { consolidateFunds } from "@/lib/accounting/consolidation";

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { searchParams } = new URL(request.url);
    const asOfParam = searchParams.get("asOf");
    const fiscalYearParam = searchParams.get("fiscalYear");
    const fundId = searchParams.get("fundId");
    const consolidate = searchParams.get("consolidate") === "true";

    const now = new Date();
    const asOf = asOfParam ? new Date(asOfParam) : now;
    const fiscalYear = fiscalYearParam
      ? parseInt(fiscalYearParam, 10)
      : asOf.getFullYear();

    if (isNaN(asOf.getTime())) {
      return apiError("BAD_REQUEST", 400, {
        message: "Ungültiges asOf-Datum (erwartet: YYYY-MM-DD)",
      });
    }
    if (isNaN(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) {
      return apiError("BAD_REQUEST", 400, {
        message: "Ungültiges Wirtschaftsjahr",
      });
    }

    if (consolidate && fundId) {
      const result = await consolidateFunds(check.tenantId, fundId, fiscalYear, asOf);
      return NextResponse.json({ data: result });
    }

    const result = await computeBilanz(check.tenantId, fiscalYear, asOf);
    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error({ err: error }, "Error generating bilanz");
    return apiError("INTERNAL_ERROR", 500, {
      message: "Fehler beim Generieren der Bilanz",
    });
  }
}
