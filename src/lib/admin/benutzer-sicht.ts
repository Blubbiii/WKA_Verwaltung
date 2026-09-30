/**
 * Who sees and edits which users (2026-09, support phase 2).
 *
 * - Platform operator: details of users of the tenant he works in and of
 *   tenants with an active support access (lib/support/sicht); of others
 *   a count only.
 * - Customer admin: memberships of the tenant he works in and of every other
 *   tenant where he is administrator himself — so a customer with separate
 *   units assigns its people to them without the platform operator.
 */

import { prisma } from "@/lib/prisma";
import { getUserHighestHierarchy } from "@/lib/auth/permissions";
import { ROLE_HIERARCHY } from "@/lib/auth/hierarchy";
import { mandantenMitFreigabe } from "@/lib/support/zugang";
import { superadminSiehtMandant, type SuperadminLage } from "@/lib/support/sicht";

export async function superadminLage(aktiverMandant: string): Promise<SuperadminLage> {
  return { aktiverMandant, mitFreigabe: await mandantenMitFreigabe() };
}

export function sichtbareMandanten(lage: SuperadminLage): string[] {
  return [...new Set([lage.aktiverMandant, ...lage.mitFreigabe])];
}

export { superadminSiehtMandant };

/** Tenants whose memberships a customer admin may set: the active one, and those where he is administrator. */
export async function verwalteteMandanten(userId: string, aktiverMandant: string): Promise<Set<string>> {
  const eigene = await prisma.userTenantMembership.findMany({
    where: { userId, status: "ACTIVE" },
    select: { tenantId: true },
  });
  const ergebnis = new Set([aktiverMandant]);
  for (const { tenantId } of eigene) {
    if ((await getUserHighestHierarchy(userId, tenantId)) >= ROLE_HIERARCHY.ADMIN) ergebnis.add(tenantId);
  }
  return ergebnis;
}
