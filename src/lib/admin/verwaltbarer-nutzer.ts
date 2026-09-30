/**
 * Which tenant's user may an admin manage?
 *
 * The user list shows a superadmin all tenants. Routes that act on a single
 * user must then accept users of other tenants too — for everyone else the
 * user has to belong to the admin's own tenant.
 */

import { prisma } from "@/lib/prisma";
import { isSuperadmin } from "@/lib/auth/permissions";

/** Hierarchy level of SUPERADMIN (see the role catalogue). */

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
  return (await isSuperadmin(pruefer.userId)) ? nutzer : null;
}
