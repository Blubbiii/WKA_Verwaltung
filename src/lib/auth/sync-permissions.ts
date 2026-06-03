/**
 * PERMISSION CATALOG → DB SYNC
 * =============================
 *
 * Hält die `Permission`-Tabelle in der DB im Einklang mit dem
 * Single-Source-of-Truth Catalog ([permissions.catalog.ts](./permissions.catalog.ts)).
 *
 * Wird beim Boot des Node-Runtime aus [instrumentation.ts](../../instrumentation.ts)
 * aufgerufen. Idempotent (per `upsert`) und genau EINMAL pro Prozess-Lifetime
 * via Module-Scope-Flag.
 *
 * Konfliktverhalten:
 *   - Eine im Catalog NEU hinzugefügte Permission → wird angelegt.
 *   - Eine im Catalog GEÄNDERTE Beschreibung/Name → wird in der DB upgedated.
 *   - Eine in der DB existierende, im Catalog FEHLENDE Permission → bleibt
 *     unangetastet (keine destruktiven Operationen beim Boot — manuelle
 *     Bereinigung via Migration oder Drift-Check).
 */

import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { PERMISSION_CATALOG } from "./permissions.catalog";

let synced = false;
let inflight: Promise<void> | null = null;

/**
 * Synchronisiert den `PERMISSION_CATALOG` in die DB.
 * - Idempotent über Module-Scope (`synced`-Flag).
 * - Verhindert parallele Läufe via `inflight`-Promise.
 * - Wirft NICHT — Fehler werden geloggt, da der App-Start nicht blockiert
 *   werden soll, falls die DB temporär nicht erreichbar ist.
 */
export async function syncPermissionsCatalog(): Promise<void> {
  if (synced) return;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const start = Date.now();

      // Pre-Scan: existierende Names ermitteln, damit wir CREATE vs. UPDATE
      // ohne Schema-Erweiterung zählen können (Permission hat kein updatedAt).
      const existing = await prisma.permission.findMany({
        select: { name: true },
      });
      const existingNames = new Set(existing.map((e) => e.name));

      let created = 0;
      let updated = 0;

      for (const p of PERMISSION_CATALOG) {
        const isNew = !existingNames.has(p.name);
        await prisma.permission.upsert({
          where: { name: p.name },
          create: {
            name: p.name,
            displayName: p.displayName,
            module: p.module,
            action: p.action,
            description: p.description ?? null,
            sortOrder: p.sortOrder,
          },
          update: {
            displayName: p.displayName,
            module: p.module,
            action: p.action,
            description: p.description ?? null,
            sortOrder: p.sortOrder,
          },
        });
        if (isNew) created++;
        else updated++;
      }

      synced = true;
      logger.info(
        {
          catalogSize: PERMISSION_CATALOG.length,
          created,
          updated,
          durationMs: Date.now() - start,
        },
        "[PERMISSIONS] Catalog synced to DB",
      );
    } catch (err) {
      // Nicht synced setzen — nächster Boot soll es erneut versuchen.
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[PERMISSIONS] Catalog sync failed (will retry on next boot)",
      );
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Nur für Tests: setzt den Sync-State zurück.
 * @internal
 */
export function _resetSyncStateForTests(): void {
  synced = false;
  inflight = null;
}
