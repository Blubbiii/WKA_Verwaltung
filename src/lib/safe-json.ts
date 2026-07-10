/**
 * Parse a fetch Response body safely.
 *
 * Server-side errors from the reverse proxy (Nginx/Traefik at 502/503)
 * often return HTML instead of JSON. Naive `res.json()` then crashes with
 * "Unexpected token < in JSON at position 0" and swallows the real 500.
 *
 * This helper checks Content-Type first, falls back to a structured
 * error object with statusCode so the caller can still show a toast.
 *
 * @example
 * ```ts
 * import { safeJson } from "@/lib/safe-json";
 *
 * const res = await fetch("/api/parks");
 * const result = await safeJson<{ data: Park[] }>(res);
 * if (!result.ok) {
 *   toast.error(result.error);
 *   return;
 * }
 * setParks(result.data.data);
 * ```
 */

export interface SafeJsonResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status: number;
}

export async function safeJson<T = unknown>(
  res: Response
): Promise<SafeJsonResult<T>> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    // HTML response (e.g. reverse proxy timeout page) — don't try to parse
    return {
      ok: false,
      error: `Server-Fehler (Status ${res.status})`,
      status: res.status,
    };
  }
  try {
    const body = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error:
          (body as { error?: string })?.error ?? `Fehler (Status ${res.status})`,
        status: res.status,
      };
    }
    return { ok: true, data: body as T, status: res.status };
  } catch {
    return {
      ok: false,
      error: `Ungültige Server-Antwort (Status ${res.status})`,
      status: res.status,
    };
  }
}
