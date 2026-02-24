/**
 * SCADA Anomaly Detection Engine
 *
 * Statistical anomaly detection for wind turbine SCADA data.
 * Detects performance drops, availability issues, power curve deviations,
 * and data quality problems using SQL-based aggregation (no raw data in JS).
 *
 * All queries are tenant-scoped via tenantId.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { notifyAdmins } from "@/lib/notifications";
import { sendEmailAsync } from "@/lib/email";

// =============================================================================
// Types
// =============================================================================

export interface AnomalyResult {
  turbineId: string;
  turbineDesignation: string;
  parkName: string;
  type:
    | "PERFORMANCE_DROP"
    | "LOW_AVAILABILITY"
    | "CURVE_DEVIATION"
    | "DATA_QUALITY"
    | "EXTENDED_DOWNTIME";
  severity: "WARNING" | "CRITICAL";
  message: string;
  detectedAt: Date;
  details: Record<string, number | string>;
}

interface AnomalyConfig {
  enabled: boolean;
  performanceThreshold: number;
  availabilityThreshold: number;
  downtimeHoursThreshold: number;
  curveDeviationThreshold: number;
  dataQualityThreshold: number;
  notifyByEmail: boolean;
  notifyInApp: boolean;
}

interface TurbineInfo {
  id: string;
  designation: string;
  ratedPowerKw: number | null;
  parkName: string;
  parkId: string;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: AnomalyConfig = {
  enabled: true,
  performanceThreshold: 15,
  availabilityThreshold: 90,
  downtimeHoursThreshold: 24,
  curveDeviationThreshold: 20,
  dataQualityThreshold: 80,
  notifyByEmail: true,
  notifyInApp: true,
};

// Invalid SCADA measurement markers
const INVALID_VALUES = [32767, 65535, 6553.5];

// SCADA measurement interval in minutes
const INTERVAL_MINUTES = 10;
const INTERVALS_PER_HOUR = 60 / INTERVAL_MINUTES; // 6
const INTERVALS_PER_DAY = 24 * INTERVALS_PER_HOUR; // 144

// =============================================================================
// Config Helpers
// =============================================================================

/**
 * Load anomaly detection config for a tenant, or return defaults.
 */
async function getConfig(tenantId: string): Promise<AnomalyConfig> {
  const config = await prisma.scadaAnomalyConfig.findUnique({
    where: { tenantId },
  });

  if (!config) return DEFAULT_CONFIG;

  return {
    enabled: config.enabled,
    performanceThreshold: Number(config.performanceThreshold),
    availabilityThreshold: Number(config.availabilityThreshold),
    downtimeHoursThreshold: config.downtimeHoursThreshold,
    curveDeviationThreshold: Number(config.curveDeviationThreshold),
    dataQualityThreshold: Number(config.dataQualityThreshold),
    notifyByEmail: config.notifyByEmail,
    notifyInApp: config.notifyInApp,
  };
}

/**
 * Load turbine info (with park name) for given tenant, optionally filtered by parkId.
 */
async function getTurbines(
  tenantId: string,
  parkId?: string
): Promise<TurbineInfo[]> {
  const turbines = await prisma.turbine.findMany({
    where: {
      park: {
        tenantId,
        ...(parkId ? { id: parkId } : {}),
      },
      status: "ACTIVE",
    },
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
  });

  return turbines.map((t) => ({
    id: t.id,
    designation: t.designation,
    ratedPowerKw: t.ratedPowerKw ? Number(t.ratedPowerKw) : null,
    parkName: t.park.name,
    parkId: t.park.id,
  }));
}

// =============================================================================
// Detection: Performance Drop
// =============================================================================

/**
 * Compare 7-day capacity factor vs 30-day baseline.
 * Uses SQL aggregation to avoid loading raw measurement data.
 *
 * Capacity Factor = actual_energy / (rated_power * hours)
 * If CF_recent / CF_baseline < (1 - threshold), flag as anomaly.
 */
export async function checkPerformanceDrop(
  tenantId: string,
  turbineIds: string[],
  config?: AnomalyConfig
): Promise<AnomalyResult[]> {
  const cfg = config ?? (await getConfig(tenantId));
  const thresholdFraction = cfg.performanceThreshold / 100;
  const anomalies: AnomalyResult[] = [];

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const turbines = await getTurbines(tenantId);
  const turbineMap = new Map(turbines.map((t) => [t.id, t]));

  // Filter to requested turbine IDs
  const targetIds = turbineIds.length > 0
    ? turbineIds.filter((id) => turbineMap.has(id))
    : turbines.map((t) => t.id);

  if (targetIds.length === 0) return anomalies;

  // SQL: calculate avg power and avg wind speed for 7-day and 30-day windows per turbine
  // Using Prisma raw query for efficiency
  const results = await prisma.$queryRaw<
    Array<{
      turbineId: string;
      avg_power_7d: number | null;
      avg_wind_7d: number | null;
      count_7d: number;
      avg_power_30d: number | null;
      avg_wind_30d: number | null;
      count_30d: number;
    }>
  >`
    SELECT
      m."turbineId",
      AVG(CASE WHEN m."timestamp" >= ${sevenDaysAgo} THEN m."powerW"::float END) as avg_power_7d,
      AVG(CASE WHEN m."timestamp" >= ${sevenDaysAgo} THEN m."windSpeedMs"::float END) as avg_wind_7d,
      COUNT(CASE WHEN m."timestamp" >= ${sevenDaysAgo} AND m."powerW" IS NOT NULL THEN 1 END)::int as count_7d,
      AVG(CASE WHEN m."timestamp" >= ${thirtyDaysAgo} THEN m."powerW"::float END) as avg_power_30d,
      AVG(CASE WHEN m."timestamp" >= ${thirtyDaysAgo} THEN m."windSpeedMs"::float END) as avg_wind_30d,
      COUNT(CASE WHEN m."timestamp" >= ${thirtyDaysAgo} AND m."powerW" IS NOT NULL THEN 1 END)::int as count_30d
    FROM "scada_measurements" m
    WHERE m."tenantId" = ${tenantId}
      AND m."turbineId" IN (${Prisma.join(targetIds)})
      AND m."timestamp" >= ${thirtyDaysAgo}
      AND m."powerW" IS NOT NULL
      AND m."powerW" NOT IN (32767, 65535)
      AND m."windSpeedMs" IS NOT NULL
      AND m."windSpeedMs" NOT IN (32767, 65535)
    GROUP BY m."turbineId"
  `;

  for (const row of results) {
    const turbine = turbineMap.get(row.turbineId);
    if (!turbine) continue;

    // Need sufficient data in both windows
    if (!row.avg_power_30d || !row.avg_power_7d) continue;
    if (row.count_30d < INTERVALS_PER_DAY * 7 || row.count_7d < INTERVALS_PER_DAY) continue;

    const ratedPowerW = turbine.ratedPowerKw
      ? turbine.ratedPowerKw * 1000
      : null;

    let ratio: number;

    if (
      ratedPowerW &&
      row.avg_wind_7d &&
      row.avg_wind_30d &&
      row.avg_wind_30d > 0
    ) {
      // Capacity factor comparison (normalized by wind speed)
      const cf7d = row.avg_power_7d / ratedPowerW;
      const cf30d = row.avg_power_30d / ratedPowerW;

      if (cf30d <= 0) continue;
      ratio = cf7d / cf30d;
    } else {
      // Fallback: raw power comparison
      if (row.avg_power_30d <= 0) continue;
      ratio = row.avg_power_7d / row.avg_power_30d;
    }

    if (ratio < 1 - thresholdFraction) {
      const dropPercent = Math.round((1 - ratio) * 100);
      const severity = dropPercent >= cfg.performanceThreshold * 1.5
        ? "CRITICAL"
        : "WARNING";

      anomalies.push({
        turbineId: turbine.id,
        turbineDesignation: turbine.designation,
        parkName: turbine.parkName,
        type: "PERFORMANCE_DROP",
        severity,
        message: `Leistungsabfall von ${dropPercent}% erkannt. 7-Tage-Durchschnitt deutlich unter 30-Tage-Baseline.`,
        detectedAt: now,
        details: {
          avgPower7d: Math.round(row.avg_power_7d),
          avgPower30d: Math.round(row.avg_power_30d),
          dropPercent,
          dataPoints7d: row.count_7d,
          dataPoints30d: row.count_30d,
        },
      });
    }
  }

  return anomalies;
}

// =============================================================================
// Detection: Availability Alert
// =============================================================================

/**
 * Check availability from ScadaAvailability records.
 * Flags if:
 * - Daily availability < threshold (default 90%)
 * - T5 (equipment failure) time > 4 hours/day
 * - Consecutive downtime > threshold hours
 */
export async function checkAvailability(
  tenantId: string,
  turbineIds: string[],
  config?: AnomalyConfig
): Promise<AnomalyResult[]> {
  const cfg = config ?? (await getConfig(tenantId));
  const anomalies: AnomalyResult[] = [];
  const now = new Date();

  const turbines = await getTurbines(tenantId);
  const turbineMap = new Map(turbines.map((t) => [t.id, t]));

  const targetIds = turbineIds.length > 0
    ? turbineIds.filter((id) => turbineMap.has(id))
    : turbines.map((t) => t.id);

  if (targetIds.length === 0) return anomalies;

  // Check yesterday and today for availability
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  const availRecords = await prisma.scadaAvailability.findMany({
    where: {
      tenantId,
      turbineId: { in: targetIds },
      periodType: "DAILY",
      date: { gte: twoDaysAgo },
    },
    orderBy: { date: "desc" },
  });

  for (const record of availRecords) {
    const turbine = turbineMap.get(record.turbineId);
    if (!turbine) continue;

    const availPct = record.availabilityPct ? Number(record.availabilityPct) : null;
    const t5Hours = record.t5 / 3600; // seconds to hours

    // Low availability check
    if (availPct !== null && availPct < cfg.availabilityThreshold) {
      const severity = availPct < cfg.availabilityThreshold * 0.5
        ? "CRITICAL"
        : "WARNING";

      anomalies.push({
        turbineId: turbine.id,
        turbineDesignation: turbine.designation,
        parkName: turbine.parkName,
        type: "LOW_AVAILABILITY",
        severity,
        message: `Verfügbarkeit ${availPct.toFixed(1)}% liegt unter Schwellwert von ${cfg.availabilityThreshold}%.`,
        detectedAt: now,
        details: {
          availabilityPct: availPct,
          threshold: cfg.availabilityThreshold,
          t1Hours: Math.round(record.t1 / 3600 * 10) / 10,
          t5Hours: Math.round(t5Hours * 10) / 10,
        },
      });
    }

    // T5 (equipment failure) high duration check
    if (t5Hours >= 4) {
      const severity = t5Hours >= 12 ? "CRITICAL" : "WARNING";

      anomalies.push({
        turbineId: turbine.id,
        turbineDesignation: turbine.designation,
        parkName: turbine.parkName,
        type: "LOW_AVAILABILITY",
        severity,
        message: `Störungszeit (T5) von ${t5Hours.toFixed(1)} Stunden am ${record.date.toISOString().split("T")[0]}.`,
        detectedAt: now,
        details: {
          t5Hours: Math.round(t5Hours * 10) / 10,
          dateStr: record.date.toISOString().split("T")[0],
        },
      });
    }
  }

  // Check extended downtime via consecutive state events
  const downtimeThresholdMs = cfg.downtimeHoursThreshold * 60 * 60 * 1000;
  const lookbackDate = new Date(
    now.getTime() - cfg.downtimeHoursThreshold * 2 * 60 * 60 * 1000
  );

  // Find the latest state event per turbine that indicates non-running state
  const latestEvents = await prisma.$queryRaw<
    Array<{
      turbineId: string;
      latestRunning: Date | null;
      latestEvent: Date | null;
    }>
  >`
    SELECT
      se."turbineId",
      MAX(CASE WHEN se."state" = 0 THEN se."timestamp" END) as "latestRunning",
      MAX(se."timestamp") as "latestEvent"
    FROM "scada_state_events" se
    WHERE se."tenantId" = ${tenantId}
      AND se."turbineId" IN (${Prisma.join(targetIds)})
      AND se."timestamp" >= ${lookbackDate}
    GROUP BY se."turbineId"
  `;

  for (const row of latestEvents) {
    const turbine = turbineMap.get(row.turbineId);
    if (!turbine) continue;

    if (row.latestEvent && row.latestRunning) {
      const downSinceMs = row.latestEvent.getTime() - row.latestRunning.getTime();
      if (downSinceMs > downtimeThresholdMs) {
        const downtimeHours = Math.round(downSinceMs / 3600000 * 10) / 10;
        anomalies.push({
          turbineId: turbine.id,
          turbineDesignation: turbine.designation,
          parkName: turbine.parkName,
          type: "EXTENDED_DOWNTIME",
          severity: "CRITICAL",
          message: `Anlage seit ${downtimeHours} Stunden nicht im Betrieb (Schwellwert: ${cfg.downtimeHoursThreshold}h).`,
          detectedAt: now,
          details: {
            downtimeHours,
            threshold: cfg.downtimeHoursThreshold,
            lastRunningAt: row.latestRunning.getTime(),
          },
        });
      }
    } else if (row.latestEvent && !row.latestRunning) {
      // No running state found in lookback window
      anomalies.push({
        turbineId: turbine.id,
        turbineDesignation: turbine.designation,
        parkName: turbine.parkName,
        type: "EXTENDED_DOWNTIME",
        severity: "CRITICAL",
        message: `Kein Betriebszustand in den letzten ${cfg.downtimeHoursThreshold * 2} Stunden gefunden.`,
        detectedAt: now,
        details: {
          downtimeHoursThreshold: cfg.downtimeHoursThreshold,
          lookbackHours: cfg.downtimeHoursThreshold * 2,
        },
      });
    }
  }

  return anomalies;
}

// =============================================================================
// Detection: Wind-Power Curve Deviation
// =============================================================================

/**
 * Compare actual power output per wind speed bin against historical average.
 * Uses 1 m/s bins and flags turbines where actual power deviates >threshold%
 * from expected (historical) power at the same wind speed.
 */
export async function checkCurveDeviation(
  tenantId: string,
  turbineIds: string[],
  config?: AnomalyConfig
): Promise<AnomalyResult[]> {
  const cfg = config ?? (await getConfig(tenantId));
  const thresholdFraction = cfg.curveDeviationThreshold / 100;
  const anomalies: AnomalyResult[] = [];
  const now = new Date();

  const turbines = await getTurbines(tenantId);
  const turbineMap = new Map(turbines.map((t) => [t.id, t]));

  const targetIds = turbineIds.length > 0
    ? turbineIds.filter((id) => turbineMap.has(id))
    : turbines.map((t) => t.id);

  if (targetIds.length === 0) return anomalies;

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Get power curve: historical (90d) vs recent (7d) per wind speed bin per turbine
  // Wind speed bins: FLOOR(windSpeedMs) groups measurements into 0-1, 1-2, 2-3, etc.
  const curveData = await prisma.$queryRaw<
    Array<{
      turbineId: string;
      windBin: number;
      avg_power_hist: number | null;
      count_hist: number;
      avg_power_recent: number | null;
      count_recent: number;
    }>
  >`
    SELECT
      m."turbineId",
      FLOOR(m."windSpeedMs"::float)::int as "windBin",
      AVG(CASE WHEN m."timestamp" < ${sevenDaysAgo} THEN m."powerW"::float END) as avg_power_hist,
      COUNT(CASE WHEN m."timestamp" < ${sevenDaysAgo} AND m."powerW" IS NOT NULL THEN 1 END)::int as count_hist,
      AVG(CASE WHEN m."timestamp" >= ${sevenDaysAgo} THEN m."powerW"::float END) as avg_power_recent,
      COUNT(CASE WHEN m."timestamp" >= ${sevenDaysAgo} AND m."powerW" IS NOT NULL THEN 1 END)::int as count_recent
    FROM "scada_measurements" m
    WHERE m."tenantId" = ${tenantId}
      AND m."turbineId" IN (${Prisma.join(targetIds)})
      AND m."timestamp" >= ${ninetyDaysAgo}
      AND m."powerW" IS NOT NULL
      AND m."powerW" NOT IN (32767, 65535)
      AND m."windSpeedMs" IS NOT NULL
      AND m."windSpeedMs" NOT IN (32767, 65535)
      AND m."windSpeedMs"::float >= 3   -- Below cut-in speed, power is near zero (not meaningful)
      AND m."windSpeedMs"::float <= 25  -- Above cut-out speed, turbine shuts down
    GROUP BY m."turbineId", FLOOR(m."windSpeedMs"::float)::int
    HAVING
      COUNT(CASE WHEN m."timestamp" < ${sevenDaysAgo} AND m."powerW" IS NOT NULL THEN 1 END) >= 10
      AND COUNT(CASE WHEN m."timestamp" >= ${sevenDaysAgo} AND m."powerW" IS NOT NULL THEN 1 END) >= 3
  `;

  // Group by turbineId and check for consistent deviations across bins
  const turbineDeviations = new Map<
    string,
    { totalBins: number; deviatingBins: number; maxDeviation: number; worstBin: number }
  >();

  for (const row of curveData) {
    if (!row.avg_power_hist || !row.avg_power_recent) continue;
    if (row.avg_power_hist <= 0) continue;

    const deviation = (row.avg_power_hist - row.avg_power_recent) / row.avg_power_hist;

    const entry = turbineDeviations.get(row.turbineId) ?? {
      totalBins: 0,
      deviatingBins: 0,
      maxDeviation: 0,
      worstBin: 0,
    };

    entry.totalBins++;
    if (deviation > thresholdFraction) {
      entry.deviatingBins++;
      if (deviation > entry.maxDeviation) {
        entry.maxDeviation = deviation;
        entry.worstBin = row.windBin;
      }
    }

    turbineDeviations.set(row.turbineId, entry);
  }

  for (const [turbineId, dev] of turbineDeviations) {
    const turbine = turbineMap.get(turbineId);
    if (!turbine) continue;

    // Flag if more than 30% of bins show deviation
    const deviatingRatio = dev.totalBins > 0
      ? dev.deviatingBins / dev.totalBins
      : 0;

    if (deviatingRatio >= 0.3 && dev.deviatingBins >= 2) {
      const maxDevPct = Math.round(dev.maxDeviation * 100);
      const severity = maxDevPct >= cfg.curveDeviationThreshold * 1.5
        ? "CRITICAL"
        : "WARNING";

      anomalies.push({
        turbineId: turbine.id,
        turbineDesignation: turbine.designation,
        parkName: turbine.parkName,
        type: "CURVE_DEVIATION",
        severity,
        message: `Leistungskurve weicht in ${dev.deviatingBins} von ${dev.totalBins} Windgeschwindigkeits-Bereichen ab (max. ${maxDevPct}% bei ${dev.worstBin}-${dev.worstBin + 1} m/s).`,
        detectedAt: now,
        details: {
          deviatingBins: dev.deviatingBins,
          totalBins: dev.totalBins,
          maxDeviationPercent: maxDevPct,
          worstWindSpeedBin: dev.worstBin,
          threshold: cfg.curveDeviationThreshold,
        },
      });
    }
  }

  return anomalies;
}

// =============================================================================
// Detection: Data Quality
// =============================================================================

/**
 * Check data coverage and invalid value rates for the last 24 hours.
 * Flags if:
 * - Data coverage drops below threshold (default 80%)
 * - Too many invalid values in measurements
 */
export async function checkDataQuality(
  tenantId: string,
  turbineIds: string[],
  config?: AnomalyConfig
): Promise<AnomalyResult[]> {
  const cfg = config ?? (await getConfig(tenantId));
  const anomalies: AnomalyResult[] = [];
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const turbines = await getTurbines(tenantId);
  const turbineMap = new Map(turbines.map((t) => [t.id, t]));

  const targetIds = turbineIds.length > 0
    ? turbineIds.filter((id) => turbineMap.has(id))
    : turbines.map((t) => t.id);

  if (targetIds.length === 0) return anomalies;

  // Count total records and invalid records per turbine in last 24h
  const qualityData = await prisma.$queryRaw<
    Array<{
      turbineId: string;
      total_records: number;
      invalid_power: number;
      invalid_wind: number;
      null_power: number;
      null_wind: number;
    }>
  >`
    SELECT
      m."turbineId",
      COUNT(*)::int as total_records,
      COUNT(CASE WHEN m."powerW"::float IN (32767, 65535, 6553.5) THEN 1 END)::int as invalid_power,
      COUNT(CASE WHEN m."windSpeedMs"::float IN (32767, 65535, 6553.5) THEN 1 END)::int as invalid_wind,
      COUNT(CASE WHEN m."powerW" IS NULL THEN 1 END)::int as null_power,
      COUNT(CASE WHEN m."windSpeedMs" IS NULL THEN 1 END)::int as null_wind
    FROM "scada_measurements" m
    WHERE m."tenantId" = ${tenantId}
      AND m."turbineId" IN (${Prisma.join(targetIds)})
      AND m."timestamp" >= ${oneDayAgo}
    GROUP BY m."turbineId"
  `;

  for (const row of qualityData) {
    const turbine = turbineMap.get(row.turbineId);
    if (!turbine) continue;

    const expectedRecords = INTERVALS_PER_DAY; // 144 for a full day
    const coveragePct = (row.total_records / expectedRecords) * 100;

    // Coverage check
    if (coveragePct < cfg.dataQualityThreshold) {
      const severity = coveragePct < cfg.dataQualityThreshold * 0.5
        ? "CRITICAL"
        : "WARNING";

      anomalies.push({
        turbineId: turbine.id,
        turbineDesignation: turbine.designation,
        parkName: turbine.parkName,
        type: "DATA_QUALITY",
        severity,
        message: `Datenabdeckung nur ${coveragePct.toFixed(1)}% (${row.total_records}/${expectedRecords} Messpunkte in 24h). Schwellwert: ${cfg.dataQualityThreshold}%.`,
        detectedAt: now,
        details: {
          coveragePercent: Math.round(coveragePct * 10) / 10,
          totalRecords: row.total_records,
          expectedRecords,
          threshold: cfg.dataQualityThreshold,
        },
      });
    }

    // Invalid value check: if >10% of measurements have invalid markers
    const invalidCount = row.invalid_power + row.invalid_wind;
    const invalidPct =
      row.total_records > 0
        ? (invalidCount / (row.total_records * 2)) * 100
        : 0;

    if (invalidPct > 10 && row.total_records > 20) {
      anomalies.push({
        turbineId: turbine.id,
        turbineDesignation: turbine.designation,
        parkName: turbine.parkName,
        type: "DATA_QUALITY",
        severity: invalidPct > 30 ? "CRITICAL" : "WARNING",
        message: `${invalidCount} ungültige Messwerte (${invalidPct.toFixed(1)}%) in den letzten 24 Stunden.`,
        detectedAt: now,
        details: {
          invalidPowerCount: row.invalid_power,
          invalidWindCount: row.invalid_wind,
          nullPowerCount: row.null_power,
          nullWindCount: row.null_wind,
          totalRecords: row.total_records,
          invalidPercent: Math.round(invalidPct * 10) / 10,
        },
      });
    }
  }

  return anomalies;
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Run all anomaly detection checks for a tenant.
 * Stores results in the database and sends notifications.
 */
export async function runAnomalyDetection(
  tenantId: string,
  options?: { parkId?: string }
): Promise<AnomalyResult[]> {
  const config = await getConfig(tenantId);

  if (!config.enabled) {
    logger.info(
      { tenantId },
      "[AnomalyDetection] Detection disabled for tenant"
    );
    return [];
  }

  const turbines = await getTurbines(tenantId, options?.parkId);
  const turbineIds = turbines.map((t) => t.id);

  if (turbineIds.length === 0) {
    logger.info(
      { tenantId, parkId: options?.parkId },
      "[AnomalyDetection] No active turbines found"
    );
    return [];
  }

  logger.info(
    { tenantId, turbineCount: turbineIds.length, parkId: options?.parkId },
    "[AnomalyDetection] Starting anomaly detection"
  );

  // Run all checks in parallel
  const [performanceResults, availabilityResults, curveResults, qualityResults] =
    await Promise.all([
      checkPerformanceDrop(tenantId, turbineIds, config).catch((err) => {
        logger.error(
          { err, tenantId },
          "[AnomalyDetection] Performance check failed"
        );
        return [] as AnomalyResult[];
      }),
      checkAvailability(tenantId, turbineIds, config).catch((err) => {
        logger.error(
          { err, tenantId },
          "[AnomalyDetection] Availability check failed"
        );
        return [] as AnomalyResult[];
      }),
      checkCurveDeviation(tenantId, turbineIds, config).catch((err) => {
        logger.error(
          { err, tenantId },
          "[AnomalyDetection] Curve deviation check failed"
        );
        return [] as AnomalyResult[];
      }),
      checkDataQuality(tenantId, turbineIds, config).catch((err) => {
        logger.error(
          { err, tenantId },
          "[AnomalyDetection] Data quality check failed"
        );
        return [] as AnomalyResult[];
      }),
    ]);

  const allAnomalies = [
    ...performanceResults,
    ...availabilityResults,
    ...curveResults,
    ...qualityResults,
  ];

  logger.info(
    {
      tenantId,
      total: allAnomalies.length,
      performance: performanceResults.length,
      availability: availabilityResults.length,
      curve: curveResults.length,
      quality: qualityResults.length,
    },
    "[AnomalyDetection] Detection complete"
  );

  // Deduplicate: don't create duplicate anomalies for same turbine+type within 24h
  const recentAnomalies = await prisma.scadaAnomaly.findMany({
    where: {
      tenantId,
      detectedAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
      resolvedAt: null,
    },
    select: {
      turbineId: true,
      type: true,
    },
  });

  const recentKeys = new Set(
    recentAnomalies.map((a) => `${a.turbineId}:${a.type}`)
  );

  const newAnomalies = allAnomalies.filter(
    (a) => !recentKeys.has(`${a.turbineId}:${a.type}`)
  );

  if (newAnomalies.length === 0) {
    logger.info(
      { tenantId },
      "[AnomalyDetection] No new anomalies (all duplicates of existing)"
    );
    return allAnomalies;
  }

  // Store new anomalies in database
  await prisma.scadaAnomaly.createMany({
    data: newAnomalies.map((a) => ({
      tenantId,
      turbineId: a.turbineId,
      type: a.type,
      severity: a.severity,
      message: a.message,
      details: a.details as Prisma.InputJsonValue,
      detectedAt: a.detectedAt,
    })),
  });

  // Send notifications for new anomalies
  await sendAnomalyNotifications(tenantId, newAnomalies, config);

  return allAnomalies;
}

// =============================================================================
// Notification Integration
// =============================================================================

/**
 * Send in-app and email notifications for detected anomalies.
 */
async function sendAnomalyNotifications(
  tenantId: string,
  anomalies: AnomalyResult[],
  config: AnomalyConfig
): Promise<void> {
  if (anomalies.length === 0) return;

  const criticalCount = anomalies.filter((a) => a.severity === "CRITICAL").length;
  const warningCount = anomalies.filter((a) => a.severity === "WARNING").length;

  const title = criticalCount > 0
    ? `SCADA: ${criticalCount} kritische Anomalie(n) erkannt`
    : `SCADA: ${warningCount} Warnung(en) erkannt`;

  const message =
    anomalies.length === 1
      ? `${anomalies[0].turbineDesignation} (${anomalies[0].parkName}): ${anomalies[0].message}`
      : `${anomalies.length} Anomalien erkannt bei ${new Set(anomalies.map((a) => a.turbineDesignation)).size} Anlage(n).`;

  // In-app notification
  if (config.notifyInApp) {
    try {
      await notifyAdmins({
        tenantId,
        type: "SYSTEM",
        title,
        message,
        link: "/energy/scada/anomalies",
      });
    } catch (err) {
      logger.error(
        { err, tenantId },
        "[AnomalyDetection] Failed to send in-app notifications"
      );
    }
  }

  // Email notification
  if (config.notifyByEmail) {
    try {
      const admins = await prisma.user.findMany({
        where: {
          tenantId,
          status: "ACTIVE",
          role: { in: ["ADMIN", "SUPERADMIN"] },
        },
        select: { id: true, email: true },
      });

      for (const admin of admins) {
        try {
          await sendEmailAsync(
            "service-event",
            {
              title,
              message,
              anomalyCount: anomalies.length,
              criticalCount,
              warningCount,
              link: `${process.env.NEXT_PUBLIC_APP_URL || ""}/energy/scada/anomalies`,
            },
            admin.email,
            tenantId
          );
        } catch (emailErr) {
          logger.error(
            { err: emailErr, adminId: admin.id },
            "[AnomalyDetection] Failed to send email notification"
          );
        }
      }
    } catch (err) {
      logger.error(
        { err, tenantId },
        "[AnomalyDetection] Failed to send email notifications"
      );
    }
  }
}
