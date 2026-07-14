/**
 * Zentraler Getter fuer die oeffentliche App-URL.
 *
 * Vorher: 9 Files hatten `process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"`
 * gestreut. In Prod ohne gesetztes NEXT_PUBLIC_APP_URL wuerden Emails,
 * Portal-Links und CORS-Header auf `http://localhost:3000` zeigen — Links
 * die extern verschickt werden brechen still.
 *
 * Neu:
 *   - Development: `http://localhost:3000` bleibt Fallback.
 *   - Production: fehlt NEXT_PUBLIC_APP_URL, wird geworfen — fail-fast statt
 *     schweigend kaputte Mails.
 *   - Rueckgabewert ist immer ohne Trailing-Slash.
 */

const LOCAL_FALLBACK = "http://localhost:3000";

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Liefert die base URL fuer serverseitige Verwendung (Emails, Redirects,
 * CORS Origin, absolute Links in externen Payloads).
 *
 * @throws in production wenn NEXT_PUBLIC_APP_URL nicht gesetzt ist.
 */
export function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) {
    return stripTrailingSlash(raw);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[app-url] NEXT_PUBLIC_APP_URL is not set. Set it to the public origin " +
        "(e.g. https://app.example.com) in production.",
    );
  }

  return LOCAL_FALLBACK;
}

/**
 * Non-throwing Variante fuer Kontexte wo ein leerer String tolerierbar ist
 * (z. B. optionale Deep-Link-Zusatzfelder). In Prod ohne Wert: leerer String.
 */
export function getAppUrlOrEmpty(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return raw ? stripTrailingSlash(raw) : "";
}
