/**
 * Which tenant's user may an admin manage?
 *
 * The user list shows a superadmin all tenants. Routes that act on a single
 * user must then accept users of other tenants too — for everyone else the
 * user has to belong to the admin's own tenant.
 */

import { prisma } from "@/lib/prisma";
import { getUserHighestHierarchy } from "@/lib/auth/permissions";

/** Hierarchy level of SUPERADMIN (see the role catalogue). */
const SUPERADMIN_HIERARCHIE = 100;

export async function verwaltbarerNutzer(
  nutzerId: string,
  pruefer: { tenantId?: string | null; userId?: string | null },
): Promise<{ id: string; email: string; tenantId: string } | null> {
  const nutzer = await prisma.user.findUnique({
    where: { id: nutzerId },
    select: { id: true, email: true, tenantId: true },
  });
  if (!nutzer) return null;
  if (nutzer.tenantId === pruefer.tenantId) return nutzer;
  if (!pruefer.userId) return null;
  const hierarchie = await getUserHighestHierarchy(pruefer.userId);
  return hierarchie >= SUPERADMIN_HIERARCHIE ? nutzer : null;
}
