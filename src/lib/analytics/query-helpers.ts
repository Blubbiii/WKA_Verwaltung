import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { AnalyticsTurbineMeta } from "@/types/analytics";
import { LOCALE_DE } from "@/lib/format";
import { cache } from "@/lib/cache";
import {
  SCADA_INTERVAL_MINUTES,
  SCADA_INTERVALS_PER_HOUR,
} from "@/lib/config/scada";

// =============================================================================
// Analytics Query Helpers
// Shared utilities for all analytics API endpoints and module fetchers
// =============================================================================

/**
 * TTL fuer den Turbines-Cache. Analytics-Endpoints laufen oft in Bursts
 * parallel (Dashboard laedt 5-10 Module gleichzeitig — jedes ruft
 * loadTurbines auf). 5s Cache eliminiert den Duplicate-Fetch fast
 * vollstaendig, ohne dass Aenderungen an Turbine-Metadaten spuerbar
 * verzoegern.
 */
const TURBINES_CACHE_TTL_SECONDS = 5;

/**
 * Load authorized turbines for a tenant, optionally filtered by park.
 * ALWAYS filters to deviceType='WEA' (no Parkrechner/NVP in analytics).
 * Returns turbine metadata needed for KPI calculations.
 *
 * P13: Cached in Redis (5s TTL) — Dashboard-Bursts (5-10 Analytics-
 * Endpoints parallel) treffen sonst pro Request diesen findMany.
 * Invalidierung ist unnoetig — TTL genuegt fuer die Aenderungs-Frequenz.
 */
export async function loadTurbines(
  tenantId: string,
  parkId?: string | null
): Promise<AnalyticsTurbineMeta[]> {
  const cacheKey = `analytics:turbines:${parkId ?? "all"}`;
  return cache.getOrSet<AnalyticsTurbineMeta[]>(
    cacheKey,
    async () => {
      const where: Record<string, unknown> = {
        park: { tenantId },
        deviceType: "WEA",
      };
      if (parkId && parkId !== "all") {
        where.parkId = parkId;
      }

      const turbines = await prisma.turbine.findMany({
        where,
        select: {
          id: true,
          designation: true,
          ratedPowerKw: true,
          park: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ park: { name: "asc" } }, { designation: "asc" }],
      });

      return turbines.map((t) => ({
        id: t.id,
        designation: t.designation,
        parkId: t.park.id,
        parkName: t.park.name,
        ratedPowerKw: t.ratedPowerKw ? Number(t.ratedPowerKw) : 0,
      }));
    },
    TURBINES_CACHE_TTL_SECONDS,
    tenantId,
  );
}

/**
 * Build a date range for a given year.
 * Returns [fromDate, toDate) half-open interval.
 */
export function buildDateRange(year: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, 0, 1)),     // Jan 1 of year
    to: new Date(Date.UTC(year + 1, 0, 1)),   // Jan 1 of next year
  };
}

/**
 * Calculate hours in a time period.
 */
export function hoursInPeriod(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60);
}

// Das Messintervall lag als eigene Konstante in fünf Modulen. Es steht jetzt
// in @/lib/config/scada — hier nur noch weitergereicht, damit bestehende
// Importe aus diesem Modul weiter aufgehen.
export { SCADA_INTERVAL_MINUTES, SCADA_INTERVALS_PER_HOUR };

/**
 * Begrenzt das Ende eines Auswertungszeitraums auf "jetzt".
 *
 * FIX F20 (a): `buildDateRange(year)` liefert immer den 1.1. des Folgejahres. Im
 * LAUFENDEN Jahr war der Nenner des Kapazitätsfaktors dadurch immer 8.760 h, auch
 * wenn erst sieben Monate Daten vorlagen — der Kapazitätsfaktor war systematisch um
 * den Faktor "vergangener Anteil des Jahres" zu niedrig.
 */
export function clampPeriodEnd(to: Date, now: Date = new Date()): Date {
  return to.getTime() > now.getTime() ? now : to;
}

/**
 * Tatsächlich durch Messdaten abgedeckte Stunden eines Zeitraums.
 *
 * FIX F20 (b): Jeder WSD-Messpunkt repräsentiert 10 Minuten. Der Kapazitätsfaktor
 * muss deshalb gegen die GEMESSENE Zeit gerechnet werden, nicht gegen die
 * Kalenderzeit — sonst bestraft eine Import-Lücke die Anlage so, als hätte sie in
 * dieser Zeit nichts produziert. Stillstände sind davon NICHT betroffen: die
 * SCADA-Zeilen existieren dann mit `powerW = 0` und zählen weiter mit.
 *
 * Die abgedeckte Zeit wird auf die Zeitraumlänge gedeckelt (Doppelmessungen /
 * Sommerzeit-Überlappungen dürfen den Nenner nicht aufblähen).
 */
export function coveredHoursFromDataPoints(
  dataPoints: number,
  periodHours: number
): number {
  const covered = dataPoints / SCADA_INTERVALS_PER_HOUR;
  return periodHours > 0 ? Math.min(covered, periodHours) : covered;
}

/**
 * Safely convert Prisma Decimal or bigint to number.
 * Returns 0 for null/undefined values.
 */
export function safeNumber(val: unknown): number {
  if (val == null) return 0;
  return Number(val);
}

// Sprint 1: round() ist nach @/lib/format umgezogen — hier nur Re-Export.
export { round } from "@/lib/format";

/**
 * Build Prisma.sql WHERE fragment for turbine IDs.
 * Used in raw SQL queries for SCADA data.
 */
export function buildTurbineIdFilter(turbineIds: string[]): Prisma.Sql {
  if (turbineIds.length === 0) {
    return Prisma.sql`1 = 0`; // Match nothing
  }
  return Prisma.sql`"turbineId" IN (${Prisma.join(turbineIds)})`;
}

/**
 * Build a turbine lookup map from metadata array.
 */
export function buildTurbineMap(
  turbines: AnalyticsTurbineMeta[]
): Map<string, AnalyticsTurbineMeta> {
  return new Map(turbines.map((t) => [t.id, t]));
}

/**
 * German month label for a 1-based month number.
 */
const MONTH_NAMES = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
export function monthLabel(month: number): string {
  return MONTH_NAMES[(month - 1) % 12] ?? `M${month}`;
}

/**
 * German number formatter (no decimals).
 */
export const numberFormatter = new Intl.NumberFormat(LOCALE_DE, {
  maximumFractionDigits: 0,
});


