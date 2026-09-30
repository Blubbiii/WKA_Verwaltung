/**
 * What the platform operator sees of a tenant (2026-09, support phase 2):
 * details only of the tenant he works in and of tenants with an active
 * support access; of all others figures only. Pure — the database side
 * (which tenants have an active access) is mandantenMitFreigabe in ./zugang.
 */

export interface SuperadminLage {
  /** The tenant the request works in (own, or a customer entered as support). */
  aktiverMandant: string;
  /** Tenants with an active support access (grant or emergency). */
  mitFreigabe: ReadonlySet<string>;
}

export function superadminSiehtMandant(mandant: string, lage: SuperadminLage): boolean {
  return mandant === lage.aktiverMandant || lage.mitFreigabe.has(mandant);
}
