import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { AnalyticsTurbineMeta } from "@/types/analytics";

// =============================================================================
// Analytics Query Helpers
// Shared utilities for all analytics API endpoints and module fetchers
// =============================================================================

/**
 * Load authorized turbines for a tenant, optionally filtered by park.
 * ALWAYS filters to deviceType='WEA' (no Parkrechner/NVP in analytics).
 * Returns turbine metadata needed for KPI calculations.
 */
export async function loadTurbines(
  tenantId: string,
  parkId?: string | null
): Promise<AnalyticsTurbineMeta[]> {
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

/**
 * Safely convert Prisma Decimal or bigint to number.
 * Returns 0 for null/undefined values.
 */
export function safeNumber(val: unknown): number {
  if (val == null) return 0;
  return Number(val);
}

/**
 * Round a number to specified decimal places.
 */
export function round(val: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

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
export const numberFormatter = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 0,
});

/**
 * German number formatter (1 decimal).
 */
export const decimal1Formatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * German number formatter (2 decimals).
 */
export const decimal2Formatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
