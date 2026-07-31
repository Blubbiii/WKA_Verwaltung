/**
 * POST /api/cron/bank-fetch
 *
 * Täglicher Lauf über die Bankverbindungen. B7 (Audit 2026-07): „Täglicher
 * automatischer Kontoabruf würde Zahlungsabgleich und Mahnlauf vollständig
 * automatisieren."
 *
 * Auth: `CRON_BEARER_TOKEN` als `Authorization: Bearer <token>` — dieselbe
 * Mechanik wie beim Bundesbank-Abruf.
 *
 * Empfohlener Rhythmus: `0 6 * * *` (täglich 06:00 UTC).
 *
 * ## Was dieser Lauf tut und was nicht
 *
 * Er ruft NICHT selbst bei der Bank ab — das könnte nur ein
 * EBICS-/FinTS-Adapter, und der ist nicht eingerichtet (siehe
 * `lib/bank-import/providers.ts`). Was er tut, ist das, was ohne
 * Protokollimplementierung Wert hat:
 *
 *  1. Er meldet Verbindungen, von denen seit Tagen nichts kam. Ein
 *     automatischer Abruf, der still ausfällt, ist schlimmer als keiner — er
 *     erweckt den Eindruck, die Umsätze seien aktuell.
 *  2. Er versucht bei den nicht eingerichteten Verfahren den Abruf und hält
 *     den Grund fest, statt sie stumm zu übergehen.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { bearerTokenMatches } from "@/lib/auth/timing-safe";
import {
  getProvider,
  ProviderUnavailableError,
  FAILURE_THRESHOLD,
  type ProviderName,
} from "@/lib/bank-import/providers";

/**
 * Ab wie vielen Tagen ohne erfolgreichen Abruf gewarnt wird.
 *
 * Drei Tage decken ein Wochenende ab, an dem kein Auszug kommt, ohne dass der
 * Ausfall eine Woche unbemerkt bleibt.
 */
const STALE_AFTER_DAYS = 3;

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
    const connections = await prisma.bankConnection.findMany({
      where: { status: { in: ["ACTIVE", "SETUP_PENDING", "ERROR"] } },
      select: {
        id: true,
        name: true,
        tenantId: true,
        provider: true,
        status: true,
        lastSuccessAt: true,
        consecutiveFailures: true,
      },
    });

    const now = new Date();
    const staleThreshold = new Date(now.getTime() - STALE_AFTER_DAYS * 24 * 3600 * 1000);

    const stale: { id: string; name: string; lastSuccessAt: Date | null }[] = [];
    const notConfigured: { id: string; name: string; provider: string; nextSteps: string[] }[] = [];

    for (const connection of connections) {
      const provider = getProvider(connection.provider as ProviderName);

      if (!provider.isOperational) {
        // Den Grund einmal festhalten, statt die Verbindung stumm zu
        // übergehen. Sonst sieht eine nie freigeschaltete EBICS-Verbindung
        // jahrelang aus wie eine, die gleich losläuft.
        try {
          await provider.fetchStatement({ credentials: null });
        } catch (error) {
          if (error instanceof ProviderUnavailableError) {
            notConfigured.push({
              id: connection.id,
              name: connection.name,
              provider: connection.provider,
              nextSteps: error.nextSteps,
            });
            await prisma.bankConnection.update({
              where: { id: connection.id },
              data: { lastError: error.message, status: "SETUP_PENDING" },
            });
          }
        }
        continue;
      }

      // FILE_DROP holt nicht ab, sondern nimmt entgegen. Der Lauf prüft
      // deshalb nur, ob überhaupt noch etwas ankommt.
      const isStale =
        connection.lastSuccessAt === null || connection.lastSuccessAt < staleThreshold;

      if (isStale) {
        stale.push({
          id: connection.id,
          name: connection.name,
          lastSuccessAt: connection.lastSuccessAt,
        });
      }
    }

    logger.info(
      { connections: connections.length, stale: stale.length, notConfigured: notConfigured.length },
      "[Cron] Bank-Abruf geprüft",
    );

    const warnings: string[] = [];
    if (stale.length > 0) {
      warnings.push(
        `${stale.length} Verbindung(en) haben seit mindestens ${STALE_AFTER_DAYS} Tagen keinen Auszug geliefert. Bitte prüfen, ob der Export der Bank noch läuft — die Umsätze sind sonst nicht aktuell, sehen aber so aus.`,
      );
    }
    if (notConfigured.length > 0) {
      warnings.push(
        `${notConfigured.length} Verbindung(en) nutzen ein Verfahren, das nicht eingerichtet ist (EBICS/FinTS). Sie rufen nichts ab.`,
      );
    }

    return NextResponse.json({
      checked: connections.length,
      stale,
      notConfigured,
      failureThreshold: FAILURE_THRESHOLD,
      warnings,
    });
  } catch (error) {
    logger.error({ err: error }, "[Cron] Bank-Abruf fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Bank-Abruf konnte nicht geprüft werden" });
  }
}
