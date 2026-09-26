/**
 * Database side of the licence (see lizenz.ts for the rules).
 */

import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { cache } from "@/lib/cache";
import {
  anlegenVerweigert,
  lizenzLage,
  lizenzMeldung,
  wirksameGrenzen,
  UMSPANNWERK_CODE,
  type Abweichung,
  type LizenzLage,
  type Verbrauch,
  type Zaehler,
} from "./lizenz";

export async function zaehleVerbrauch(tenantId: string): Promise<Verbrauch> {
  const aktiveFirma = {
    tenantId,
    deletedAt: null,
    verwaltung: "AKTIV" as const,
    status: { not: "ARCHIVED" as const },
  };
  const [firmen, umspannwerke, wea, benutzer, tenant] = await Promise.all([
    prisma.fund.count({
      where: { ...aktiveFirma, OR: [{ fundCategory: null }, { fundCategory: { code: { not: UMSPANNWERK_CODE } } }] },
    }),
    prisma.fund.count({ where: { ...aktiveFirma, fundCategory: { code: UMSPANNWERK_CODE } } }),
    prisma.turbine.count({
      where: { deviceType: "WEA", status: { not: "ARCHIVED" }, park: { tenantId, deletedAt: null } },
    }),
    // Portal users (linked to a shareholder) are the customer's investors — free.
    prisma.user.count({ where: { tenantId, status: "ACTIVE", shareholder: null } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { storageUsedBytes: true } }),
  ]);
  return {
    firmen,
    umspannwerke,
    wea,
    benutzer,
    speicherMb: Math.ceil(Number(tenant?.storageUsedBytes ?? 0) / 1024 / 1024),
  };
}

export interface Lizenz {
  tarif: { id: string; key: string; name: string } | null;
  abweichung: Abweichung | null;
  lage: LizenzLage;
}

/**
 * Licence state of a customer. Keeps `lizenzUeberschrittenSeit` in step:
 * set on the first exceeding, cleared once back within limits.
 */
export async function ladeLizenz(tenantId: string, jetzt = new Date()): Promise<Lizenz> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { tarif: true, lizenzAbweichung: true, lizenzUeberschrittenSeit: true },
  });
  const abweichung = (tenant?.lizenzAbweichung as Abweichung | null) ?? null;
  const grenzen = wirksameGrenzen(tenant?.tarif ?? null, abweichung);
  const verbrauch = await zaehleVerbrauch(tenantId);
  const lage = lizenzLage(grenzen, verbrauch, tenant?.lizenzUeberschrittenSeit ?? null, jetzt);

  const ueber = lage.ueberschritten.length > 0;
  const seit = tenant?.lizenzUeberschrittenSeit ?? null;
  if (ueber !== !!seit) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { lizenzUeberschrittenSeit: ueber ? jetzt : null },
    });
    await cache.del(sperrSchluessel(tenantId)).catch(() => undefined);
  }

  const t = tenant?.tarif;
  return { tarif: t ? { id: t.id, key: t.key, name: t.name } : null, abweichung, lage };
}

/**
 * Check before creating `anzahl` objects of a kind. Returns the error
 * response to send, or null when it fits.
 */
export async function lizenzPruefen(tenantId: string, zaehler: Zaehler, anzahl = 1) {
  if (anzahl <= 0) return null;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { tarif: true, lizenzAbweichung: true },
  });
  const grenzen = wirksameGrenzen(tenant?.tarif ?? null, (tenant?.lizenzAbweichung as Abweichung | null) ?? null);
  if (grenzen[zaehler] === null) return null;
  const verweigert = anlegenVerweigert(grenzen, await zaehleVerbrauch(tenantId), zaehler, anzahl);
  if (!verweigert) return null;
  return apiError("QUOTA_EXCEEDED", 402, {
    message: lizenzMeldung(tenant?.tarif?.name ?? "", verweigert),
    details: verweigert,
  });
}

const sperrSchluessel = (tenantId: string) => `lizenz-sperre:${tenantId}`;

/**
 * Is editing master data locked (grace period over)? Asked on every
 * permission check, therefore cached for a minute. A lock is re-checked
 * fresh before it is enforced, so a customer who just deleted enough is
 * not held back by the cache.
 */
export async function bearbeitungGesperrt(tenantId: string): Promise<boolean> {
  const zwischen = await cache.get<boolean>(sperrSchluessel(tenantId)).catch(() => null);
  let gesperrt = zwischen;
  if (gesperrt === null || gesperrt === undefined) {
    const t = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { lizenzUeberschrittenSeit: true },
    });
    gesperrt = !!t?.lizenzUeberschrittenSeit;
    await cache.set(sperrSchluessel(tenantId), gesperrt, 60).catch(() => undefined);
  }
  if (!gesperrt) return false;
  // Only exceeded → the grace period may still run, or the customer may be
  // back within limits: decide on fresh numbers.
  const frisch = (await ladeLizenz(tenantId)).lage.gesperrt;
  await cache.set(sperrSchluessel(tenantId), frisch, 60).catch(() => undefined);
  return frisch;
}
