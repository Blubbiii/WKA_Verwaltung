/**
 * Park access per user (decision E4, 2026-09) — the park counterpart of
 * FundAccess.
 *
 * Stored as ResourceAccess rows with resourceType PARK. Semantics as for
 * funds: no rows → the user sees every park of the tenant; rows → only
 * those parks. Enforced in the park list and the park detail routes and in
 * the dashboard figures.
 */

import { prisma } from "@/lib/prisma";
import { RESOURCE_TYPES } from "@/lib/auth/resourceAccess";
import { erlaubteIds } from "@/lib/auth/erlaubte-ids";

/** Park IDs the user is limited to, or null when unrestricted. */
export async function getAllowedParkIds(userId: string): Promise<string[] | null> {
  const zeilen = await prisma.resourceAccess.findMany({
    where: {
      userId,
      resourceType: RESOURCE_TYPES.PARK,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { resourceId: true },
  });
  return zeilen.length > 0 ? zeilen.map((z) => z.resourceId) : null;
}

/**
 * Parks the caller may see: the park whitelist intersected with the
 * role-based restriction of requirePermissionWithResources.
 */
export async function erlaubteParks(check: {
  userId?: string;
  resourceRestricted?: boolean;
  allowedResourceIds?: string[];
}): Promise<string[] | null> {
  const benutzer = check.userId ? await getAllowedParkIds(check.userId) : null;
  const rolle = check.resourceRestricted ? (check.allowedResourceIds ?? null) : null;
  return erlaubteIds(benutzer, rolle);
}
