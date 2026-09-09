/**
 * SSRF-safe fetch wrapper.
 *
 * Use this whenever the URL comes from user/tenant input (Webhooks, integrations,
 * external file fetches, etc.). It prevents requests against private/internal
 * networks and cloud-metadata endpoints.
 *
 * NOTE: This does NOT do active DNS resolution. A malicious hostname pointing
 * to a private IP via DNS rebinding could still bypass this check. For full
 * protection, resolve the hostname via `dns.promises.lookup`, validate the IP,
 * and pin the connection to that IP (see TODO below).
 */

import { HTTP_TIMEOUTS } from "@/lib/config/api-limits";

// SSRF protection: reject private/internal IP ranges and metadata hosts.
export function isPrivateUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();
    return (
      /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|fc|fd|fe80|::1|\[::1\])/.test(
        hostname,
      ) ||
      hostname === "metadata.google.internal" ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local")
    );
  } catch {
    return true; // Unparseable → reject defensively
  }
}

export class SafeFetchError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "SafeFetchError";
    this.status = status;
  }
}

/**
 * Validate a URL is safe to fetch (http/https + not private).
 * Throws SafeFetchError if not.
 */
export function assertSafeUrl(urlStr: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new SafeFetchError("Ungueltige URL", 400);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SafeFetchError("Nur http/https URLs sind erlaubt", 400);
  }

  if (isPrivateUrl(urlStr)) {
    throw new SafeFetchError("Private oder interne URLs sind nicht erlaubt", 400);
  }

  // TODO: Optional hardening — DNS-resolve hostname via `dns.promises.lookup`
  // and ensure the resolved IP is not in a private range (defense vs. DNS
  // rebinding). Pin the connection to that IP for the actual request.

  return parsed;
}

/**
 * SSRF-safe wrapper around global fetch.
 * Throws SafeFetchError on invalid/private URLs (caller maps to HTTP 400).
 *
 * ## Frist
 *
 * Die Fassung ohne Frist prüfte die Adresse und reichte den Aufruf dann
 * ungebremst durch. Gegen eine Gegenstelle im internen Netz schützte sie —
 * gegen eine, die einfach nie antwortet, nicht. Das ist bei einem
 * SSRF-Schutzmantel unglücklich: wer ihn benutzt, ruft per Definition eine
 * Adresse auf, die jemand anderes bestimmt hat.
 *
 * Ein Aufrufer kann `init.signal` weiterhin selbst setzen; beide Signale
 * gelten dann zusammen, es gewinnt das erste.
 *
 * Stand heute ruft diese Funktion niemand auf — genutzt wird nur
 * `isPrivateUrl`. Sie bleibt trotzdem, und sie bleibt mit Frist: eine
 * Schutzfunktion, die beim ersten Gebrauch eine Lücke mitbringt, ist
 * schlimmer als keine.
 */
export async function safeFetch(
  urlStr: string,
  init?: RequestInit,
): Promise<Response> {
  assertSafeUrl(urlStr);
  const frist = AbortSignal.timeout(HTTP_TIMEOUTS.connectionTestMs);
  return fetch(urlStr, {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, frist]) : frist,
  });
}
