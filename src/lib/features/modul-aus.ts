/**
 * Who can switch on a disabled module. Only the superadmin may toggle feature
 * flags (/api/admin/feature-flags uses requireSuperadmin).
 */

export const MODUL_AKTIVIEREN_HREF = "/admin/system-admin?tab=flags&subtab=feature-flags";

export type ModulAusVariante = "aktivieren" | "betreiberFragen" | "adminFragen";

/** `roleHierarchy` from the session: 100 superadmin, 80 admin. */
export function modulAusVariante(roleHierarchy: number | undefined): ModulAusVariante {
  if ((roleHierarchy ?? 0) >= 100) return "aktivieren";
  if ((roleHierarchy ?? 0) >= 80) return "betreiberFragen";
  return "adminFragen";
}
