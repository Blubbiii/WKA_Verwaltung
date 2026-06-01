/**
 * GET /api/buchhaltung/ustva?from=2026-01-01&to=2026-03-31
 *
 * Liefert die UStVA-Daten für einen Zeitraum (Default: aktuelles Quartal).
 * Response-Schema siehe UstvaResult — enthält jetzt (P12) erweiterte
 * Kennzahlen (41/43/46/47/60/66/61/81/84/85/86/89/93), das kleinunternehmer-
 * Flag und ggf. warnings für Alt-Daten ohne TaxCode-Klassifikation.
 *
 * Hinweis: ELSTER-Export-Format ist NICHT betroffen — dieser Endpunkt
 * liefert Roh-Daten, der ELSTER-Adapter (separat) konsumiert sie.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateUstva } from "@/lib/accounting/reports/ustva";

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const now = new Date();
    // Default: aktuelles Quartal
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const quarterEnd = new Date(
      now.getFullYear(),
      Math.floor(now.getMonth() / 3) * 3 + 3,
      0,
      23,
      59,
      59,
    );

    const periodStart = from ? new Date(from) : quarterStart;
    const periodEnd = to ? new Date(to) : quarterEnd;

    if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
      return apiError("BAD_REQUEST", 400, {
        message: "Ungültiges Datumsformat (erwartet: YYYY-MM-DD)",
      });
    }
    if (periodStart > periodEnd) {
      return apiError("BAD_REQUEST", 400, {
        message: "Startdatum muss vor dem Enddatum liegen",
      });
    }

    const result = await generateUstva(check.tenantId, periodStart, periodEnd);
    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error({ err: error }, "Error generating UStVA");
    return apiError("INTERNAL_ERROR", 500, {
      message: "Fehler beim Generieren der UStVA",
    });
  }
}
