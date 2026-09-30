/**
 * Who may work in a tenant other than their own (2026-09).
 *
 * - Anyone with an active membership of that tenant.
 * - The platform operator (superadmin) only while the tenant has an active
 *   support access: granted by the customer's admin (FREIGABE, 1 h / 1 d /
 *   7 d) or opened as an emergency access with a reason (NOTFALL, 1 h).
 *
 * withPermission asks this on every request that carries a tenant switch —
 * a cookie signed at switch time is not enough once a membership is revoked
 * or a support access ends. Answers are cached briefly per user and tenant.
 */

import { prisma } from "@/lib/prisma";
import { isSuperadmin } from "@/lib/auth/permissions";
import { zugangErlaubt } from "./regeln";
import { supportEintrag } from "./protokoll";

export { gueltigBisFuer, istAktiv, zugangErlaubt, NOTFALL_DAUER_MS, type Laufzeit } from "./regeln";

/** The tenant's currently active support access, if any. */
export async function aktiverSupportZugriff(tenantId: string) {
  return prisma.supportZugriff.findFirst({
    where: { tenantId, beendetAm: null, gueltigBis: { gt: new Date() } },
    orderBy: { gueltigBis: "desc" },
    select: { id: true, art: true, gueltigBis: true, begruendung: true },
  });
}

const CACHE_MS = 30_000;
const cache = new Map<string, { erlaubt: boolean; bis: number }>();

/** May `userId` work in `tenantId` (not their home tenant) right now? */
export async function darfMandantNutzen(userId: string, tenantId: string): Promise<boolean> {
  const schluessel = `${userId}:${tenantId}`;
  const treffer = cache.get(schluessel);
  if (treffer && treffer.bis > Date.now()) return treffer.erlaubt;

  const mitgliedschaft = await prisma.userTenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true },
  });
  const mitglied = mitgliedschaft?.status === "ACTIVE";
  const superadmin = !mitglied && (await isSuperadmin(userId));
  const supportAktiv = superadmin && (await aktiverSupportZugriff(tenantId)) !== null;

  const erlaubt = zugangErlaubt({ mitglied, superadmin, supportAktiv });
  cache.set(schluessel, { erlaubt, bis: Date.now() + CACHE_MS });
  return erlaubt;
}

/** Forget cached answers for a tenant — after a support access was granted or ended. */
export function vergesseZugang(tenantId: string): void {
  for (const schluessel of cache.keys()) {
    if (schluessel.endsWith(`:${tenantId}`)) cache.delete(schluessel);
  }
}

/** Tenants with an active support access right now (grant or emergency). */
export async function mandantenMitFreigabe(): Promise<Set<string>> {
  const aktiv = await prisma.supportZugriff.findMany({
    where: { beendetAm: null, gueltigBis: { gt: new Date() } },
    select: { tenantId: true },
  });
  return new Set(aktiv.map((z) => z.tenantId));
}

/**
 * Records a writing request of the platform support in the customer's
 * protocol (Einstellungen → Externe Zugriffe). Never fails the request.
 */
export async function protokolliereSupport(userId: string, tenantId: string, permission: string | string[]): Promise<void> {
  const eintrag = supportEintrag(permission);
  if (!eintrag) return;
  try {
    await prisma.auditLog.create({
      data: {
        action: eintrag.action,
        entityType: "SupportZugriff",
        entityId: tenantId,
        tenantId,
        userId,
        impersonatedById: userId,
        newValues: { recht: eintrag.recht },
      },
    });
  } catch {
    // The protocol must not break the support's request.
  }
}
