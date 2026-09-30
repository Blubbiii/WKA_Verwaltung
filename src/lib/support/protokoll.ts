/**
 * Central protocol of the platform support (2026-09, phase 2): which
 * requests of the support in a customer's tenant are recorded, derived from
 * the permission the request needed. Reading, export and download are not
 * recorded — entering the tenant is. Pure; withPermission writes the entry.
 */

export type SupportAktion = "CREATE" | "UPDATE" | "DELETE";

const NUR_LESEN = new Set(["read", "export", "download"]);
const RANG: Record<SupportAktion, number> = { UPDATE: 1, CREATE: 2, DELETE: 3 };

function aktionFuer(recht: string): SupportAktion | null {
  const verb = recht.split(":").pop() ?? "";
  if (NUR_LESEN.has(verb)) return null;
  if (verb === "create") return "CREATE";
  if (verb === "delete") return "DELETE";
  return "UPDATE";
}

export function supportEintrag(permission: string | string[]): { action: SupportAktion; recht: string } | null {
  let bester: { action: SupportAktion; recht: string } | null = null;
  for (const recht of Array.isArray(permission) ? permission : [permission]) {
    const action = aktionFuer(recht);
    if (action && (!bester || RANG[action] > RANG[bester.action])) bester = { action, recht };
  }
  return bester;
}
