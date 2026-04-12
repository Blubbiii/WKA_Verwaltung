/**
 * Client-side helper to parse structured API errors and translate them.
 *
 * Usage inside React components:
 *
 *   const t = useTranslations("apiErrors");
 *   const res = await fetch("/api/...");
 *   if (!res.ok) {
 *     toast.error(await translateApiError(res, t));
 *     return;
 *   }
 *
 * The helper:
 * 1. Parses the JSON body safely
 * 2. If `code` is present, returns t(code) for the user's locale
 * 3. Falls back to the server's `error` field (German)
 * 4. Falls back to a generic message if nothing else is available
 */

export interface ApiErrorResponseBody {
  code?: string;
  error?: string;
  details?: unknown;
}

type Translator = (key: string) => string;

/**
 * Parse an error Response and return a localized message.
 *
 * @param res - Failed fetch Response
 * @param t - next-intl translator bound to the "apiErrors" namespace
 * @param fallback - Final fallback if all else fails
 */
export async function translateApiError(
  res: Response,
  t: Translator,
  fallback = "Unbekannter Fehler"
): Promise<string> {
  let body: ApiErrorResponseBody | null = null;

  try {
    body = await res.json();
  } catch {
    // Response wasn't JSON — use HTTP status text
    return res.statusText || fallback;
  }

  if (body?.code) {
    try {
      const translated = t(body.code);
      // next-intl returns the key itself on a miss — detect that
      if (translated && translated !== body.code) {
        return translated;
      }
    } catch {
      // ignore and fall through to server message
    }
  }

  if (body?.error) {
    return body.error;
  }

  return fallback;
}

/**
 * Synchronous variant for already-parsed error bodies.
 */
export function translateApiErrorBody(
  body: ApiErrorResponseBody | null | undefined,
  t: Translator,
  fallback = "Unbekannter Fehler"
): string {
  if (body?.code) {
    try {
      const translated = t(body.code);
      if (translated && translated !== body.code) return translated;
    } catch {
      /* ignore */
    }
  }
  if (body?.error) return body.error;
  return fallback;
}
