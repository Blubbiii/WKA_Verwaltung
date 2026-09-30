/**
 * Which catalog permissions the system role "Administrator" holds (2026-09):
 * all but the platform's (module "system"), the investor portal's (module
 * "portal") and those reserved for the platform operator. The boot-time sync
 * (sync-permissions) adds any that are missing — also permissions of modules
 * added later — and never takes one away.
 */

export interface KatalogEintrag {
  name: string;
  module: string;
  unenforcedReason?: string;
}

const NICHT_FUER_ADMINISTRATOR = new Set(["system", "portal"]);

export function administratorRechte(katalog: readonly KatalogEintrag[]): string[] {
  return katalog
    .filter((p) => !NICHT_FUER_ADMINISTRATOR.has(p.module) && p.unenforcedReason !== "superadmin-only")
    .map((p) => p.name);
}
