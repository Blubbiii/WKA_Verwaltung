/**
 * §19 UStG Kleinunternehmer-Gate (Phase 11).
 *
 * Stellt sicher, dass USt-Operationen nicht für Tenants laufen die
 * Kleinunternehmer sind (kein USt-Ausweis, keine UStVA-Abgabe).
 *
 * Verwendet vom Auto-Posting (im 3-Lines-Modus überspringen wir den
 * USt-Split komplett wenn kleinunternehmer=true) und vom UStVA-Generator
 * (wirft, damit der User keine UStVA versucht zu generieren).
 */

import { getTenantSettings } from "@/lib/tenant-settings";

/** Thrown by assertNotKleinunternehmer. Caller maps to apiError. */
export class KleinunternehmerError extends Error {
  constructor() {
    super(
      "Operation nicht erlaubt für Kleinunternehmer (§19 UStG). " +
        "Bei Statuswechsel: erst kleinunternehmer-Setting deaktivieren.",
    );
    this.name = "KleinunternehmerError";
  }
}

/**
 * Wirft KleinunternehmerError wenn der Tenant §19 UStG Kleinunternehmer ist.
 * Cacht über getTenantSettings (10-min Redis-Cache), kein DB-Hot-Path.
 */
export async function assertNotKleinunternehmer(tenantId: string): Promise<void> {
  const settings = await getTenantSettings(tenantId);
  if (settings.kleinunternehmer) {
    throw new KleinunternehmerError();
  }
}

/**
 * Liest das Kleinunternehmer-Flag (zur konditionalen Logik).
 */
export async function isKleinunternehmer(tenantId: string): Promise<boolean> {
  const settings = await getTenantSettings(tenantId);
  return settings.kleinunternehmer;
}
