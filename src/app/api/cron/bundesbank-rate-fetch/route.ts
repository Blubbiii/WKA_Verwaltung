/**
 * POST /api/cron/bundesbank-rate-fetch
 *
 * Cron-Trigger für die halbjährliche Bundesbank-Aktualisierung. Kann von
 * einem externen Scheduler (systemd-timer, GitHub Action, Kubernetes CronJob)
 * via Bearer-Token-Auth aufgerufen werden.
 *
 * Auth: ENV CRON_BEARER_TOKEN muss als "Authorization: Bearer <token>"
 * mitgeschickt werden.
 *
 * Empfohlener Cron-Rhythmus: 1x pro Woche
 *   0 4 * * MON  # Montags um 04:00 UTC
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { fetchAndUpsertBundesbankRates } from "@/lib/accounting/bundesbank-fetch";

export async function POST(request: NextRequest) {
  // Bearer-Token-Auth
  const auth = request.headers.get("authorization") || "";
  const expectedToken = process.env.CRON_BEARER_TOKEN;

  if (!expectedToken) {
    return apiError("FEATURE_DISABLED", 503, {
      message: "Cron-Endpoint nicht konfiguriert (CRON_BEARER_TOKEN fehlt)",
    });
  }

  const providedToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (providedToken !== expectedToken) {
    return apiError("UNAUTHORIZED", 401, {
      message: "Ungültiger Bearer-Token",
    });
  }

  try {
    const result = await fetchAndUpsertBundesbankRates();

    logger.info({ result }, "Cron: Bundesbank-Rate-Fetch ausgeführt");

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
