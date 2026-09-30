/**
 * Which tenant's user may an admin manage?
 *
 * A user of the admin's own tenant — or, for the platform operator, of a
 * tenant he may see: the one he works in or one with an active support
 * access (support phase 2, 2026-09). Without the customer's consent he
 * manages no one's access to the customer's funds and parks.
 */

import { prisma } from "@/lib/prisma";
import { isSuperadmin } from "@/lib/auth/permissions";
import { superadminLage, superadminSiehtMandant } from "./benutzer-sicht";

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
  if (!pruefer.userId || !pruefer.tenantId) return null;
  if (!(await isSuperadmin(pruefer.userId))) return null;
  return superadminSiehtMandant(nutzer.tenantId, await superadminLage(pruefer.tenantId)) ? nutzer : null;
}
