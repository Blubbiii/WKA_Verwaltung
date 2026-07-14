/**
 * P2-10 Fix: HMAC-Verifizierung des wpm-active-tenant Cookies.
 *
 * Wird genutzt von:
 *  - middleware.ts (setzt verifizierte Daten als Header für SSR-Pages)
 *  - auth/config.ts session-Callback (verifiziert direkt, ignoriert Header)
 *
 * Vorher: session-Callback las x-active-tenant-id aus Headers blind.
 * Bei API-Direct-Calls (außerhalb Middleware-Matcher) konnte ein Angreifer
 * mit gestohlenem JWT diesen Header injizieren → Cross-Tenant-Zugriff.
 *
 * Jetzt: session-Callback verifiziert das HMAC-Cookie direkt — Header sind
 * nur Convenience für SSR-Render, nicht autoritativ.
 */

import { z } from "zod";

export const ACTIVE_TENANT_COOKIE = "wpm-active-tenant";

// Runtime-Shape für den entpackten Cookie-Payload. HMAC schützt vor Fälschung,
// aber nicht vor Struktur-Drift zwischen alten und neuen Deployments — ein
// Cookie aus einer älteren App-Version darf kein Chaos in der Session anrichten.
const ActiveTenantDataSchema = z.object({
  activeTenantId: z.string(),
  tenantName: z.string(),
  tenantSlug: z.string(),
  tenantLogoUrl: z.string().nullable(),
  roleHierarchy: z.number(),
  userId: z.string(),
  startedAt: z.string(),
});

export type ActiveTenantData = z.infer<typeof ActiveTenantDataSchema>;

/**
 * Edge-Runtime-kompatible HMAC-SHA256-Verifizierung. Konstant-Zeit-Vergleich.
 */
export async function verifyActiveTenantCookie(
  signed: string | undefined | null,
  secret: string,
): Promise<ActiveTenantData | null> {
  if (!signed || !secret) return null;
  const lastDot = signed.lastIndexOf(".");
  if (lastDot === -1) return null;

  const payload = signed.substring(0, lastDot);
  const signature = signed.substring(lastDot + 1);

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const expected = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (signature.length !== expected.length) return null;
    let mismatch = 0;
    for (let i = 0; i < signature.length; i++) {
      mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (mismatch !== 0) return null;

    const parsed = ActiveTenantDataSchema.safeParse(JSON.parse(payload));
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
