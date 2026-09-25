/**
 * Recently visited pages, mirrored into a cookie so the server can render the
 * list on first paint. The cookie is user-writable: only internal paths and
 * short labels survive parsing.
 */

export const ZULETZT_COOKIE = "wpm-zuletzt";
/** Stored entries; the sidebar shows up to three after removing favorites. */
export const ZULETZT_GESPEICHERT = 8;

export interface BesuchteSeite {
  href: string;
  label: string;
}

function istInternerPfad(href: unknown): href is string {
  // A leading "/" followed by path characters only; "//host" and "/\host" are
  // protocol-relative URLs in browsers and would leave the app.
  return typeof href === "string" && /^\/(?![/\\])[\w\-./]*$/.test(href) && href.length <= 200;
}

export function leseZuletzt(roh: string | undefined): BesuchteSeite[] {
  if (!roh) return [];
  try {
    const daten: unknown = JSON.parse(decodeURIComponent(roh));
    if (!Array.isArray(daten)) return [];
    return daten
      .filter(
        (e): e is BesuchteSeite =>
          !!e && typeof e === "object" && istInternerPfad((e as BesuchteSeite).href) &&
          typeof (e as BesuchteSeite).label === "string" && (e as BesuchteSeite).label.length <= 80,
      )
      .map((e) => ({ href: e.href, label: e.label }))
      .slice(0, ZULETZT_GESPEICHERT);
  } catch {
    return [];
  }
}

export function schreibeZuletztCookie(seiten: BesuchteSeite[]): string {
  // One year, whole app, not readable cross-site.
  return `${ZULETZT_COOKIE}=${encodeURIComponent(JSON.stringify(seiten))};path=/;max-age=31536000;SameSite=Lax`;
}
