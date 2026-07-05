/**
 * Client-side fetch wrapper mit deployment-safe retry.
 *
 * Regeln:
 *   - 4xx (Client-Fehler): NIE retryen — echter Bug, kein transientes Problem
 *     Ausnahme: 408 (Request Timeout) und 429 (Too Many Requests) — 1× nach 2s
 *   - 5xx: exponential backoff 500ms → 1500ms → 4500ms, max `maxRetries` Retries (Default 3)
 *   - Network-Error (fetch throws): wie 5xx (Server-Restart-Muster)
 *   - `retryOn4xx`: Opt-in Flag, um alle 4xx (außer 408/429) trotzdem zu retryen.
 *
 * Nutzt `AbortSignal.timeout(timeoutMs)` (Default 30s) für harte Zeitlimits.
 */

export interface FetchOptions extends RequestInit {
  /** Maximale Retry-Versuche bei 5xx/Network-Error. Default: 3 */
  maxRetries?: number;
  /** Bei 4xx trotzdem retryen (Default false). 408/429 werden immer 1× retryed. */
  retryOn4xx?: boolean;
  /** Timeout in Millisekunden. Default: 30_000 */
  timeoutMs?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * 5xx-Backoff-Delays in ms. Länge = max Retries für 5xx.
 * 500 → 1500 → 4500 ms (exponential, factor 3)
 */
const BACKOFF_DELAYS_MS = [500, 1500, 4500];

const TRANSIENT_4XX = new Set<number>([408, 429]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Central client fetch with smart retry policy.
 *
 * @example
 *   const res = await clientFetch("/api/energy/scada/import", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify(payload),
 *   });
 *   if (!res.ok) { ... }
 */
export async function clientFetch(
  url: string,
  opts: FetchOptions = {}
): Promise<Response> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    retryOn4xx = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: externalSignal,
    ...init
  } = opts;

  let attempt = 0;
  let lastError: unknown;

  // Retry-Loop: attempts = initial + maxRetries
  while (attempt <= maxRetries) {
    // Compose external signal + timeout signal, if AbortSignal.any is available (Node 20+/modern browsers).
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal =
      externalSignal && typeof (AbortSignal as unknown as { any?: unknown }).any === "function"
        ? (AbortSignal as unknown as {
            any: (signals: AbortSignal[]) => AbortSignal;
          }).any([externalSignal, timeoutSignal])
        : timeoutSignal;

    try {
      const res = await fetch(url, { ...init, signal });

      // Success or non-retryable client error
      if (res.ok) {
        return res;
      }

      const status = res.status;
      const is4xx = status >= 400 && status < 500;
      const is5xx = status >= 500 && status < 600;

      // 4xx handling
      if (is4xx) {
        const isTransient = TRANSIENT_4XX.has(status);
        // 408/429 → immer 1× retry (unabhängig von retryOn4xx)
        if (isTransient && attempt === 0) {
          await sleep(2000);
          attempt++;
          continue;
        }
        // Sonstige 4xx: nur retryen wenn Opt-in gesetzt UND noch Retries übrig
        if (retryOn4xx && attempt < maxRetries) {
          const delay = BACKOFF_DELAYS_MS[Math.min(attempt, BACKOFF_DELAYS_MS.length - 1)];
          await sleep(delay);
          attempt++;
          continue;
        }
        // Kein Retry → Response zurückgeben, Caller behandelt Fehler
        return res;
      }

      // 5xx: exponential backoff bis maxRetries erschöpft
      if (is5xx && attempt < maxRetries) {
        const delay = BACKOFF_DELAYS_MS[Math.min(attempt, BACKOFF_DELAYS_MS.length - 1)];
        await sleep(delay);
        attempt++;
        continue;
      }

      // 5xx erschöpft oder unerwarteter Status → Response durchreichen
      return res;
    } catch (err) {
      lastError = err;
      // Network-Error, Timeout, Abort → wie 5xx behandeln
      if (attempt < maxRetries) {
        const delay = BACKOFF_DELAYS_MS[Math.min(attempt, BACKOFF_DELAYS_MS.length - 1)];
        await sleep(delay);
        attempt++;
        continue;
      }
      throw err;
    }
  }

  // Sollte nie erreicht werden, aber TS braucht Return.
  throw lastError ?? new Error(`clientFetch: retries exhausted for ${url}`);
}
