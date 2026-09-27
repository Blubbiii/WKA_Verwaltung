/**
 * Tenant-bound database access (2026-09).
 *
 *   const check = await requirePermission("parks:read");
 *   if (!check.authorized) return check.error;
 *   const db = mandantDb(check.tenantId!);
 *   const parks = await db.park.findMany();          // only this tenant's parks
 *   await db.park.update({ where: { id }, data });   // another tenant's id → not found
 *
 * Every query on a tenant model gets the tenant added (lib/mandant/mandant-filter);
 * creating sets it. Nested reads (include/select of relations) are not
 * rewritten — they start from a row that is already the tenant's.
 *
 * Raw SQL ($queryRaw) passes through unchanged: it must name the tenant itself
 * ("tenantId" = ${tenantId}) — lib/mandant/rohsql.test.ts enforces that.
 * Cross-tenant work (workers, platform operator) keeps using `prisma` on purpose.
 */

import { prismaBasis } from "@/lib/prisma";
import { mandantFilter } from "./mandant-filter";

function erzeuge(tenantId: string) {
  // On the client without observation: every query here is scoped already.
  return prismaBasis.$extends({
    name: "mandant",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(mandantFilter(model, operation, (args ?? {}) as Record<string, unknown>, tenantId) as typeof args);
        },
      },
    },
  });
}

export type MandantDb = ReturnType<typeof erzeuge>;

// One client per tenant; extending is cheap but not free.
const zwischenspeicher = new Map<string, MandantDb>();
const MAX_EINTRAEGE = 500;

export function mandantDb(tenantId: string): MandantDb {
  if (!tenantId) throw new Error("mandantDb ohne Mandant — die Rechteprüfung liefert ihn (check.tenantId)");
  let db = zwischenspeicher.get(tenantId);
  if (!db) {
    if (zwischenspeicher.size >= MAX_EINTRAEGE) {
      const aeltester = zwischenspeicher.keys().next().value;
      if (aeltester) zwischenspeicher.delete(aeltester);
    }
    db = erzeuge(tenantId);
    zwischenspeicher.set(tenantId, db);
  }
  return db;
}
