/**
 * POST /api/cron/check-deadlines
 *
 * Planmaessig laeuft die Fristenpruefung seit Welle 23 im Worker
 * (`maintenance`-Queue, taeglich 07:00). Dieser Endpunkt bleibt fuer den
 * Handbetrieb: nachziehen, wenn der Worker stand, oder pruefen, ob die
 * Pruefung tut, was sie soll.
 *
 * Die Fachlogik liegt in `lib/maintenance/tasks.ts` — hier steht nur noch
 * Authentifizierung und Antwort, damit Worker und Endpunkt nicht auseinander
 * laufen koennen.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { runDeadlineCheck } from "@/lib/maintenance/tasks";
import { rateLimit, getClientIp, getRateLimitResponse } from "@/lib/rate-limit";
import { bearerTokenMatches } from "@/lib/auth/timing-safe";

export async function POST(request: NextRequest) {
  // IP-Rate-Limit als Defense-in-Depth gegen CRON_SECRET-Leak.
  // Cron triggert in der Realität ≤1/min → 10/min/IP ist sehr grosszügig.
  const ip = getClientIp(request);
  const rl = await rateLimit(`cron-deadlines:${ip}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.success) return getRateLimitResponse(rl);

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error("CRON_SECRET env var is not set");
    return apiError("INTERNAL_ERROR", 503, { message: "Service unavailable" });
  }

  // F22: war ein String-Vergleich und damit nicht timing-safe.
  const authHeader = request.headers.get("authorization");
  if (!bearerTokenMatches(authHeader, cronSecret)) {
    logger.warn("Unauthorized cron request to check-deadlines");
    return apiError("UNAUTHORIZED", 401, { message: "Unauthorized" });
  }

  try {
    const result = await runDeadlineCheck();
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ error: err }, "Deadline check cron failed");
    return apiError("INTERNAL_ERROR", 500, { message: "Internal server error" });
  }
}
