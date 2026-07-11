/**
 * Impersonation-Cookie: HMAC-signierter Cookie mit Original- + Target-User-Info.
 *
 * Wird von `POST /api/admin/impersonate` gesetzt und von
 * - `DELETE /api/admin/impersonate` (Stop-Handler),
 * - `GET /api/admin/impersonate`   (Status-Anzeige),
 * - `src/lib/audit.ts`             (Audit-Log-Impersonation-Kette, F2)
 * gelesen.
 *
 * Vorher lebten Signier-/Verify-Logik nur im impersonate-Route selbst und
 * audit.ts hatte einen "will be added" Kommentar. Ohne die geteilte Verifikation
 * wurde `impersonatedById` NIE gesetzt und die GoBD-Anforderung "wer hat als wen
 * gehandelt" konnte nicht erfüllt werden.
 *
 * Sicherheits-Invarianten:
 *  - AUTH_SECRET MUSS gesetzt sein — wirft sonst (kein Fallback auf "")
 *  - timingSafeEqual nur nach Längen-Check (verhindert RangeError → 500 statt 401)
 *  - exp im Payload — abgelaufene Cookies gelten als ungültig
 */

import crypto from "crypto";
import { cookies } from "next/headers";
import { AUTH_CONFIG } from "@/lib/config/auth-config";

export const IMPERSONATION_COOKIE_NAME = "impersonation";
export const IMPERSONATION_TTL_SECONDS = AUTH_CONFIG.impersonationTtlSeconds;

export interface ImpersonationCookiePayload {
  originalUserId: string;
  originalEmail: string;
  targetUserId: string;
  targetEmail: string;
  targetName: string;
  targetTenantId: string;
  targetTenantName: string;
  startedAt: string;
}

interface SignedPayload extends Record<string, unknown> {
  iat: number;
  exp: number;
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET (oder NEXTAUTH_SECRET) muss gesetzt sein — Impersonation aus Sicherheitsgründen deaktiviert",
    );
  }
  return secret;
}

/**
 * Signiert einen Payload als `<jsonPayload>.<hmacHex>` und ergänzt iat/exp.
 * TTL kommt aus AUTH_CONFIG.impersonationTtlSeconds.
 */
export function signImpersonationCookie(
  data: Omit<ImpersonationCookiePayload, "iat" | "exp"> | Record<string, unknown>,
): string {
  const secret = getAuthSecret();
  const now = Math.floor(Date.now() / 1000);
  const enriched: SignedPayload = {
    ...data,
    iat: now,
    exp: now + IMPERSONATION_TTL_SECONDS,
  };
  const payload = JSON.stringify(enriched);
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

/**
 * Verifiziert einen signierten Cookie-Wert.
 * Return: Payload wenn HMAC + exp gültig sind, sonst null.
 * Kein throw — Callers dürfen null als "kein/ungültig" behandeln.
 */
export function verifyImpersonationCookie(
  signed: string,
): Record<string, unknown> | null {
  let secret: string;
  try {
    secret = getAuthSecret();
  } catch {
    return null;
  }
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;
  const payload = signed.substring(0, lastDot);
  const signature = signed.substring(lastDot + 1);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  if (signature.length !== expected.length) return null;
  try {
    const valid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
    if (!valid) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(payload) as SignedPayload;
    const now = Math.floor(Date.now() / 1000);
    if (typeof parsed.exp === "number" && parsed.exp < now) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Lädt den aktuellen Impersonation-Cookie aus dem Request-Context und
 * verifiziert ihn. Rückgabe: strukturierter Payload oder null.
 *
 * Nutze das in Audit-Log-Schreiben (F2), damit `impersonatedById` gesetzt wird
 * wenn ein Superadmin gerade einen Ziel-User impersoniert.
 *
 * Kein throw bei Fehlern (Header-Kontext fehlt, Cookie fehlt, Signatur invalid).
 */
export async function readImpersonationCookie(): Promise<ImpersonationCookiePayload | null> {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(IMPERSONATION_COOKIE_NAME);
    if (!cookie) return null;
    const payload = verifyImpersonationCookie(cookie.value);
    if (!payload) return null;
    // Minimaler Shape-Check
    if (
      typeof payload.originalUserId !== "string" ||
      typeof payload.targetUserId !== "string"
    ) {
      return null;
    }
    return payload as unknown as ImpersonationCookiePayload;
  } catch {
    // headers() nicht im Kontext (z.B. Cron-Worker) → kein Impersonation-Cookie
    return null;
  }
}
