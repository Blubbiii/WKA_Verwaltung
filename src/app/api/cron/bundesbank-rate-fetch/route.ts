/**
 * POST /api/cron/bundesbank-rate-fetch
 *
 * Planmäßig läuft der Abruf seit Welle 23 im Worker (`maintenance`-Queue,
 * montags 04:00 Europe/Berlin). Dieser Endpunkt bleibt für den Handbetrieb.
 *
 * Vorher stand hier „kann von einem externen Scheduler aufgerufen werden" —
 * aufgerufen hat ihn nie jemand, es gab im ganzen Codebase keinen Aufrufer.
 * Der Basiszinssatz wurde also nie aktualisiert.
 *
 * Auth: ENV CRON_BEARER_TOKEN muss als "Authorization: Bearer <token>"
 * mitgeschickt werden.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { runBundesbankRateFetch } from "@/lib/maintenance/tasks";
import { bearerTokenMatches } from "@/lib/auth/timing-safe";

export async function POST(request: NextRequest) {
  // Bearer-Token-Auth
  const auth = request.headers.get("authorization") || "";
  const expectedToken = process.env.CRON_BEARER_TOKEN;

  if (!expectedToken) {
    return apiError("FEATURE_DISABLED", 503, {
      message: "Cron-Endpoint nicht konfiguriert (CRON_BEARER_TOKEN fehlt)",
    });
  }

  // F22: war ein String-Vergleich und damit nicht timing-safe.
  if (!bearerTokenMatches(auth, expectedToken)) {
    return apiError("UNAUTHORIZED", 401, {
      message: "Ungültiger Bearer-Token",
    });
  }

  try {
    const result = await runBundesbankRateFetch();

    return NextResponse.json({
      data: result,
    });
  } catch (error) {
    logger.error({ err: error }, "Cron: Bundesbank-Fetch ausgefallen");
    return apiError("INTERNAL_ERROR", 500, {
      message: "Fehler beim Bundesbank-Fetch",
    });
  }
}
