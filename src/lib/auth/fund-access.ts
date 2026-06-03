/**
 * Sprint 3 ABAC: Fund-Whitelist-Helper.
 *
 * Bestimmt welche Fund-IDs ein User sehen darf. Wenn der User KEINE
 * FundAccess-Einträge hat, ist er unrestricted (Default = Backward-
 * Kompatibilität). Hat er Einträge, sind das die einzigen Funds die er
 * sehen darf.
 *
 * Nutzung in Prisma-Queries:
 *
 *   const allowed = await getAllowedFundIds(userId);
 *   const where: Prisma.FundWhereInput = {
 *     tenantId,
 *     deletedAt: null,
 *     ...(allowed && { id: { in: allowed } }),
 *   };
 */

import { prisma } from "@/lib/prisma";

/**
 * Liefert die Liste erlaubter Fund-IDs für einen User.
 *
 * Rückgabe-Semantik abhängig von TenantSettings.abacFundAccessDefault:
 *  - "allow" (Default): leere FundAccess → null (unrestricted, alle Funds)
 *  - "deny": leere FundAccess → [] (keine Funds sichtbar)
 *
 * Returns null wenn unrestricted (= alle Funds sichtbar).
 * Returns [] wenn deny-Default und keine FundAccess-Einträge (= nichts sichtbar).
 *
 * @param userId  User-ID für FundAccess-Lookup.
 * @param tenantId Optional — wird für Settings-Lookup gebraucht. Wenn nicht
 *   übergeben, fällt auf "allow"-Semantik zurück (Backward-Kompatibilität).
 */
export async function getAllowedFundIds(
  userId: string,
  tenantId?: string,
): Promise<string[] | null> {
  const access = await prisma.fundAccess.findMany({
    where: { userId },
    select: { fundId: true },
  });
  if (access.length > 0) {
    return access.map((a) => a.fundId);
  }
  // Keine FundAccess-Einträge → Default-Verhalten aus Settings.
  if (tenantId) {
    const { getTenantSettings } = await import("@/lib/tenant-settings");
    const settings = await getTenantSettings(tenantId);
    if (settings.abacFundAccessDefault === "deny") return [];
  }
  return null;
}

/**
 * Prüft ob ein User Zugriff auf einen bestimmten Fund hat.
 */
export async function hasFundAccess(
  userId: string,
  fundId: string,
  tenantId?: string,
): Promise<boolean> {
  const allowed = await getAllowedFundIds(userId, tenantId);
  if (allowed === null) return true;
  return allowed.includes(fundId);
}

/**
 * Liefert den Fund-Filter für eine Prisma-Where-Klausel.
 * { id: { in: [...] } } oder {} (unrestricted) oder { id: { in: [] } } (deny-all).
 */
export async function getFundFilter(
  userId: string,
  tenantId?: string,
): Promise<Record<string, unknown>> {
  const allowed = await getAllowedFundIds(userId, tenantId);
  if (allowed === null) return {};
  return { id: { in: allowed } };
}
