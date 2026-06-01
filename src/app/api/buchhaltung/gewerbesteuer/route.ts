/**
 * GET /api/buchhaltung/gewerbesteuer?year=YYYY
 *
 * Liefert die GewSt-Hinzurechnungs-Berechnung §8 Nr 1 GewStG für ein
 * Wirtschaftsjahr.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { computeGewSt } from "@/lib/accounting/reports/gewerbesteuer";

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

    if (isNaN(year) || year < 2000 || year > 2100) {
      return apiError("BAD_REQUEST", 400, {
        message: "Ungültiges Wirtschaftsjahr (erwartet: YYYY)",
      });
    }

    const result = await computeGewSt(check.tenantId, year);
    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error({ err: error }, "Error generating GewSt report");
    return apiError("INTERNAL_ERROR", 500, {
      message: "Fehler beim Generieren der Gewerbesteuer-Hinzurechnung",
    });
  }
}
