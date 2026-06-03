/**
 * P-3 Sprint 2: Redis-Cache für Buchhaltungs-Reports.
 *
 * Reports (Bilanz, GuV, BWA, SuSa, UStVA, Anlagenspiegel) basieren
 * ausschließlich auf POSTED-JournalEntries — und POSTED-Buchungen sind
 * per GoBD §146 AO unveränderlich. Damit lassen sich Reports gefahrlos
 * cachen, solange wir bei jeder POST/REVERSE-Aktion invalidieren.
 *
 * Key-Pattern: `report:{name}:{tenantId}:{params-hash}`
 * TTL: 1 Stunde (Redis-Default, bei Mutation wird vorher invalidiert)
 */

import { cache } from "./index";

const REPORTS_CACHE_TTL_SECONDS = 60 * 60; // 1 Stunde

/**
 * Wrap a report-generator in cache.getOrSet.
 *
 * @param name Report-Name (z.B. "bilanz", "guv", "ustva")
 * @param tenantId Mandant
 * @param paramsKey Eindeutiger Schlüssel aus den Report-Parametern (z.B. "2026-31-12")
 * @param fetchFn Funktion die den Report neu berechnet
 */
export async function getCachedReport<T>(
  name: string,
  tenantId: string,
  paramsKey: string,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const key = `report:${name}:${paramsKey}`;
  return cache.getOrSet<T>(key, fetchFn, REPORTS_CACHE_TTL_SECONDS, tenantId);
}

/**
 * Invalidiert ALLE Report-Caches eines Mandanten.
 * Wird beim Posten / Stornieren einer Buchung gerufen.
 */
export async function invalidateReportsCache(tenantId: string): Promise<void> {
  await cache.delPattern("report:*", tenantId);
}
