/**
 * Timing-sicherer Vergleich von Secrets.
 *
 * F22 (Audit 2026-07): Die Cron-Routen verglichen ihren Bearer-Token mit `!==`.
 * Ein String-Vergleich bricht beim ersten abweichenden Zeichen ab, die Laufzeit
 * verrät also, wie viele Zeichen gestimmt haben. Das ist bei einem statischen,
 * langlebigen Secret ein echter, wenn auch aufwendig auszunutzender Angriff.
 *
 * Die Implementierung folgt dem bereits vorhandenen Muster in
 * `lib/auth/apiKeyAuth.ts`: Byte-Längen-Check VOR `timingSafeEqual`, weil die
 * Node-Funktion bei ungleich langen Buffern einen RangeError wirft — der würde
 * aus einem 401 einen 500 machen. Byte- und nicht String-Länge, weil
 * Mehrbyte-Zeichen (Umlaute, Emoji) sonst durchrutschen.
 */

import crypto from "crypto";

/**
 * Vergleicht zwei Secrets ohne verwertbares Timing-Signal.
 *
 * @param provided Wert aus dem Request (darf null/undefined sein)
 * @param expected erwarteter Wert
 * @returns true nur bei exakter Übereinstimmung
 */
export function timingSafeEquals(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!provided || !expected) return false;

  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");

  if (providedBuf.length !== expectedBuf.length) return false;

  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Liest einen Bearer-Token aus dem Authorization-Header und vergleicht ihn
 * timing-sicher.
 *
 * @param authHeader Roh-Header, z. B. "Bearer abc123"
 * @param expected erwarteter Token
 */
export function bearerTokenMatches(
  authHeader: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  return timingSafeEquals(authHeader.slice(7), expected);
}
