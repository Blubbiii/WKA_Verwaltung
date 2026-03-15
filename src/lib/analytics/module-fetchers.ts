import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  loadTurbines,
  buildDateRange,
  hoursInPeriod,
  safeNumber,
  round,
  buildTurbineIdFilter,
  buildTurbineMap,
  monthLabel,
} from "./query-helpers";
import type {
  TurbinePerformanceKpi,
  FleetPerformanceSummary,
  HeatmapData,
  HeatmapCell,
  YearOverYearData,
  AvailabilityBreakdown,
  AvailabilityTrendPoint,
  ParetoItem,
  TurbineComparisonEntry,
  PowerCurvePoint,
  TurbineComparisonResponse,
  FaultParetoItem,
  WarningTrendPoint,
  WindDistributionBin,
  SeasonalPatternPoint,
  DirectionEfficiency,
  MonthlyRevenuePoint,
  ShadowPerTurbine,
  ShadowMonthlyTrend,
  ShadowDailyProfile,
  OperatingStateParetoItem,
  OperatingStatePerTurbine,
  OperatingStateTimelineEntry,
  PhaseSymmetryTrendPoint,
  PhaseSymmetryPerTurbine,
  PhasePowersMonthly,
} from "@/types/analytics";

// =============================================================================
// Performance Module Fetchers
// =============================================================================

interface ProductionRow {
  turbineId: string;
  production_kwh: Prisma.Decimal | null;
  avg_wind_speed: Prisma.Decimal | null;
  data_points: bigint;
}

/**
 * Fetch performance KPIs per turbine for a given year.
 */
export async function fetchPerformanceKpis(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<{ turbines: TurbinePerformanceKpi[]; fleet: FleetPerformanceSummary }> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) {
    return {
      turbines: [],
      fleet: { totalProductionKwh: 0, avgCapacityFactor: 0, avgSpecificYield: 0, totalInstalledKw: 0, avgWindSpeed: null },
    };
  }

  const turbineMap = buildTurbineMap(turbines);
  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);
  const hours = hoursInPeriod(from, to);

  // Expected data points per turbine (10-min intervals in a year)
  const expectedPoints = hours * 6;

  const rows = await prisma.$queryRaw<ProductionRow[]>`
    SELECT
      "turbineId",
      SUM("powerW" * 10.0 / 60.0 / 1000.0) AS production_kwh,
      AVG("windSpeedMs") AS avg_wind_speed,
      COUNT(*) AS data_points
    FROM scada_measurements
    WHERE "tenantId" = ${tenantId}
      AND "sourceFile" = 'WSD'
      AND "powerW" IS NOT NULL
      AND ${buildTurbineIdFilter(turbineIds)}
      AND "timestamp" >= ${from}
      AND "timestamp" < ${to}
    GROUP BY "turbineId"
  `;

  const rowMap = new Map(rows.map((r) => [r.turbineId, r]));

  const turbineKpis: TurbinePerformanceKpi[] = turbines.map((t) => {
    const row = rowMap.get(t.id);
    const productionKwh = safeNumber(row?.production_kwh);
    const dataPoints = Number(row?.data_points ?? 0);
    const capacityFactor = t.ratedPowerKw > 0 && hours > 0
      ? round((productionKwh / (t.ratedPowerKw * hours)) * 100, 2)
      : 0;
    const specificYield = t.ratedPowerKw > 0
      ? round(productionKwh / t.ratedPowerKw, 1)
      : 0;

    return {
      turbineId: t.id,
      designation: t.designation,
      parkName: t.parkName,
      ratedPowerKw: t.ratedPowerKw,
      productionKwh: round(productionKwh, 1),
      hoursInPeriod: round(hours, 0),
      capacityFactor,
      specificYield,
      avgWindSpeed: row?.avg_wind_speed != null ? round(safeNumber(row.avg_wind_speed), 2) : null,
      dataPoints,
      dataCompleteness: expectedPoints > 0 ? round((dataPoints / expectedPoints) * 100, 1) : 0,
    };
  });

  // Fleet aggregation
  const totalProd = turbineKpis.reduce((s, t) => s + t.productionKwh, 0);
  const totalKw = turbines.reduce((s, t) => s + t.ratedPowerKw, 0);
  const windSpeeds = turbineKpis.filter((t) => t.avgWindSpeed !== null).map((t) => t.avgWindSpeed!);

  const fleet: FleetPerformanceSummary = {
    totalProductionKwh: round(totalProd, 1),
    avgCapacityFactor: totalKw > 0 && hours > 0
      ? round((totalProd / (totalKw * hours)) * 100, 2)
      : 0,
    avgSpecificYield: totalKw > 0 ? round(totalProd / totalKw, 1) : 0,
    totalInstalledKw: totalKw,
    avgWindSpeed: windSpeeds.length > 0
      ? round(windSpeeds.reduce((s, v) => s + v, 0) / windSpeeds.length, 2)
      : null,
  };

  return { turbines: turbineKpis, fleet };
}

// --- Production Heatmap ---

interface HeatmapRow {
  turbineId: string;
  month_start: Date;
  production_kwh: Prisma.Decimal | null;
}

/**
 * Fetch monthly production per turbine for heatmap visualization.
 */
export async function fetchProductionHeatmap(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<HeatmapData[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineMap = buildTurbineMap(turbines);
  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  const rows = await prisma.$queryRaw<HeatmapRow[]>`
    SELECT
      "turbineId",
      date_trunc('month', "timestamp") AS month_start,
      SUM("powerW" * 10.0 / 60.0 / 1000.0) AS production_kwh
    FROM scada_measurements
    WHERE "tenantId" = ${tenantId}
      AND "sourceFile" = 'WSD'
      AND "powerW" IS NOT NULL
      AND ${buildTurbineIdFilter(turbineIds)}
      AND "timestamp" >= ${from}
      AND "timestamp" < ${to}
    GROUP BY "turbineId", date_trunc('month', "timestamp")
    ORDER BY "turbineId", month_start
  `;

  // Find global max for normalization
  let maxVal = 0;
  for (const r of rows) {
    const v = safeNumber(r.production_kwh);
    if (v > maxVal) maxVal = v;
  }

  // Group by turbine
  const grouped = new Map<string, HeatmapCell[]>();
  for (const r of rows) {
    const val = safeNumber(r.production_kwh);
    const d = new Date(r.month_start);
    const cell: HeatmapCell = {
      month: d.getUTCMonth() + 1,
      year: d.getUTCFullYear(),
      value: round(val, 1),
      normalized: maxVal > 0 ? round(val / maxVal, 3) : 0,
    };
    const arr = grouped.get(r.turbineId) || [];
    arr.push(cell);
    grouped.set(r.turbineId, arr);
  }

  return turbines.map((t) => ({
    turbineId: t.id,
    designation: t.designation,
    months: grouped.get(t.id) || [],
  }));
}

// --- Year-over-Year ---

interface YoyRow {
  month_num: number;
  production_kwh: Prisma.Decimal | null;
}

/**
 * Fetch monthly production totals for year-over-year comparison.
 */
export async function fetchYearOverYear(
  tenantId: string,
  currentYear: number,
  compareYear: number,
  parkId?: string | null
): Promise<YearOverYearData[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineIds = turbines.map((t) => t.id);

  async function fetchYearMonthly(yr: number): Promise<Map<number, number>> {
    const { from, to } = buildDateRange(yr);
    const rows = await prisma.$queryRaw<YoyRow[]>`
      SELECT
        EXTRACT(MONTH FROM "timestamp")::int AS month_num,
        SUM("powerW" * 10.0 / 60.0 / 1000.0) AS production_kwh
      FROM scada_measurements
      WHERE "tenantId" = ${tenantId}
        AND "sourceFile" = 'WSD'
        AND "powerW" IS NOT NULL
        AND ${buildTurbineIdFilter(turbineIds)}
        AND "timestamp" >= ${from}
        AND "timestamp" < ${to}
      GROUP BY EXTRACT(MONTH FROM "timestamp")
      ORDER BY month_num
    `;
    const map = new Map<number, number>();
    for (const r of rows) {
      map.set(r.month_num, round(safeNumber(r.production_kwh), 1));
    }
    return map;
  }

  const [currentData, compareData] = await Promise.all([
    fetchYearMonthly(currentYear),
    fetchYearMonthly(compareYear),
  ]);

  const result: YearOverYearData[] = [];
  for (let m = 1; m <= 12; m++) {
    result.push({
      month: m,
      label: monthLabel(m),
      currentYear: currentData.get(m) ?? 0,
      previousYear: compareData.get(m) ?? 0,
    });
  }

  return result;
}

// =============================================================================
// Availability Module Fetchers
// =============================================================================

interface AvailRow {
  turbineId: string;
  t1_total: bigint;
  t2_total: bigint;
  t3_total: bigint;
  t4_total: bigint;
  t5_total: bigint;
  t6_total: bigint;
  t5_1_total: bigint;
  t5_2_total: bigint;
  t5_3_total: bigint;
}

/**
 * Fetch T1-T6 availability breakdown per turbine for a year.
 */
export async function fetchAvailabilityBreakdown(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<AvailabilityBreakdown[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineMap = buildTurbineMap(turbines);
  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  const rows = await prisma.$queryRaw<AvailRow[]>`
    SELECT
      "turbineId",
      SUM(t1)::bigint AS t1_total,
      SUM(t2)::bigint AS t2_total,
      SUM(t3)::bigint AS t3_total,
      SUM(t4)::bigint AS t4_total,
      SUM(t5)::bigint AS t5_total,
      SUM(t6)::bigint AS t6_total,
      SUM("t5_1")::bigint AS t5_1_total,
      SUM("t5_2")::bigint AS t5_2_total,
      SUM("t5_3")::bigint AS t5_3_total
    FROM scada_availability
    WHERE "tenantId" = ${tenantId}
      AND "periodType" = 'MONTHLY'
      AND ${buildTurbineIdFilter(turbineIds)}
      AND date >= ${from}
      AND date < ${to}
    GROUP BY "turbineId"
  `;

  const rowMap = new Map(rows.map((r) => [r.turbineId, r]));

  return turbines.map((t) => {
    const r = rowMap.get(t.id);
    const t1 = Number(r?.t1_total ?? 0);
    const t2 = Number(r?.t2_total ?? 0);
    const t3 = Number(r?.t3_total ?? 0);
    const t4 = Number(r?.t4_total ?? 0);
    const t5 = Number(r?.t5_total ?? 0);
    const t6 = Number(r?.t6_total ?? 0);
    const total = t1 + t2 + t3 + t4 + t5 + t6;

    return {
      turbineId: t.id,
      designation: t.designation,
      t1, t2, t3, t4, t5, t6,
      t5_1: Number(r?.t5_1_total ?? 0),
      t5_2: Number(r?.t5_2_total ?? 0),
      t5_3: Number(r?.t5_3_total ?? 0),
      availabilityPct: total > 0 ? round((t1 / total) * 100, 2) : 0,
      totalSeconds: total,
    };
  });
}

// --- Availability Trend ---

interface AvailTrendRow {
  month_start: Date;
  avg_availability: Prisma.Decimal | null;
  turbine_count: bigint;
}

/**
 * Fetch monthly average availability trend.
 */
export async function fetchAvailabilityTrend(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<AvailabilityTrendPoint[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  const rows = await prisma.$queryRaw<AvailTrendRow[]>`
    SELECT
      date_trunc('month', date) AS month_start,
      AVG("availabilityPct") AS avg_availability,
      COUNT(DISTINCT "turbineId") AS turbine_count
    FROM scada_availability
    WHERE "tenantId" = ${tenantId}
      AND "periodType" = 'MONTHLY'
      AND ${buildTurbineIdFilter(turbineIds)}
      AND date >= ${from}
      AND date < ${to}
    GROUP BY date_trunc('month', date)
    ORDER BY month_start
  `;

  return rows.map((r) => {
    const d = new Date(r.month_start);
    return {
      month: d.getUTCMonth() + 1,
      year: d.getUTCFullYear(),
      label: monthLabel(d.getUTCMonth() + 1),
      avgAvailability: round(safeNumber(r.avg_availability), 2),
      turbineCount: Number(r.turbine_count),
    };
  });
}

// --- Availability Heatmap ---

interface AvailHeatmapRow {
  turbineId: string;
  month_start: Date;
  avg_avail: Prisma.Decimal | null;
}

/**
 * Fetch monthly availability per turbine for heatmap.
 */
export async function fetchAvailabilityHeatmap(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<HeatmapData[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  const rows = await prisma.$queryRaw<AvailHeatmapRow[]>`
    SELECT
      "turbineId",
      date_trunc('month', date) AS month_start,
      AVG("availabilityPct") AS avg_avail
    FROM scada_availability
    WHERE "tenantId" = ${tenantId}
      AND "periodType" = 'MONTHLY'
      AND ${buildTurbineIdFilter(turbineIds)}
      AND date >= ${from}
      AND date < ${to}
    GROUP BY "turbineId", date_trunc('month', date)
    ORDER BY "turbineId", month_start
  `;

  // Group by turbine
  const grouped = new Map<string, HeatmapCell[]>();
  for (const r of rows) {
    const val = safeNumber(r.avg_avail);
    const d = new Date(r.month_start);
    const cell: HeatmapCell = {
      month: d.getUTCMonth() + 1,
      year: d.getUTCFullYear(),
      value: round(val, 2),
      normalized: round(val / 100, 3), // availability is already 0-100%
    };
    const arr = grouped.get(r.turbineId) || [];
    arr.push(cell);
    grouped.set(r.turbineId, arr);
  }

  return turbines.map((t) => ({
    turbineId: t.id,
    designation: t.designation,
    months: grouped.get(t.id) || [],
  }));
}

// --- Downtime Pareto ---

/**
 * Fetch downtime pareto (T2-T6 categories sorted by total duration).
 */
export async function fetchDowntimePareto(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<ParetoItem[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  // Aggregate all T categories across all turbines
  const rows = await prisma.$queryRaw<AvailRow[]>`
    SELECT
      'fleet' AS "turbineId",
      SUM(t1)::bigint AS t1_total,
      SUM(t2)::bigint AS t2_total,
      SUM(t3)::bigint AS t3_total,
      SUM(t4)::bigint AS t4_total,
      SUM(t5)::bigint AS t5_total,
      SUM(t6)::bigint AS t6_total,
      SUM("t5_1")::bigint AS t5_1_total,
      SUM("t5_2")::bigint AS t5_2_total,
      SUM("t5_3")::bigint AS t5_3_total
    FROM scada_availability
    WHERE "tenantId" = ${tenantId}
      AND "periodType" = 'MONTHLY'
      AND ${buildTurbineIdFilter(turbineIds)}
      AND date >= ${from}
      AND date < ${to}
  `;

  if (rows.length === 0) return [];

  const r = rows[0];
  const categories = [
    { category: "t2", label: "Windstille", seconds: Number(r.t2_total) },
    { category: "t3", label: "Umweltstopp", seconds: Number(r.t3_total) },
    { category: "t4", label: "Wartung", seconds: Number(r.t4_total) },
    { category: "t5", label: "Störung", seconds: Number(r.t5_total) },
    { category: "t6", label: "Sonstige", seconds: Number(r.t6_total) },
  ].sort((a, b) => b.seconds - a.seconds);

  const totalDowntime = categories.reduce((s, c) => s + c.seconds, 0);
  let cumulative = 0;

  return categories.map((c) => {
    const pct = totalDowntime > 0 ? round((c.seconds / totalDowntime) * 100, 1) : 0;
    cumulative += pct;
    return {
      category: c.category,
      label: c.label,
      totalSeconds: c.seconds,
      percentage: pct,
      cumulative: round(cumulative, 1),
    };
  });
}

// =============================================================================
// Turbine Comparison Module Fetchers
// =============================================================================

interface ComparisonProductionRow {
  turbineId: string;
  production_kwh: Prisma.Decimal | null;
  avg_wind_speed: Prisma.Decimal | null;
  avg_power_kw: Prisma.Decimal | null;
  data_points: bigint;
}

interface PowerCurveRow {
  turbineId: string;
  wind_bin: Prisma.Decimal;
  avg_power_kw: Prisma.Decimal;
  sample_count: bigint;
}

/**
 * Fetch turbine comparison data: ranked comparison entries + power curve overlays.
 */
export async function fetchTurbineComparison(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<TurbineComparisonResponse> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) {
    return { comparison: [], powerCurves: [] };
  }

  const turbineMap = buildTurbineMap(turbines);
  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);
  const hours = hoursInPeriod(from, to);

  // Suppress unused variable lint (turbineMap used for potential future lookups)
  void turbineMap;

  // --- Comparison query (same base as fetchPerformanceKpis + avgPowerKw) ---
  const rows = await prisma.$queryRaw<ComparisonProductionRow[]>`
    SELECT
      "turbineId",
      SUM("powerW" * 10.0 / 60.0 / 1000.0) AS production_kwh,
      AVG("windSpeedMs") AS avg_wind_speed,
      AVG("powerW") / 1000.0 AS avg_power_kw,
      COUNT(*) AS data_points
    FROM scada_measurements
    WHERE "tenantId" = ${tenantId}
      AND "sourceFile" = 'WSD'
      AND "powerW" IS NOT NULL
      AND ${buildTurbineIdFilter(turbineIds)}
      AND "timestamp" >= ${from}
      AND "timestamp" < ${to}
    GROUP BY "turbineId"
  `;

  const rowMap = new Map(rows.map((r) => [r.turbineId, r]));

  // Build entries with capacity factor
  const entries: TurbineComparisonEntry[] = turbines.map((t) => {
    const row = rowMap.get(t.id);
    const productionKwh = safeNumber(row?.production_kwh);
    const capacityFactor =
      t.ratedPowerKw > 0 && hours > 0
        ? round((productionKwh / (t.ratedPowerKw * hours)) * 100, 2)
        : 0;
    const specificYield =
      t.ratedPowerKw > 0 ? round(productionKwh / t.ratedPowerKw, 1) : 0;

    return {
      turbineId: t.id,
      designation: t.designation,
      parkName: t.parkName,
      ratedPowerKw: t.ratedPowerKw,
      productionKwh: round(productionKwh, 1),
      capacityFactor,
      specificYield,
      avgWindSpeed:
        row?.avg_wind_speed != null
          ? round(safeNumber(row.avg_wind_speed), 2)
          : null,
      avgPowerKw: round(safeNumber(row?.avg_power_kw), 2),
      deviationFromFleetPct: 0, // calculated below
      rank: 0, // assigned below
    };
  });

  // Calculate fleet average CF for deviation
  const cfValues = entries.filter((e) => e.capacityFactor > 0);
  const fleetAvgCf =
    cfValues.length > 0
      ? cfValues.reduce((s, e) => s + e.capacityFactor, 0) / cfValues.length
      : 0;

  // Calculate deviation from fleet average and sort by CF desc
  for (const entry of entries) {
    entry.deviationFromFleetPct =
      fleetAvgCf > 0
        ? round(((entry.capacityFactor - fleetAvgCf) / fleetAvgCf) * 100, 2)
        : 0;
  }

  entries.sort((a, b) => b.capacityFactor - a.capacityFactor);
  entries.forEach((e, i) => {
    e.rank = i + 1;
  });

  // --- Power Curve query (0.5 m/s bins) ---
  const curveRows = await prisma.$queryRaw<PowerCurveRow[]>`
    SELECT
      "turbineId",
      ROUND("windSpeedMs"::numeric * 2, 0) / 2.0 AS wind_bin,
      AVG("powerW") / 1000.0 AS avg_power_kw,
      COUNT(*) AS sample_count
    FROM scada_measurements
    WHERE "tenantId" = ${tenantId}
      AND "sourceFile" = 'WSD'
      AND "windSpeedMs" IS NOT NULL
      AND "powerW" IS NOT NULL
      AND "windSpeedMs" > 0
      AND ${buildTurbineIdFilter(turbineIds)}
      AND "timestamp" >= ${from}
      AND "timestamp" < ${to}
    GROUP BY "turbineId", ROUND("windSpeedMs"::numeric * 2, 0) / 2.0
    HAVING COUNT(*) >= 3
    ORDER BY "turbineId", wind_bin
  `;

  // Group power curve data by turbine
  const curveMap = new Map<string, PowerCurvePoint[]>();
  for (const r of curveRows) {
    const points = curveMap.get(r.turbineId) || [];
    points.push({
      windSpeed: safeNumber(r.wind_bin),
      avgPowerKw: round(safeNumber(r.avg_power_kw), 2),
    });
    curveMap.set(r.turbineId, points);
  }

  const powerCurves = turbines
    .filter((t) => curveMap.has(t.id))
    .map((t) => ({
      turbineId: t.id,
      designation: t.designation,
      curve: curveMap.get(t.id)!,
    }));

  return { comparison: entries, powerCurves };
}

// =============================================================================
// Faults & Warnings Module Fetchers
// =============================================================================

// --- Fault Pareto (state/subState breakdown) ---

interface FaultParetoRow {
  state: number;
  subState: number;
  isFault: boolean;
  total_frequency: bigint;
  total_duration: bigint;
}

/**
 * Fetch top-20 SCADA states by total duration for Pareto analysis.
 * Excludes state 0 (normal operation).
 */
export async function fetchFaultPareto(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<FaultParetoItem[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  const rows = await prisma.$queryRaw<FaultParetoRow[]>`
    SELECT
      state,
      "subState",
      "isFault",
      SUM(frequency)::bigint AS total_frequency,
      SUM(duration)::bigint AS total_duration
    FROM scada_state_summaries
    WHERE "tenantId" = ${tenantId}
      AND ${buildTurbineIdFilter(turbineIds)}
      AND date >= ${from}
      AND date < ${to}
      AND state > 0
    GROUP BY state, "subState", "isFault"
    ORDER BY total_duration DESC
    LIMIT 20
  `;

  if (rows.length === 0) return [];

  const totalDuration = rows.reduce((s, r) => s + Number(r.total_duration), 0);
  let cumulative = 0;

  return rows.map((r) => {
    const duration = Number(r.total_duration);
    const pct = totalDuration > 0 ? round((duration / totalDuration) * 100, 1) : 0;
    cumulative += pct;
    const label = `Zustand ${r.state}.${r.subState}${r.isFault ? " (Störung)" : ""}`;

    return {
      state: r.state,
      subState: r.subState,
      isFault: r.isFault,
      label,
      totalFrequency: Number(r.total_frequency),
      totalDurationSeconds: duration,
      percentage: pct,
      cumulative: round(cumulative, 1),
    };
  });
}

// --- Warning Trend (monthly) ---

interface WarningTrendRow {
  month_start: Date;
  total_frequency: bigint;
  total_duration: bigint;
}

/**
 * Fetch monthly warning frequency and duration trend.
 */
export async function fetchWarningTrend(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<WarningTrendPoint[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  const rows = await prisma.$queryRaw<WarningTrendRow[]>`
    SELECT
      date_trunc('month', date) AS month_start,
      SUM(frequency)::bigint AS total_frequency,
      SUM(duration)::bigint AS total_duration
    FROM scada_warning_summaries
    WHERE "tenantId" = ${tenantId}
      AND ${buildTurbineIdFilter(turbineIds)}
      AND date >= ${from}
      AND date < ${to}
    GROUP BY date_trunc('month', date)
    ORDER BY month_start
  `;

  return rows.map((r) => {
    const d = new Date(r.month_start);
    return {
      month: d.getUTCMonth() + 1,
      year: d.getUTCFullYear(),
      label: monthLabel(d.getUTCMonth() + 1),
      totalFrequency: Number(r.total_frequency),
      totalDurationSeconds: Number(r.total_duration),
    };
  });
}

// --- Faults per Turbine ---

interface FaultPerTurbineRow {
  turbineId: string;
  fault_duration: bigint;
  fault_count: bigint;
}

interface FleetAvgPowerRow {
  avg_power_kw: Prisma.Decimal | null;
}

/**
 * Fetch fault duration/count per turbine, with estimated production loss.
 * Production loss = fault_duration_hours * fleet_average_power_kw.
 */
export async function fetchFaultPerTurbine(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<Array<{
  turbineId: string;
  designation: string;
  totalFaultDuration: number;
  totalFaultCount: number;
  productionLossEstimateKwh: number;
}>> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineMap = buildTurbineMap(turbines);
  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  // Fetch fault data and fleet average power in parallel
  const [faultRows, avgPowerRows] = await Promise.all([
    prisma.$queryRaw<FaultPerTurbineRow[]>`
      SELECT
        "turbineId",
        SUM(duration)::bigint AS fault_duration,
        SUM(frequency)::bigint AS fault_count
      FROM scada_state_summaries
      WHERE "tenantId" = ${tenantId}
        AND "isFault" = true
        AND ${buildTurbineIdFilter(turbineIds)}
        AND date >= ${from}
        AND date < ${to}
      GROUP BY "turbineId"
    `,
    prisma.$queryRaw<FleetAvgPowerRow[]>`
      SELECT
        AVG("powerW") / 1000.0 AS avg_power_kw
      FROM scada_measurements
      WHERE "tenantId" = ${tenantId}
        AND "sourceFile" = 'WSD'
        AND "powerW" IS NOT NULL
        AND "powerW" > 0
        AND ${buildTurbineIdFilter(turbineIds)}
        AND "timestamp" >= ${from}
        AND "timestamp" < ${to}
    `,
  ]);

  const fleetAvgPowerKw = avgPowerRows.length > 0
    ? safeNumber(avgPowerRows[0].avg_power_kw)
    : 0;

  const faultMap = new Map(
    faultRows.map((r) => [r.turbineId, r])
  );

  return turbines.map((t) => {
    const row = faultMap.get(t.id);
    const faultDuration = Number(row?.fault_duration ?? 0);
    const faultCount = Number(row?.fault_count ?? 0);
    const faultDurationHours = faultDuration / 3600;
    const lossKwh = round(faultDurationHours * fleetAvgPowerKw, 1);

    return {
      turbineId: t.id,
      designation: turbineMap.get(t.id)?.designation ?? t.designation,
      totalFaultDuration: faultDuration,
      totalFaultCount: faultCount,
      productionLossEstimateKwh: lossKwh,
    };
  });
}

// =============================================================================
// Financial Module Fetchers
// =============================================================================

/**
 * Fetch monthly revenue data from EnergySettlement for a given year.
 * Groups by month when multiple parks contribute, and calculates revenuePerKwh.
 */
export async function fetchMonthlyRevenue(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<MonthlyRevenuePoint[]> {
  // Use DB-level aggregation instead of loading all rows into memory
  const grouped = await prisma.energySettlement.groupBy({
    by: ["month"],
    where: {
      tenantId,
      year,
      ...(parkId && parkId !== "all" ? { parkId } : {}),
      month: { not: null },
      status: { in: ["CALCULATED", "INVOICED", "CLOSED"] },
    },
    _sum: {
      netOperatorRevenueEur: true,
      totalProductionKwh: true,
    },
    orderBy: { month: "asc" },
  });

  return grouped.map((g) => {
    const m = g.month!;
    const revenueEur = round(safeNumber(g._sum.netOperatorRevenueEur), 2);
    const productionKwh = round(safeNumber(g._sum.totalProductionKwh), 3);

    return {
      month: m,
      year,
      label: monthLabel(m),
      revenueEur,
      productionKwh,
      revenuePerKwh:
        productionKwh > 0
          ? round(revenueEur / productionKwh, 4)
          : null,
    };
  });
}

// --- Lost Revenue Estimation ---

interface FaultSecondsRow {
  total_fault_seconds: bigint;
}

/**
 * Estimate lost revenue due to turbine faults (T5 downtime).
 * Combines SCADA availability data with EnergySettlement revenue data.
 */
export async function fetchLostRevenue(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<{ totalLostKwh: number; estimatedLostEur: number; avgRevenuePerKwh: number | null }> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) {
    return { totalLostKwh: 0, estimatedLostEur: 0, avgRevenuePerKwh: null };
  }

  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);
  const hours = hoursInPeriod(from, to);

  // 1. Get total fault hours from scada_availability (T5 = Störung)
  const faultRows = await prisma.$queryRaw<FaultSecondsRow[]>`
    SELECT SUM(t5)::bigint AS total_fault_seconds
    FROM scada_availability
    WHERE "tenantId" = ${tenantId}
      AND "periodType" = 'MONTHLY'
      AND ${buildTurbineIdFilter(turbineIds)}
      AND date >= ${from}
      AND date < ${to}
  `;
  const totalFaultSeconds = Number(faultRows[0]?.total_fault_seconds ?? 0);
  const faultHours = totalFaultSeconds / 3600;

  // 2. Get total production and revenue from EnergySettlement
  const settlementAgg = await prisma.energySettlement.aggregate({
    where: {
      tenantId,
      year,
      ...(parkId && parkId !== "all" ? { parkId } : {}),
      status: { in: ["CALCULATED", "INVOICED", "CLOSED"] },
    },
    _sum: {
      netOperatorRevenueEur: true,
      totalProductionKwh: true,
    },
  });

  const totalRevenueEur = safeNumber(settlementAgg._sum.netOperatorRevenueEur);
  const totalProductionKwh = safeNumber(settlementAgg._sum.totalProductionKwh);

  // 3. Calculate average power per hour from settlement production / total hours
  const avgPowerPerHour = hours > 0 ? totalProductionKwh / hours : 0;

  // 4. Calculate avg revenue per kWh
  const avgRevenuePerKwh =
    totalProductionKwh > 0 ? totalRevenueEur / totalProductionKwh : null;

  // 5. Estimate lost production and revenue
  const totalLostKwh = round(faultHours * avgPowerPerHour, 1);
  const estimatedLostEur =
    avgRevenuePerKwh != null ? round(totalLostKwh * avgRevenuePerKwh, 2) : 0;

  return {
    totalLostKwh,
    estimatedLostEur,
    avgRevenuePerKwh: avgRevenuePerKwh != null ? round(avgRevenuePerKwh, 4) : null,
  };
}

// --- Financial Summary ---

/**
 * Fetch aggregated financial summary from EnergySettlement.
 */
export async function fetchFinancialSummary(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<{ totalRevenueEur: number; totalProductionKwh: number; avgRevenuePerKwh: number | null }> {
  const result = await prisma.energySettlement.aggregate({
    where: {
      tenantId,
      year,
      ...(parkId && parkId !== "all" ? { parkId } : {}),
      status: { in: ["CALCULATED", "INVOICED", "CLOSED"] },
    },
    _sum: {
      netOperatorRevenueEur: true,
      totalProductionKwh: true,
    },
  });

  const totalRevenueEur = round(safeNumber(result._sum.netOperatorRevenueEur), 2);
  const totalProductionKwh = round(safeNumber(result._sum.totalProductionKwh), 3);
  const avgRevenuePerKwh =
    totalProductionKwh > 0
      ? round(totalRevenueEur / totalProductionKwh, 4)
      : null;

  return { totalRevenueEur, totalProductionKwh, avgRevenuePerKwh };
}

// =============================================================================
// Environment Module Fetchers
// =============================================================================

// --- Wind Distribution ---

interface WindDistRow {
  wind_bin: number;
  cnt: bigint;
}

/**
 * Fetch wind speed distribution histogram from pre-aggregated daily summaries.
 * Returns bins 0-30 m/s with count and percentage.
 */
export async function fetchWindDistribution(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<WindDistributionBin[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  const rows = await prisma.$queryRaw<WindDistRow[]>`
    SELECT
      FLOOR("meanWindSpeed"::numeric)::int AS wind_bin,
      COUNT(*) AS cnt
    FROM scada_wind_summaries
    WHERE "tenantId" = ${tenantId}
      AND "periodType" = 'DAILY'
      AND "meanWindSpeed" IS NOT NULL
      AND ${buildTurbineIdFilter(turbineIds)}
      AND date >= ${from}
      AND date < ${to}
    GROUP BY FLOOR("meanWindSpeed"::numeric)
    ORDER BY wind_bin
  `;

  const totalCount = rows.reduce((s, r) => s + Number(r.cnt), 0);

  return rows.map((r) => ({
    windSpeedBin: Number(r.wind_bin),
    count: Number(r.cnt),
    percentage: totalCount > 0 ? round((Number(r.cnt) / totalCount) * 100, 2) : 0,
  }));
}

// --- Seasonal Patterns ---

interface SeasonalRow {
  month_num: number;
  avg_wind: Prisma.Decimal | null;
  avg_power: Prisma.Decimal | null;
  avg_pressure: Prisma.Decimal | null;
  avg_humidity: Prisma.Decimal | null;
  avg_rain: Prisma.Decimal | null;
}

/**
 * Fetch monthly seasonal patterns from pre-aggregated monthly summaries.
 * Returns avg wind speed, power, air pressure, humidity, and rain per month.
 */
export async function fetchSeasonalPatterns(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<SeasonalPatternPoint[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  const rows = await prisma.$queryRaw<SeasonalRow[]>`
    SELECT
      EXTRACT(MONTH FROM date)::int AS month_num,
      AVG("meanWindSpeed") AS avg_wind,
      AVG("meanPowerKw") AS avg_power,
      AVG("meanAirPressure") AS avg_pressure,
      AVG("meanAirHumidity") AS avg_humidity,
      AVG("meanRain") AS avg_rain
    FROM scada_wind_summaries
    WHERE "tenantId" = ${tenantId}
      AND "periodType" = 'MONTHLY'
      AND ${buildTurbineIdFilter(turbineIds)}
      AND date >= ${from}
      AND date < ${to}
    GROUP BY EXTRACT(MONTH FROM date)
    ORDER BY month_num
  `;

  return rows.map((r) => ({
    month: r.month_num,
    label: monthLabel(r.month_num),
    avgWindSpeed: round(safeNumber(r.avg_wind), 2),
    avgPowerKw: round(safeNumber(r.avg_power), 2),
    avgAirPressure: r.avg_pressure != null ? round(safeNumber(r.avg_pressure), 1) : null,
    avgHumidity: r.avg_humidity != null ? round(safeNumber(r.avg_humidity), 1) : null,
    avgRain: r.avg_rain != null ? round(safeNumber(r.avg_rain), 2) : null,
  }));
}

// --- Direction Efficiency ---

interface DirectionRow {
  direction: string;
  avg_power: Prisma.Decimal | null;
  avg_wind: Prisma.Decimal | null;
  cnt: bigint;
}

const DIRECTION_DEG_MAP: Record<string, number> = {
  N: 0,
  NO: 45,
  O: 90,
  SO: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};

/**
 * Fetch wind direction vs. power efficiency from daily summaries.
 * Returns average power and wind speed per compass direction (8 segments).
 */
export async function fetchDirectionEfficiency(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<DirectionEfficiency[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  const rows = await prisma.$queryRaw<DirectionRow[]>`
    SELECT
      CASE
        WHEN "meanWindDirection" IS NULL THEN 'N/A'
        WHEN "meanWindDirection"::numeric >= 337.5 OR "meanWindDirection"::numeric < 22.5 THEN 'N'
        WHEN "meanWindDirection"::numeric >= 22.5 AND "meanWindDirection"::numeric < 67.5 THEN 'NO'
        WHEN "meanWindDirection"::numeric >= 67.5 AND "meanWindDirection"::numeric < 112.5 THEN 'O'
        WHEN "meanWindDirection"::numeric >= 112.5 AND "meanWindDirection"::numeric < 157.5 THEN 'SO'
        WHEN "meanWindDirection"::numeric >= 157.5 AND "meanWindDirection"::numeric < 202.5 THEN 'S'
        WHEN "meanWindDirection"::numeric >= 202.5 AND "meanWindDirection"::numeric < 247.5 THEN 'SW'
        WHEN "meanWindDirection"::numeric >= 247.5 AND "meanWindDirection"::numeric < 292.5 THEN 'W'
        ELSE 'NW'
      END AS direction,
      AVG("meanPowerKw") AS avg_power,
      AVG("meanWindSpeed") AS avg_wind,
      COUNT(*) AS cnt
    FROM scada_wind_summaries
    WHERE "tenantId" = ${tenantId}
      AND "periodType" = 'DAILY'
      AND "meanWindDirection" IS NOT NULL
      AND ${buildTurbineIdFilter(turbineIds)}
      AND date >= ${from}
      AND date < ${to}
    GROUP BY direction
    ORDER BY direction
  `;

  // Filter out N/A and map to typed objects, sorted by direction degrees
  return rows
    .filter((r) => r.direction !== "N/A")
    .map((r) => ({
      direction: r.direction,
      directionDeg: DIRECTION_DEG_MAP[r.direction] ?? 0,
      avgPowerKw: round(safeNumber(r.avg_power), 2),
      avgWindSpeed: round(safeNumber(r.avg_wind), 2),
      count: Number(r.cnt),
    }))
    .sort((a, b) => a.directionDeg - b.directionDeg);
}

// =============================================================================
// Shadow Casting Module Fetchers
// =============================================================================

// --- Shadow Per Turbine ---

interface ShadowCumRow {
  turbineId: string;
  total_shadow_h: Prisma.Decimal | null;
  avg_daily_shadow: Prisma.Decimal | null;
}

/**
 * Fetch shadow casting hours per turbine for a given year.
 * Uses daily cumulative counter differences (max-min per day) to handle
 * counter resets gracefully, and averages meanShadow for daily shadow minutes.
 */
export async function fetchShadowPerTurbine(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<ShadowPerTurbine[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineMap = buildTurbineMap(turbines);
  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  // Calculate daily deltas first, then sum — handles counter resets
  const rows = await prisma.$queryRaw<ShadowCumRow[]>`
    SELECT
      "turbineId",
      SUM(daily_delta) AS total_shadow_h,
      AVG(avg_daily_shadow) AS avg_daily_shadow
    FROM (
      SELECT
        "turbineId",
        date_trunc('day', "timestamp") AS day,
        GREATEST(MAX("setCumShadowH") - MIN("setCumShadowH"), 0) AS daily_delta,
        AVG("meanShadow") AS avg_daily_shadow
      FROM scada_shadow_casting
      WHERE "tenantId" = ${tenantId}
        AND ${buildTurbineIdFilter(turbineIds)}
        AND "timestamp" >= ${from}
        AND "timestamp" < ${to}
        AND "setCumShadowH" IS NOT NULL
      GROUP BY "turbineId", date_trunc('day', "timestamp")
    ) daily
    GROUP BY "turbineId"
  `;

  const rowMap = new Map(rows.map((r) => [r.turbineId, r]));

  return turbines.map((t) => {
    const row = rowMap.get(t.id);
    const totalShadowHoursYear = round(safeNumber(row?.total_shadow_h), 2);
    const avgDailyShadowMinutes = round(safeNumber(row?.avg_daily_shadow), 2);

    return {
      turbineId: t.id,
      designation: turbineMap.get(t.id)?.designation ?? t.designation,
      totalShadowHoursYear: Math.max(totalShadowHoursYear, 0),
      avgDailyShadowMinutes,
    };
  });
}

// --- Shadow Monthly Trend ---

interface ShadowMonthRow {
  month_num: number;
  shadow_minutes: bigint;
}

/**
 * Fetch monthly shadow trend: count of 1-minute intervals where shadow is active.
 * Each WDD record with meanShadow > 0 represents 1 active minute.
 */
export async function fetchShadowMonthlyTrend(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<ShadowMonthlyTrend[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  const rows = await prisma.$queryRaw<ShadowMonthRow[]>`
    SELECT
      EXTRACT(MONTH FROM "timestamp")::int AS month_num,
      COUNT(*)::bigint AS shadow_minutes
    FROM scada_shadow_casting
    WHERE "tenantId" = ${tenantId}
      AND ${buildTurbineIdFilter(turbineIds)}
      AND "timestamp" >= ${from}
      AND "timestamp" < ${to}
      AND "meanShadow" IS NOT NULL
      AND "meanShadow" > 0
    GROUP BY EXTRACT(MONTH FROM "timestamp")
    ORDER BY month_num
  `;

  return rows.map((r) => ({
    month: r.month_num,
    label: monthLabel(r.month_num),
    shadowMinutes: Number(r.shadow_minutes),
  }));
}

// --- Shadow Daily Profile ---

interface ShadowHourRow {
  hour: number;
  shadow_minutes: bigint;
}

/**
 * Fetch shadow daily profile: average shadow by hour of day (0-23).
 * Counts records with meanShadow > 0 grouped by hour.
 */
export async function fetchShadowDailyProfile(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<ShadowDailyProfile[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  const rows = await prisma.$queryRaw<ShadowHourRow[]>`
    SELECT
      EXTRACT(HOUR FROM "timestamp")::int AS hour,
      COUNT(*)::bigint AS shadow_minutes
    FROM scada_shadow_casting
    WHERE "tenantId" = ${tenantId}
      AND ${buildTurbineIdFilter(turbineIds)}
      AND "timestamp" >= ${from}
      AND "timestamp" < ${to}
      AND "meanShadow" IS NOT NULL
      AND "meanShadow" > 0
    GROUP BY EXTRACT(HOUR FROM "timestamp")
    ORDER BY hour
  `;

  return rows.map((r) => ({
    hour: r.hour,
    shadowMinutes: Number(r.shadow_minutes),
  }));
}

// =============================================================================
// Operating States Module Fetchers
// =============================================================================

// --- State Pareto ---

interface StateKvRow {
  state_code: string;
  total_duration: bigint;
  total_frequency: bigint;
}

/**
 * Fetch top-20 operating state codes by total duration (Pareto analysis).
 * Extracts JSON keys/values from the `states` column.
 */
export async function fetchOperatingStatePareto(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<OperatingStateParetoItem[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  const rows = await prisma.$queryRaw<StateKvRow[]>`
    SELECT
      kv.key AS state_code,
      SUM(kv.value::numeric)::bigint AS total_duration,
      COUNT(CASE WHEN kv.value::numeric > 0 THEN 1 END)::bigint AS total_frequency
    FROM scada_operating_states,
         jsonb_each_text(states::jsonb) AS kv(key, value)
    WHERE "tenantId" = ${tenantId}
      AND ${buildTurbineIdFilter(turbineIds)}
      AND "timestamp" >= ${from}
      AND "timestamp" < ${to}
      AND states IS NOT NULL
      AND jsonb_typeof(states::jsonb) = 'object'
    GROUP BY kv.key
    ORDER BY total_duration DESC
    LIMIT 20
  `;

  if (rows.length === 0) return [];

  const totalDuration = rows.reduce((s, r) => s + Number(r.total_duration), 0);
  let cumulative = 0;

  return rows.map((r) => {
    const duration = Number(r.total_duration);
    const pct = totalDuration > 0 ? round((duration / totalDuration) * 100, 1) : 0;
    cumulative += pct;

    return {
      stateCode: r.state_code,
      totalDurationSeconds: duration,
      totalFrequency: Number(r.total_frequency),
      percentage: pct,
      cumulative: round(cumulative, 1),
    };
  });
}

// --- Operating State Per Turbine ---

interface OpStatePerTurbineRow {
  turbineId: string;
  total_non_a0_duration: bigint;
  distinct_states: bigint;
}

/**
 * Fetch operating state duration per turbine (excluding A0 = normal operation).
 */
export async function fetchOperatingStatePerTurbine(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<OperatingStatePerTurbine[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineMap = buildTurbineMap(turbines);
  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  const rows = await prisma.$queryRaw<OpStatePerTurbineRow[]>`
    SELECT
      os."turbineId",
      SUM(CASE WHEN kv.key != 'A0' THEN kv.value::numeric ELSE 0 END)::bigint AS total_non_a0_duration,
      COUNT(DISTINCT CASE WHEN kv.value::numeric > 0 THEN kv.key END)::bigint AS distinct_states
    FROM scada_operating_states os,
         jsonb_each_text(os.states::jsonb) AS kv(key, value)
    WHERE os."tenantId" = ${tenantId}
      AND ${Prisma.sql`os."turbineId" IN (${Prisma.join(turbineIds)})`}
      AND os."timestamp" >= ${from}
      AND os."timestamp" < ${to}
      AND os.states IS NOT NULL
      AND jsonb_typeof(os.states::jsonb) = 'object'
    GROUP BY os."turbineId"
  `;

  const rowMap = new Map(rows.map((r) => [r.turbineId, r]));

  return turbines.map((t) => {
    const row = rowMap.get(t.id);
    return {
      turbineId: t.id,
      designation: turbineMap.get(t.id)?.designation ?? t.designation,
      totalNonA0DurationSeconds: Number(row?.total_non_a0_duration ?? 0),
      distinctStates: Number(row?.distinct_states ?? 0),
    };
  });
}

// --- Operating State Timeline ---

interface OpStateTimelineRow {
  day: Date;
  dominant_state: string;
  duration_seconds: bigint;
}

/**
 * Fetch daily dominant operating state timeline.
 * For each day, finds the state with the highest total duration.
 * If no turbineId filter, limits to last 90 days of data.
 */
export async function fetchOperatingStateTimeline(
  tenantId: string,
  year: number,
  parkId?: string | null,
  turbineId?: string | null
): Promise<OperatingStateTimelineEntry[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineIds = turbineId
    ? turbines.filter((t) => t.id === turbineId).map((t) => t.id)
    : turbines.map((t) => t.id);

  if (turbineIds.length === 0) return [];

  const { from, to } = buildDateRange(year);

  // If no specific turbine, limit to last 90 days for performance
  const limitClause = turbineId
    ? Prisma.sql``
    : Prisma.sql`LIMIT 90`;

  const rows = await prisma.$queryRaw<OpStateTimelineRow[]>`
    SELECT day, dominant_state, duration_seconds
    FROM (
      SELECT
        date_trunc('day', os."timestamp") AS day,
        kv.key AS dominant_state,
        SUM(kv.value::numeric)::bigint AS duration_seconds,
        ROW_NUMBER() OVER (PARTITION BY date_trunc('day', os."timestamp") ORDER BY SUM(kv.value::numeric) DESC) AS rn
      FROM scada_operating_states os,
           jsonb_each_text(os.states::jsonb) AS kv(key, value)
      WHERE os."tenantId" = ${tenantId}
        AND ${Prisma.sql`os."turbineId" IN (${Prisma.join(turbineIds)})`}
        AND os."timestamp" >= ${from}
        AND os."timestamp" < ${to}
        AND os.states IS NOT NULL
        AND jsonb_typeof(os.states::jsonb) = 'object'
      GROUP BY date_trunc('day', os."timestamp"), kv.key
    ) ranked
    WHERE rn = 1
    ORDER BY day DESC
    ${limitClause}
  `;

  return rows
    .map((r) => ({
      date: new Date(r.day).toISOString().slice(0, 10),
      dominantState: r.dominant_state,
      durationSeconds: Number(r.duration_seconds),
    }))
    .reverse(); // chronological order
}

// =============================================================================
// Phase Symmetry Module Fetchers
// =============================================================================

// --- Symmetry Trend (Monthly) ---

interface PhaseSymTrendRow {
  month: Date;
  avg_imbalance_kw: Prisma.Decimal | null;
  avg_phase_power_kw: Prisma.Decimal | null;
  data_points: bigint;
}

/**
 * Fetch monthly phase symmetry trend.
 * Calculates imbalance as (MAX(P1,P2,P3) - MIN(P1,P2,P3)) averaged monthly,
 * and imbalance percent relative to average phase power.
 */
export async function fetchPhaseSymmetryTrend(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<PhaseSymmetryTrendPoint[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  const rows = await prisma.$queryRaw<PhaseSymTrendRow[]>`
    SELECT
      date_trunc('month', "timestamp") AS month,
      AVG(GREATEST(COALESCE("meanP1",0),COALESCE("meanP2",0),COALESCE("meanP3",0)) - LEAST(COALESCE("meanP1",0),COALESCE("meanP2",0),COALESCE("meanP3",0))) AS avg_imbalance_kw,
      AVG((COALESCE("meanP1",0)+COALESCE("meanP2",0)+COALESCE("meanP3",0))/3.0) AS avg_phase_power_kw,
      COUNT(*) AS data_points
    FROM scada_electrical_phases
    WHERE "tenantId" = ${tenantId}
      AND ${buildTurbineIdFilter(turbineIds)}
      AND "timestamp" >= ${from}
      AND "timestamp" < ${to}
      AND "periodType" = 'INTERVAL'
      AND ("meanP1" IS NOT NULL OR "meanP2" IS NOT NULL OR "meanP3" IS NOT NULL)
    GROUP BY date_trunc('month', "timestamp")
    ORDER BY month
  `;

  return rows.map((r) => {
    const d = new Date(r.month);
    const avgImbalanceKw = round(Math.max(safeNumber(r.avg_imbalance_kw), 0), 2);
    const avgPhasePowerKw = round(safeNumber(r.avg_phase_power_kw), 2);
    const avgImbalancePct =
      avgPhasePowerKw > 0
        ? round((avgImbalanceKw / avgPhasePowerKw) * 100, 2)
        : 0;

    return {
      month: d.getUTCMonth() + 1,
      year: d.getUTCFullYear(),
      label: monthLabel(d.getUTCMonth() + 1),
      avgImbalanceKw,
      avgImbalancePct,
      avgPhasePowerKw,
    };
  });
}

// --- Phase Symmetry Per Turbine ---

interface PhaseSymPerTurbineRow {
  turbineId: string;
  avg_imbalance_kw: Prisma.Decimal | null;
  avg_phase_power_kw: Prisma.Decimal | null;
  avg_reactive_power: Prisma.Decimal | null;
  data_points: bigint;
}

/**
 * Fetch per-turbine phase imbalance and reactive power metrics.
 */
export async function fetchPhaseSymmetryPerTurbine(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<PhaseSymmetryPerTurbine[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineMap = buildTurbineMap(turbines);
  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  const rows = await prisma.$queryRaw<PhaseSymPerTurbineRow[]>`
    SELECT
      "turbineId",
      AVG(GREATEST(COALESCE("meanP1",0),COALESCE("meanP2",0),COALESCE("meanP3",0)) - LEAST(COALESCE("meanP1",0),COALESCE("meanP2",0),COALESCE("meanP3",0))) AS avg_imbalance_kw,
      AVG((COALESCE("meanP1",0)+COALESCE("meanP2",0)+COALESCE("meanP3",0))/3.0) AS avg_phase_power_kw,
      AVG(COALESCE("meanQ1",0) + COALESCE("meanQ2",0) + COALESCE("meanQ3",0)) AS avg_reactive_power,
      COUNT(*) AS data_points
    FROM scada_electrical_phases
    WHERE "tenantId" = ${tenantId}
      AND ${buildTurbineIdFilter(turbineIds)}
      AND "timestamp" >= ${from}
      AND "timestamp" < ${to}
      AND "periodType" = 'INTERVAL'
      AND ("meanP1" IS NOT NULL OR "meanP2" IS NOT NULL OR "meanP3" IS NOT NULL)
    GROUP BY "turbineId"
  `;

  const rowMap = new Map(rows.map((r) => [r.turbineId, r]));

  return turbines.map((t) => {
    const row = rowMap.get(t.id);
    const avgImbalanceKw = safeNumber(row?.avg_imbalance_kw);
    const avgPhasePowerKw = safeNumber(row?.avg_phase_power_kw);
    const avgImbalancePct =
      avgPhasePowerKw > 0
        ? round((avgImbalanceKw / avgPhasePowerKw) * 100, 2)
        : 0;

    return {
      turbineId: t.id,
      designation: turbineMap.get(t.id)?.designation ?? t.designation,
      avgImbalancePct,
      avgReactivePowerKvar: round(safeNumber(row?.avg_reactive_power), 2),
      dataPoints: Number(row?.data_points ?? 0),
    };
  });
}

// --- Phase Powers Monthly ---

interface PhasePowerRow {
  month: Date;
  avg_p1: Prisma.Decimal | null;
  avg_p2: Prisma.Decimal | null;
  avg_p3: Prisma.Decimal | null;
}

/**
 * Fetch monthly average phase powers (P1, P2, P3) for comparison chart.
 */
export async function fetchPhasePowersMonthly(
  tenantId: string,
  year: number,
  parkId?: string | null
): Promise<PhasePowersMonthly[]> {
  const turbines = await loadTurbines(tenantId, parkId);
  if (turbines.length === 0) return [];

  const turbineIds = turbines.map((t) => t.id);
  const { from, to } = buildDateRange(year);

  const rows = await prisma.$queryRaw<PhasePowerRow[]>`
    SELECT
      date_trunc('month', "timestamp") AS month,
      AVG("meanP1") AS avg_p1,
      AVG("meanP2") AS avg_p2,
      AVG("meanP3") AS avg_p3
    FROM scada_electrical_phases
    WHERE "tenantId" = ${tenantId}
      AND ${buildTurbineIdFilter(turbineIds)}
      AND "timestamp" >= ${from}
      AND "timestamp" < ${to}
      AND "periodType" = 'INTERVAL'
      AND ("meanP1" IS NOT NULL OR "meanP2" IS NOT NULL OR "meanP3" IS NOT NULL)
    GROUP BY date_trunc('month', "timestamp")
    ORDER BY month
  `;

  return rows.map((r) => {
    const d = new Date(r.month);
    return {
      month: d.getUTCMonth() + 1,
      label: monthLabel(d.getUTCMonth() + 1),
      avgP1: round(safeNumber(r.avg_p1), 2),
      avgP2: round(safeNumber(r.avg_p2), 2),
      avgP3: round(safeNumber(r.avg_p3), 2),
    };
  });
}
