import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// POST /api/energy/reports/generate
// Generate report data for given modules and filters.
// Does NOT generate a PDF - aggregates data for the frontend to render.
// =============================================================================

const VALID_MODULES = [
  "production",
  "powerCurve",
  "windRose",
  "dailyProfile",
  "kpiSummary",
  "turbineComparison",
] as const;

const VALID_INTERVALS = ["10min", "hour", "day", "month", "year"] as const;

const GenerateReportSchema = z.object({
  modules: z.array(z.enum(VALID_MODULES)).min(1),
  parkId: z.string().uuid().optional().nullable(),
  turbineId: z.string().uuid().optional().nullable(),
  from: z.string().min(1, "'from' Datum ist erforderlich"),
  to: z.string().min(1, "'to' Datum ist erforderlich"),
  interval: z.enum(VALID_INTERVALS).optional().default("month"),
});

// ---------------------------------------------------------------------------
// SQL result row interfaces
// ---------------------------------------------------------------------------

interface AggregatedRow {
  turbineId: string;
  period_start: Date;
  production_kwh: Prisma.Decimal | null;
  avg_power_kw: Prisma.Decimal | null;
  avg_wind_speed: Prisma.Decimal | null;
  data_points: bigint;
}

interface ScatterRow {
  windSpeed: number;
  powerKw: number;
  turbineId: string;
}

interface CurveRow {
  windSpeed: number;
  avgPowerKw: number;
  count: bigint;
}

interface WindRoseRow {
  direction_sector: string;
  speed_range: string;
  count: bigint;
}

interface KpiRow {
  total_production_kwh: Prisma.Decimal | null;
  avg_power_kw: Prisma.Decimal | null;
  avg_wind_speed: Prisma.Decimal | null;
  max_power_kw: Prisma.Decimal | null;
  data_points: bigint;
  data_completeness: number | null;
  turbine_count: bigint;
}

interface DailyProfileRow {
  time_slot: string;
  avg_power_kw: Prisma.Decimal | null;
  avg_wind_speed: Prisma.Decimal | null;
  avg_production_kwh: Prisma.Decimal | null;
  data_points: bigint;
}

interface TurbineComparisonRow {
  turbineId: string;
  total_kwh: Prisma.Decimal | null;
  avg_power_kw: Prisma.Decimal | null;
  avg_wind_speed: Prisma.Decimal | null;
  data_points: bigint;
  max_operating_hours: Prisma.Decimal | null;
  min_operating_hours: Prisma.Decimal | null;
}

// ---------------------------------------------------------------------------
// Wind rose constants (reused from /api/energy/scada/wind-rose)
// ---------------------------------------------------------------------------

const DIRECTION_SECTORS = [
  { label: "N", deg: 0 },
  { label: "NNE", deg: 22.5 },
  { label: "NE", deg: 45 },
  { label: "ENE", deg: 67.5 },
  { label: "E", deg: 90 },
  { label: "ESE", deg: 112.5 },
  { label: "SE", deg: 135 },
  { label: "SSE", deg: 157.5 },
  { label: "S", deg: 180 },
  { label: "SSW", deg: 202.5 },
  { label: "SW", deg: 225 },
  { label: "WSW", deg: 247.5 },
  { label: "W", deg: 270 },
  { label: "WNW", deg: 292.5 },
  { label: "NW", deg: 315 },
  { label: "NNW", deg: 337.5 },
] as const;

const SPEED_RANGES = ["0-3", "3-6", "6-9", "9-12", "12-15", "15+"] as const;

// =============================================================================
// Shared helper: build WHERE clause for scada_measurements
// =============================================================================

function buildWhereClause(
  tenantId: string,
  turbineIds: string[],
  fromDate: Date,
  toDate: Date
) {
  return Prisma.sql`
    "tenantId" = ${tenantId}
    AND "sourceFile" = 'WSD'
    AND "powerW" IS NOT NULL
    AND "turbineId" IN (${Prisma.join(turbineIds)})
    AND "timestamp" >= ${fromDate}
    AND "timestamp" < ${toDate}
  `;
}

// =============================================================================
// Module data fetchers
// =============================================================================

async function fetchProductionData(
  tenantId: string,
  turbineIds: string[],
  fromDate: Date,
  toDate: Date,
  interval: string,
  turbineMap: Map<string, { designation: string; parkName: string }>
) {
  const whereClause = buildWhereClause(tenantId, turbineIds, fromDate, toDate);

  let dataRows: AggregatedRow[];

  if (interval === "10min") {
    dataRows = await prisma.$queryRaw<AggregatedRow[]>`
      SELECT
        "turbineId",
        "timestamp" AS period_start,
        "powerW" * 10.0 / 60.0 / 1000.0 AS production_kwh,
        "powerW" / 1000.0 AS avg_power_kw,
        "windSpeedMs" AS avg_wind_speed,
        1 AS data_points
      FROM scada_measurements
      WHERE ${whereClause}
      ORDER BY "turbineId", "timestamp"
      LIMIT 5000
    `;
  } else {
    const truncSql =
      interval === "hour"
        ? Prisma.sql`date_trunc('hour', "timestamp")`
        : interval === "day"
          ? Prisma.sql`date_trunc('day', "timestamp")`
          : interval === "month"
            ? Prisma.sql`date_trunc('month', "timestamp")`
            : Prisma.sql`date_trunc('year', "timestamp")`;

    dataRows = await prisma.$queryRaw<AggregatedRow[]>`
      SELECT
        "turbineId",
        ${truncSql} AS period_start,
        SUM("powerW" * 10.0 / 60.0 / 1000.0) AS production_kwh,
        AVG("powerW") / 1000.0 AS avg_power_kw,
        AVG("windSpeedMs") AS avg_wind_speed,
        COUNT(*) AS data_points
      FROM scada_measurements
      WHERE ${whereClause}
      GROUP BY "turbineId", ${truncSql}
      ORDER BY "turbineId", period_start
      LIMIT 5000
    `;
  }

  return dataRows.map((row) => {
    const info = turbineMap.get(row.turbineId);
    return {
      turbineId: row.turbineId,
      turbineDesignation: info?.designation ?? "Unbekannt",
      parkName: info?.parkName ?? "Unbekannt",
      periodStart:
        row.period_start instanceof Date
          ? row.period_start.toISOString()
          : String(row.period_start),
      productionKwh: row.production_kwh
        ? Math.round(Number(row.production_kwh) * 1000) / 1000
        : 0,
      avgPowerKw: row.avg_power_kw
        ? Math.round(Number(row.avg_power_kw) * 1000) / 1000
        : 0,
      avgWindSpeed: row.avg_wind_speed
        ? Math.round(Number(row.avg_wind_speed) * 100) / 100
        : 0,
      dataPoints: Number(row.data_points),
    };
  });
}

async function fetchPowerCurveData(
  tenantId: string,
  turbineIds: string[],
  fromDate: Date,
  toDate: Date
) {
  const whereClause = Prisma.sql`
    "tenantId" = ${tenantId}
    AND "sourceFile" = 'WSD'
    AND "powerW" IS NOT NULL
    AND "windSpeedMs" IS NOT NULL
    AND "powerW" > 0
    AND "turbineId" IN (${Prisma.join(turbineIds)})
    AND "timestamp" >= ${fromDate}
    AND "timestamp" < ${toDate}
  `;

  const scatterRows = await prisma.$queryRaw<ScatterRow[]>`
    SELECT
      "windSpeedMs"::float AS "windSpeed",
      "powerW"::float / 1000.0 AS "powerKw",
      "turbineId"
    FROM scada_measurements
    WHERE ${whereClause}
    ORDER BY RANDOM()
    LIMIT 5000
  `;

  const curveRows = await prisma.$queryRaw<CurveRow[]>`
    SELECT
      ROUND("windSpeedMs"::numeric * 2) / 2 AS "windSpeed",
      AVG("powerW")::float / 1000.0 AS "avgPowerKw",
      COUNT(*) AS count
    FROM scada_measurements
    WHERE ${whereClause}
    GROUP BY ROUND("windSpeedMs"::numeric * 2) / 2
    ORDER BY "windSpeed"
  `;

  return {
    scatter: scatterRows.map((row) => ({
      windSpeed: Math.round(row.windSpeed * 100) / 100,
      powerKw: Math.round(row.powerKw * 100) / 100,
      turbineId: row.turbineId,
    })),
    curve: curveRows.map((row) => ({
      windSpeed: Number(row.windSpeed),
      avgPowerKw: Math.round(Number(row.avgPowerKw) * 100) / 100,
      count: Number(row.count),
    })),
  };
}

async function fetchWindRoseData(
  tenantId: string,
  turbineIds: string[],
  fromDate: Date,
  toDate: Date
) {
  const whereClause = Prisma.sql`
    "tenantId" = ${tenantId}
    AND "sourceFile" = 'WSD'
    AND "windDirection" IS NOT NULL
    AND "windSpeedMs" IS NOT NULL
    AND "turbineId" IN (${Prisma.join(turbineIds)})
    AND "timestamp" >= ${fromDate}
    AND "timestamp" < ${toDate}
  `;

  const rows = await prisma.$queryRaw<WindRoseRow[]>`
    SELECT
      CASE
        WHEN "windDirection" >= 348.75 OR "windDirection" < 11.25 THEN 'N'
        WHEN "windDirection" >= 11.25 AND "windDirection" < 33.75 THEN 'NNE'
        WHEN "windDirection" >= 33.75 AND "windDirection" < 56.25 THEN 'NE'
        WHEN "windDirection" >= 56.25 AND "windDirection" < 78.75 THEN 'ENE'
        WHEN "windDirection" >= 78.75 AND "windDirection" < 101.25 THEN 'E'
        WHEN "windDirection" >= 101.25 AND "windDirection" < 123.75 THEN 'ESE'
        WHEN "windDirection" >= 123.75 AND "windDirection" < 146.25 THEN 'SE'
        WHEN "windDirection" >= 146.25 AND "windDirection" < 168.75 THEN 'SSE'
        WHEN "windDirection" >= 168.75 AND "windDirection" < 191.25 THEN 'S'
        WHEN "windDirection" >= 191.25 AND "windDirection" < 213.75 THEN 'SSW'
        WHEN "windDirection" >= 213.75 AND "windDirection" < 236.25 THEN 'SW'
        WHEN "windDirection" >= 236.25 AND "windDirection" < 258.75 THEN 'WSW'
        WHEN "windDirection" >= 258.75 AND "windDirection" < 281.25 THEN 'W'
        WHEN "windDirection" >= 281.25 AND "windDirection" < 303.75 THEN 'WNW'
        WHEN "windDirection" >= 303.75 AND "windDirection" < 326.25 THEN 'NW'
        WHEN "windDirection" >= 326.25 AND "windDirection" < 348.75 THEN 'NNW'
      END AS direction_sector,
      CASE
        WHEN "windSpeedMs" < 3 THEN '0-3'
        WHEN "windSpeedMs" < 6 THEN '3-6'
        WHEN "windSpeedMs" < 9 THEN '6-9'
        WHEN "windSpeedMs" < 12 THEN '9-12'
        WHEN "windSpeedMs" < 15 THEN '12-15'
        ELSE '15+'
      END AS speed_range,
      COUNT(*) AS count
    FROM scada_measurements
    WHERE ${whereClause}
    GROUP BY direction_sector, speed_range
    ORDER BY direction_sector, speed_range
  `;

  // Build lookup map
  const countMap = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.direction_sector) continue;
    if (!countMap.has(row.direction_sector)) {
      countMap.set(row.direction_sector, new Map());
    }
    countMap.get(row.direction_sector)!.set(row.speed_range, Number(row.count));
  }

  // Calculate totals per direction for dominant direction
  const directionTotals: Record<string, number> = {};
  for (const sector of DIRECTION_SECTORS) {
    const speedMap = countMap.get(sector.label);
    let total = 0;
    if (speedMap) {
      speedMap.forEach((c) => {
        total += c;
      });
    }
    directionTotals[sector.label] = total;
  }

  let dominantDirection = "N";
  let maxTotal = 0;
  for (const dir of Object.keys(directionTotals)) {
    if (directionTotals[dir] > maxTotal) {
      maxTotal = directionTotals[dir];
      dominantDirection = dir;
    }
  }

  const data = DIRECTION_SECTORS.map((sector) => {
    const speedMap = countMap.get(sector.label);
    const total = directionTotals[sector.label] ?? 0;
    return {
      direction: sector.label,
      directionDeg: sector.deg,
      total,
      speedRanges: SPEED_RANGES.map((range) => ({
        range,
        count: speedMap?.get(range) ?? 0,
      })),
    };
  });

  return { data, dominantDirection };
}

async function fetchKpiSummary(
  tenantId: string,
  turbineIds: string[],
  fromDate: Date,
  toDate: Date
) {
  const whereClause = buildWhereClause(tenantId, turbineIds, fromDate, toDate);

  // Calculate expected data points based on date range (10-min intervals)
  const diffMs = toDate.getTime() - fromDate.getTime();
  const expectedPointsPerTurbine = diffMs / (10 * 60 * 1000);
  const totalExpectedPoints = expectedPointsPerTurbine * turbineIds.length;

  const kpiRows = await prisma.$queryRaw<KpiRow[]>`
    SELECT
      SUM("powerW" * 10.0 / 60.0 / 1000.0) AS total_production_kwh,
      AVG("powerW") / 1000.0 AS avg_power_kw,
      AVG("windSpeedMs") AS avg_wind_speed,
      MAX("powerW") / 1000.0 AS max_power_kw,
      COUNT(*) AS data_points,
      COUNT(DISTINCT "turbineId") AS turbine_count
    FROM scada_measurements
    WHERE ${whereClause}
  `;

  const kpi = kpiRows[0];
  const dataPoints = Number(kpi?.data_points ?? 0);
  const dataCompleteness =
    totalExpectedPoints > 0
      ? Math.round((dataPoints / totalExpectedPoints) * 10000) / 100
      : 0;

  // Calculate operating hours from data points (each 10-min interval = 1/6 hour)
  const operatingHours = Math.round((dataPoints / turbineIds.length) * (10 / 60) * 100) / 100;

  return {
    totalProductionKwh: kpi?.total_production_kwh
      ? Math.round(Number(kpi.total_production_kwh) * 1000) / 1000
      : 0,
    avgPowerKw: kpi?.avg_power_kw
      ? Math.round(Number(kpi.avg_power_kw) * 1000) / 1000
      : 0,
    avgWindSpeed: kpi?.avg_wind_speed
      ? Math.round(Number(kpi.avg_wind_speed) * 100) / 100
      : 0,
    maxPowerKw: kpi?.max_power_kw
      ? Math.round(Number(kpi.max_power_kw) * 1000) / 1000
      : 0,
    operatingHours,
    dataCompleteness,
    turbineCount: Number(kpi?.turbine_count ?? 0),
  };
}

async function fetchDailyProfile(
  tenantId: string,
  turbineIds: string[],
  fromDate: Date,
  toDate: Date
) {
  const whereClause = buildWhereClause(tenantId, turbineIds, fromDate, toDate);

  // Average across all days, grouped by time-of-day in 10-min slots
  const rows = await prisma.$queryRaw<DailyProfileRow[]>`
    SELECT
      TO_CHAR("timestamp", 'HH24:MI') AS time_slot,
      AVG("powerW") / 1000.0 AS avg_power_kw,
      AVG("windSpeedMs") AS avg_wind_speed,
      AVG("powerW" * 10.0 / 60.0 / 1000.0) AS avg_production_kwh,
      COUNT(*) AS data_points
    FROM scada_measurements
    WHERE ${whereClause}
    GROUP BY TO_CHAR("timestamp", 'HH24:MI')
    ORDER BY time_slot
  `;

  return rows.map((row) => ({
    timeSlot: row.time_slot,
    avgPowerKw: row.avg_power_kw
      ? Math.round(Number(row.avg_power_kw) * 1000) / 1000
      : 0,
    avgWindSpeed: row.avg_wind_speed
      ? Math.round(Number(row.avg_wind_speed) * 100) / 100
      : 0,
    avgProductionKwh: row.avg_production_kwh
      ? Math.round(Number(row.avg_production_kwh) * 1000) / 1000
      : 0,
    dataPoints: Number(row.data_points),
  }));
}

async function fetchTurbineComparison(
  tenantId: string,
  turbineIds: string[],
  fromDate: Date,
  toDate: Date,
  turbineMap: Map<string, { designation: string; parkName: string }>
) {
  const whereClause = buildWhereClause(tenantId, turbineIds, fromDate, toDate);

  // Calculate expected data points per turbine for availability
  const diffMs = toDate.getTime() - fromDate.getTime();
  const expectedPointsPerTurbine = diffMs / (10 * 60 * 1000);

  const rows = await prisma.$queryRaw<TurbineComparisonRow[]>`
    SELECT
      "turbineId",
      SUM("powerW" * 10.0 / 60.0 / 1000.0) AS total_kwh,
      AVG("powerW") / 1000.0 AS avg_power_kw,
      AVG("windSpeedMs") AS avg_wind_speed,
      COUNT(*) AS data_points,
      MAX("operatingHours") AS max_operating_hours,
      MIN("operatingHours") AS min_operating_hours
    FROM scada_measurements
    WHERE ${whereClause}
    GROUP BY "turbineId"
    ORDER BY total_kwh DESC
  `;

  return rows.map((row) => {
    const info = turbineMap.get(row.turbineId);
    const dataPoints = Number(row.data_points);
    const availability =
      expectedPointsPerTurbine > 0
        ? Math.round((dataPoints / expectedPointsPerTurbine) * 10000) / 100
        : 0;

    return {
      turbineId: row.turbineId,
      designation: info?.designation ?? "Unbekannt",
      totalKwh: row.total_kwh
        ? Math.round(Number(row.total_kwh) * 1000) / 1000
        : 0,
      avgPowerKw: row.avg_power_kw
        ? Math.round(Number(row.avg_power_kw) * 1000) / 1000
        : 0,
      avgWindSpeed: row.avg_wind_speed
        ? Math.round(Number(row.avg_wind_speed) * 100) / 100
        : 0,
      dataPoints,
      availability,
    };
  });
}

// =============================================================================
// Main handler: POST /api/energy/reports/generate
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("energy:read");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;

    const body = await request.json();
    const parsed = GenerateReportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Ungültige Eingabedaten",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { modules, parkId, turbineId, from, to, interval } = parsed.data;

    // Validate date range
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime())) {
      return NextResponse.json(
        { error: "Ungültiges 'from' Datum (ISO-Format erwartet)" },
        { status: 400 }
      );
    }
    if (isNaN(toDate.getTime())) {
      return NextResponse.json(
        { error: "Ungültiges 'to' Datum (ISO-Format erwartet)" },
        { status: 400 }
      );
    }
    if (fromDate >= toDate) {
      return NextResponse.json(
        { error: "'from' muss vor 'to' liegen" },
        { status: 400 }
      );
    }

    // Find turbines for this tenant, filtered by park/turbine
    const turbineWhere: Record<string, unknown> = {
      park: { tenantId },
    };
    if (parkId) turbineWhere.parkId = parkId;
    if (turbineId) turbineWhere.id = turbineId;

    const turbines = await prisma.turbine.findMany({
      where: turbineWhere,
      select: {
        id: true,
        designation: true,
        park: { select: { id: true, name: true } },
      },
      orderBy: [{ park: { name: "asc" } }, { designation: "asc" }],
    });

    if (turbines.length === 0) {
      return NextResponse.json(
        { error: "Keine Turbinen für die gewaehlten Filter gefunden" },
        { status: 404 }
      );
    }

    const turbineIds = turbines.map((t) => t.id);
    const turbineMap = new Map(
      turbines.map((t) => [
        t.id,
        { designation: t.designation, parkName: t.park.name },
      ])
    );

    // Determine park name for meta
    const parkNames = [...new Set(turbines.map((t) => t.park.name))];
    const turbineNames = turbines.map((t) => t.designation);

    // Build response - only query modules that are requested
    const result: Record<string, any> = {
      meta: {
        generatedAt: new Date().toISOString(),
        parkName: parkNames.length === 1 ? parkNames[0] : parkNames.join(", "),
        turbineNames,
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        interval,
        modules,
      },
    };

    // Fetch each requested module in parallel where possible
    const promises: Promise<void>[] = [];

    if (modules.includes("kpiSummary")) {
      promises.push(
        fetchKpiSummary(tenantId, turbineIds, fromDate, toDate).then((data) => {
          result.kpiSummary = data;
        })
      );
    }

    if (modules.includes("production")) {
      promises.push(
        fetchProductionData(
          tenantId,
          turbineIds,
          fromDate,
          toDate,
          interval,
          turbineMap
        ).then((data) => {
          result.production = data;
        })
      );
    }

    if (modules.includes("powerCurve")) {
      promises.push(
        fetchPowerCurveData(tenantId, turbineIds, fromDate, toDate).then(
          (data) => {
            result.powerCurve = data;
          }
        )
      );
    }

    if (modules.includes("windRose")) {
      promises.push(
        fetchWindRoseData(tenantId, turbineIds, fromDate, toDate).then(
          (data) => {
            result.windRose = data;
          }
        )
      );
    }

    if (modules.includes("dailyProfile")) {
      promises.push(
        fetchDailyProfile(tenantId, turbineIds, fromDate, toDate).then(
          (data) => {
            result.dailyProfile = data;
          }
        )
      );
    }

    if (modules.includes("turbineComparison")) {
      promises.push(
        fetchTurbineComparison(
          tenantId,
          turbineIds,
          fromDate,
          toDate,
          turbineMap
        ).then((data) => {
          result.turbineComparison = data;
        })
      );
    }

    await Promise.all(promises);

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error }, "Error generating energy report data");
    return NextResponse.json(
      { error: "Fehler beim Generieren der Berichtsdaten" },
      { status: 500 }
    );
  }
}
