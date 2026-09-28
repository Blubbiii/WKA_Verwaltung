/**
 * The signed "wpm-active-tenant" cookie: which tenant a user works in when
 * it is not their home tenant. Set by the tenant switch (membership) and by
 * "enter tenant" of the platform support; read and re-checked on every
 * request in withPermission (getActiveTenantOverride).
 */

import crypto from "crypto";
import { cookies } from "next/headers";

export const AKTIVER_MANDANT_COOKIE = "wpm-active-tenant";

export interface AktiverMandantDaten {
  userId: string;
  activeTenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantLogoUrl: string | null;
  roleHierarchy: number;
  startedAt: string;
  /** Entered as platform support (FREIGABE or NOTFALL), not via membership. */
  support?: boolean;
}

function signiere(daten: object): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  // No fallback to "": withPermission rejects any cookie without a secret anyway.
  if (!secret) throw new Error("AUTH_SECRET fehlt — Mandantenwechsel nicht möglich");
  const payload = JSON.stringify(daten);
  const signatur = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signatur}`;
}

export async function setzeAktivenMandanten(daten: AktiverMandantDaten, maxAgeSekunden: number): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AKTIVER_MANDANT_COOKIE, signiere(daten), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSekunden,
    // Secure by default in production (also behind TLS termination at the edge);
    // opt-out only for local HTTP setups via FORCE_INSECURE_COOKIES=true.
    secure: process.env.NODE_ENV === "production" && process.env.FORCE_INSECURE_COOKIES !== "true",
  });
}

export async function verlasseAktivenMandanten(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AKTIVER_MANDANT_COOKIE);
}
