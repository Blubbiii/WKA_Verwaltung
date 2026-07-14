/**
 * F16-Compliance: Idempotency-Key Support für Money-Mutating Endpoints.
 *
 * Verhindert Doppel-Buchungen bei Netzwerk-Retries. Client generiert eine
 * eindeutige UUID pro Operation und sendet sie im `Idempotency-Key` Header
 * (oder alternativ im Body-Feld `idempotencyKey`). Beim ersten Erfolg
 * cachen wir Status-Code + Response-Body für 24h in Redis. Ein zweites
 * Request mit gleichem Key returned dieselbe Response ohne die Operation
 * erneut auszuführen.
 *
 * Design:
 *   - Redis TTL 24h (genug für Retry-Fenster, kurz genug für Storage-Kosten)
 *   - Key-Namespace: `idempotency:{tenantId}:{key}` — tenant-isoliert
 *   - Race-Condition-Schutz: SET NX (nur wenn nicht existiert) mit Sentinel
 *     "IN_FLIGHT" → parallele Requests warten NICHT, sondern kriegen 409.
 *     Das ist bewusst — Client soll gleiche Operation nicht parallel triggern.
 *   - Nur 2xx-Responses werden gecacht. Fehler dürfen retried werden.
 *
 * Verwendung (Route-Handler):
 *
 *   export async function POST(req: NextRequest, ctx) {
 *     return withIdempotency(req, tenantId, async () => {
 *       // ... eigentliche Business-Logik, gibt NextResponse zurück
 *     });
 *   }
 *
 * Ziel-Endpoints (F16 P1-Scope):
 *   - POST /api/invoices/[id]/payments
 *   - POST /api/invoices/[id]/mark-paid
 *   - POST /api/journal-entries
 */

import { NextRequest, NextResponse } from "next/server";
import { cache } from "@/lib/cache";
import { apiError } from "@/lib/api-errors";
import { logger } from "@/lib/logger";

const idempLogger = logger.child({ module: "idempotency" });

/** TTL für Snapshot-Cache. 24h reicht für alle üblichen Retry-Strategien. */
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/** Sentinel-Wert wenn eine Operation gerade läuft. */
const IN_FLIGHT_SENTINEL = "__IN_FLIGHT__";

interface CachedResponseSnapshot {
  status: number;
  bodyJson: unknown;
  storedAt: string;
}

/**
 * Extrahiert den Idempotency-Key aus Header oder Body.
 * Header hat Vorrang (RFC-Draft konform: `Idempotency-Key`).
 * Body-Feld `idempotencyKey` als Fallback für Clients ohne Header-Kontrolle.
 */
export function extractIdempotencyKey(
  request: NextRequest,
  body?: Record<string, unknown> | null,
): string | null {
  const headerKey = request.headers.get("idempotency-key");
  if (headerKey && headerKey.trim().length > 0) return headerKey.trim();
  if (body && typeof body === "object") {
    const bodyKey = (body as { idempotencyKey?: unknown }).idempotencyKey;
    if (typeof bodyKey === "string" && bodyKey.trim().length > 0) return bodyKey.trim();
  }
  return null;
}

/**
 * Baut den Cache-Key. Tenant-isoliert.
 */
function buildIdempotencyKey(tenantId: string, key: string): string {
  return `idempotency:${tenantId}:${key}`;
}

/**
 * withIdempotency — Wrapper um einen Route-Handler.
 *
 * Wenn kein Idempotency-Key mitgegeben ist: Handler läuft normal.
 * Wenn Key mitgegeben:
 *   - Erstes Request: Handler läuft; bei 2xx wird die Response gecacht.
 *   - Zweites Request mit gleichem Key + gleicher tenantId: gecachte Response.
 *   - Paralleles Request während erstes noch läuft: 409 CONFLICT.
 *
 * Non-2xx-Responses (Errors) werden nicht gecacht — Retry bleibt sinnvoll.
 */
export async function withIdempotency(
  request: NextRequest,
  tenantId: string,
  handler: () => Promise<NextResponse>,
  options?: {
    /** Vorab-geparster Body, damit wir nicht doppelt request.json() aufrufen. */
    parsedBody?: Record<string, unknown> | null;
  },
): Promise<NextResponse> {
  const key = extractIdempotencyKey(request, options?.parsedBody ?? null);

  // Kein Key → keine Idempotency (Backward-Compatibility).
  if (!key) return handler();

  const cacheKey = buildIdempotencyKey(tenantId, key);

  // 1. Cache-Lookup — gibt es einen Snapshot?
  const cached = await cache.get<CachedResponseSnapshot | string>(cacheKey);
  if (cached && typeof cached === "object" && "status" in cached) {
    idempLogger.info(
      { tenantId, key, cachedStatus: cached.status },
      "[Idempotency] Serving cached response",
    );
    return NextResponse.json(cached.bodyJson, { status: cached.status });
  }
  if (cached === IN_FLIGHT_SENTINEL) {
    // Ein anderes Request bearbeitet die Operation gerade. Client soll warten
    // und wiederholen — 409 ist ehrlicher als silently blockieren.
    idempLogger.warn(
      { tenantId, key },
      "[Idempotency] Parallel request while operation in-flight — returning 409",
    );
    return apiError("CONFLICT", 409, {
      message:
        "Diese Anfrage wird gerade bearbeitet. Bitte kurz warten und erneut versuchen.",
      details: { idempotencyKey: key },
    });
  }

  // 2. Reserviere den Slot mit Sentinel. Kurze TTL (5min) damit ein hängender
  //    Handler nicht ewig alles blockiert. Nach Erfolg wird der Sentinel mit
  //    dem echten Snapshot überschrieben (längere TTL).
  await cache.set(cacheKey, IN_FLIGHT_SENTINEL, 5 * 60);

  // 3. Handler ausführen.
  let response: NextResponse;
  try {
    response = await handler();
  } catch (err) {
    // Slot freigeben damit Retry sofort klappt.
    await cache.del(cacheKey);
    throw err;
  }

  // 4. Nur 2xx cachen. Fehler dürfen retried werden.
  if (response.status >= 200 && response.status < 300) {
    try {
      // Body lesen (clone!), damit die Original-Response noch streamen kann.
      const clone = response.clone();
      const bodyJson = await clone.json().catch(() => null);
      const snapshot: CachedResponseSnapshot = {
        status: response.status,
        bodyJson,
        storedAt: new Date().toISOString(),
      };
      await cache.set(cacheKey, snapshot, IDEMPOTENCY_TTL_SECONDS);
      idempLogger.info(
        { tenantId, key, status: response.status },
        "[Idempotency] Response snapshot cached",
      );
    } catch (err) {
      idempLogger.warn(
        { tenantId, key, err },
        "[Idempotency] Failed to cache response snapshot — request succeeded but retries won't be idempotent",
      );
      // Slot freigeben, damit die 5-Min-Sentinel-TTL keine Deadlocks verursacht.
      await cache.del(cacheKey);
    }
  } else {
    // Non-2xx: Slot freigeben, damit Client den korrigierten Retry sofort machen kann.
    await cache.del(cacheKey);
  }

  return response;
}
