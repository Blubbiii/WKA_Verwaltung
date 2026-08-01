/**
 * POST /api/cron/bank-fetch
 *
 * Täglicher Lauf über die Bankverbindungen. B7 (Audit 2026-07): „Täglicher
 * automatischer Kontoabruf würde Zahlungsabgleich und Mahnlauf vollständig
 * automatisieren."
 *
 * Planmäßig läuft die Prüfung seit Welle 23 im Worker (`maintenance`-Queue,
 * täglich 06:00 Europe/Berlin) — bewusst vor dem Mahnlauf um 08:00, damit eine
 * seit Tagen stumme Verbindung auffällt, bevor auf Basis veralteter Umsätze
 * gemahnt wird. Dieser Endpunkt bleibt für den Handbetrieb.
 *
 * Vorher stand hier ein empfohlener Rhythmus für einen externen Scheduler —
 * eingerichtet war keiner, der Lauf fand also nie statt.
 *
 * Auth: `CRON_BEARER_TOKEN` als `Authorization: Bearer <token>` — dieselbe
 * Mechanik wie beim Bundesbank-Abruf.
 *
 * Was der Lauf tut und was nicht, steht bei `runBankConnectionCheck()` in
 * `lib/maintenance/tasks.ts`. Kurz: er ruft NICHT bei der Bank ab — das könnte
 * nur ein EBICS-/FinTS-Adapter, und der ist nicht eingerichtet.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { bearerTokenMatches } from "@/lib/auth/timing-safe";
import { runBankConnectionCheck } from "@/lib/maintenance/tasks";

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  const expectedToken = process.env.CRON_BEARER_TOKEN;

  if (!expectedToken) {
    return apiError("FEATURE_DISABLED", 503, {
      message: "Cron-Endpoint nicht konfiguriert (CRON_BEARER_TOKEN fehlt)",
    });
  }
  if (!bearerTokenMatches(auth, expectedToken)) {
    return apiError("UNAUTHORIZED", 401, { message: "Ungültiger Bearer-Token" });
  }

  try {
    const result = await runBankConnectionCheck();
    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error }, "[Cron] Bank-Abruf fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Bank-Abruf konnte nicht geprüft werden" });
  }
}
