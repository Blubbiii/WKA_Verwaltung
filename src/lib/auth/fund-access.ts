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
 * Returns null wenn unrestricted (= alle Funds sichtbar).
 */
export async function getAllowedFundIds(
  userId: string,
): Promise<string[] | null> {
  const access = await prisma.fundAccess.findMany({
    where: { userId },
    select: { fundId: true },
  });
  if (access.length === 0) return null;
  return access.map((a) => a.fundId);
}

/**
 * Prüft ob ein User Zugriff auf einen bestimmten Fund hat.
 */
export async function hasFundAccess(
  userId: string,
  fundId: string,
): Promise<boolean> {
  const allowed = await getAllowedFundIds(userId);
  if (allowed === null) return true;
  return allowed.includes(fundId);
}

/**
 * Liefert den Fund-Filter für eine Prisma-Where-Klausel.
 * { id: { in: [...] } } oder {} (unrestricted).
 */
export async function getFundFilter(
  userId: string,
): Promise<Record<string, unknown>> {
  const allowed = await getAllowedFundIds(userId);
  if (allowed === null) return {};
  return { id: { in: allowed } };
}
