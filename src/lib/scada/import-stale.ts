/**
 * Stale-Detection für SCADA-Imports.
 *
 * `startImport()` läuft als Fire-and-Forget-Promise im Route-Handler. Bei einem
 * Prozess-Kill oder Redeploy bleibt der zugehörige `ScadaImportLog` für immer auf
 * `RUNNING` stehen. Danach blockiert der manuelle Import mit CONFLICT und der
 * Auto-Import überspringt den Dateityp stillschweigend — der Ausfall fällt erst
 * bei der nächsten Abrechnung auf, und nur ein DB-Eingriff hilft.
 *
 * Diese Datei erkennt solche Leichen anhand ihres Alters und schließt sie ab.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const scadaLogger = logger.child({ module: "scada-import" });

/**
 * Nach wie vielen Stunden ohne Abschluss gilt ein `RUNNING`-Import als abgebrochen.
 *
 * Konfigurierbar über `SCADA_IMPORT_STALE_HOURS`. Default 6 h — großzügig über der
 * Laufzeit eines Vollimports (mehrere tausend Dateien), aber klein genug, dass ein
 * nächtlicher Auto-Import am Folgetag nicht blockiert.
 */
export function getStaleImportHours(): number {
  const raw = process.env.SCADA_IMPORT_STALE_HOURS;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 6;
}

export interface ReapStaleImportsResult {
  /** Anzahl der als abgebrochen markierten Import-Logs */
  reaped: number;
  /** Verwendete Altersgrenze in Stunden */
  staleHours: number;
}

/**
 * Markiert hängengebliebene `RUNNING`-Imports als `FAILED`.
 *
 * Wird vor jedem Start-Versuch aufgerufen (manuell und Auto-Import), damit ein
 * abgebrochener Lauf keine Folgeimporte dauerhaft blockiert.
 *
 * Bewusst KEIN Cron: der Aufruf am Startpfad ist selbstheilend und braucht keinen
 * zusätzlichen Worker.
 *
 * @param tenantId - Mandant (Pflicht — nie tenant-übergreifend aufräumen)
 * @param filter - optional auf locationCode/fileType eingrenzen
 */
export async function reapStaleImports(
  tenantId: string,
  filter?: { locationCode?: string; fileType?: string | string[] },
): Promise<ReapStaleImportsResult> {
  const staleHours = getStaleImportHours();
  const cutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000);

  const result = await prisma.scadaImportLog.updateMany({
    where: {
      tenantId,
      status: "RUNNING",
      // startedAt statt updatedAt: updatedAt wird nach jeder Datei geschrieben, ein
      // im Leerlauf hängender Prozess würde damit nie ablaufen. Über startedAt ist
      // die Grenze eine harte Maximallaufzeit.
      startedAt: { lt: cutoff },
      ...(filter?.locationCode ? { locationCode: filter.locationCode } : {}),
      ...(filter?.fileType
        ? Array.isArray(filter.fileType)
          ? { fileType: { in: filter.fileType } }
          : { fileType: filter.fileType }
        : {}),
    },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorDetails: {
        message: `Import wurde nach ${staleHours} h ohne Abschluss als abgebrochen markiert (Prozess-Kill oder Redeploy). Bitte erneut starten.`,
        reapedAt: new Date().toISOString(),
      },
    },
  });

  if (result.count > 0) {
    scadaLogger.warn(
      { tenantId, reaped: result.count, staleHours, ...filter },
      "[ScadaImport] Hängengebliebene RUNNING-Imports als FAILED markiert",
    );
  }

  return { reaped: result.count, staleHours };
}

/**
 * Bricht einen laufenden Import kooperativ ab.
 *
 * Setzt den Log auf `CANCELLED`. Die Import-Schleife prüft den Status zwischen den
 * Dateien (`isImportCancelled`) und bricht dann ab — ein hartes Killen des laufenden
 * Promise ist in Node nicht möglich.
 *
 * @returns true, wenn ein RUNNING-Log auf CANCELLED gesetzt wurde
 */
export async function cancelImport(
  tenantId: string,
  importLogId: string,
  reason?: string,
): Promise<boolean> {
  const result = await prisma.scadaImportLog.updateMany({
    where: { id: importLogId, tenantId, status: "RUNNING" },
    data: {
      status: "CANCELLED",
      completedAt: new Date(),
      errorDetails: {
        message: reason
          ? `Import manuell abgebrochen: ${reason}`
          : "Import manuell abgebrochen",
        cancelledAt: new Date().toISOString(),
      },
    },
  });

  return result.count > 0;
}

/**
 * Prüft, ob ein Import zwischenzeitlich abgebrochen wurde.
 * Wird von der Datei-Schleife in `startImport()` zwischen den Dateien aufgerufen.
 */
export async function isImportCancelled(importLogId: string): Promise<boolean> {
  const log = await prisma.scadaImportLog.findUnique({
    where: { id: importLogId },
    select: { status: true },
  });
  return log?.status === "CANCELLED";
}
