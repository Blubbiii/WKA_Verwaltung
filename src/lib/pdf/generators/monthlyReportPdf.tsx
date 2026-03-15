/**
 * Monthly Report PDF Generator
 *
 * Fetches all necessary data from the database and renders
 * the MonthlyReportTemplate into a PDF buffer.
 */

import { renderToBuffer } from "@react-pdf/renderer";
import {
  MonthlyReportTemplate,
  type MonthlyReportData,
  type TurbineProductionRow,
  type TurbineAvailabilityRow,
  type ServiceEventRow,
} from "../templates/MonthlyReportTemplate";
import { resolveTemplateAndLetterhead, applyLetterheadBackground } from "../utils/templateResolver";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getSignedUrl } from "@/lib/storage";

// German month names
const MONTH_NAMES = [
  "Januar",
  "Februar",
  "Maerz",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

/**
 * Number of hours in a given month/year
 */
function hoursInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  return daysInMonth * 24;
}

/**
 * Fetch monthly report data from the database
 */
export type MonthlyReportSections = {
  summary?: boolean;
  production?: boolean;
  availability?: boolean;
  service?: boolean;
  monthlyTrend?: boolean;
  windAnalysis?: boolean;
  powerCurve?: boolean;
  dailyProfile?: boolean;
};

async function fetchMonthlyReportData(
  parkId: string,
  year: number,
  month: number,
  tenantId: string
): Promise<MonthlyReportData> {
  // 1. Park with turbines and fund relations
  const park = await prisma.park.findUnique({
    where: { id: parkId },
    include: {
      turbines: {
        where: { status: "ACTIVE", deviceType: "WEA" },
        orderBy: { designation: "asc" },
        select: {
          id: true,
          designation: true,
          ratedPowerKw: true,
        },
      },
      fundParks: {
        include: {
          fund: { select: { name: true } },
        },
        take: 1,
      },
      operatorFund: {
        select: { name: true },
      },
    },
  });

  if (!park) throw new Error("Park nicht gefunden");

  const turbineIds = park.turbines.map((t) => t.id);
  const monthHours = hoursInMonth(year, month);

  // 2. Production data for this month
  const productions = await prisma.turbineProduction.findMany({
    where: {
      turbineId: { in: turbineIds },
      year,
      month,
      tenantId,
    },
    select: {
      turbineId: true,
      productionKwh: true,
      operatingHours: true,
      availabilityPct: true,
    },
  });

  const productionMap = new Map(productions.map((p) => [p.turbineId, p]));

  // 2b. SCADA operating hours fallback (delta of cumulative counter)
  const scadaOpHoursResult = await prisma.$queryRaw<
    Array<{ turbineId: string; delta_hours: number }>
  >(Prisma.sql`
    SELECT "turbineId",
           MAX("operatingHours") - MIN("operatingHours") AS delta_hours
    FROM scada_measurements
    WHERE "turbineId" IN (${Prisma.join(turbineIds)})
      AND "sourceFile" = 'WSD'
      AND "operatingHours" IS NOT NULL
      AND "timestamp" >= ${new Date(year, month - 1, 1)}
      AND "timestamp" < ${new Date(year, month, 1)}
    GROUP BY "turbineId"
    HAVING MAX("operatingHours") > MIN("operatingHours")
  `);
  const scadaOpHoursMap = new Map(
    scadaOpHoursResult.map((r) => [r.turbineId, Number(r.delta_hours)])
  );

  // 3. Availability data (monthly SCADA)
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0); // Last day of month

  const availabilityData = await prisma.scadaAvailability.findMany({
    where: {
      turbineId: { in: turbineIds },
      date: { gte: monthStart, lte: monthEnd },
      periodType: "MONTHLY",
      tenantId,
    },
    select: {
      turbineId: true,
      t1: true,
      t2: true,
      t3: true,
      t4: true,
      t5: true,
      t6: true,
      availabilityPct: true,
    },
  });

  const availabilityMap = new Map(availabilityData.map((a) => [a.turbineId, a]));

  // 4. Wind speed data (SCADA wind summaries)
  const windData = await prisma.scadaWindSummary.findMany({
    where: {
      turbineId: { in: turbineIds },
      date: { gte: monthStart, lte: monthEnd },
      periodType: "MONTHLY",
    },
    select: {
      turbineId: true,
      meanWindSpeed: true,
    },
  });

  // 5. Energy settlements (revenue) for the month
  const settlement = await prisma.energySettlement.findFirst({
    where: {
      parkId,
      year,
      month,
      tenantId,
    },
    select: {
      netOperatorRevenueEur: true,
    },
  });

  // 6. Service events for the month
  const serviceEvents = await prisma.serviceEvent.findMany({
    where: {
      turbine: { parkId },
      eventDate: { gte: monthStart, lte: new Date(year, month, 0, 23, 59, 59) },
    },
    include: {
      turbine: { select: { designation: true } },
    },
    orderBy: { eventDate: "asc" },
  });

  // 7. Previous year data for comparison
  const prevProductions = await prisma.turbineProduction.findMany({
    where: {
      turbineId: { in: turbineIds },
      year: year - 1,
      month,
      tenantId,
    },
    select: {
      productionKwh: true,
      availabilityPct: true,
    },
  });

  const prevWindData = await prisma.scadaWindSummary.findMany({
    where: {
      turbineId: { in: turbineIds },
      date: {
        gte: new Date(year - 1, month - 1, 1),
        lte: new Date(year - 1, month, 0),
      },
      periodType: "MONTHLY",
    },
    select: {
      meanWindSpeed: true,
    },
  });

  const prevSettlement = await prisma.energySettlement.findFirst({
    where: {
      parkId,
      year: year - 1,
      month,
      tenantId,
    },
    select: {
      netOperatorRevenueEur: true,
    },
  });

  // ---- BUILD DATA STRUCTURES ----

  // Turbine production rows
  const turbineProduction: TurbineProductionRow[] = park.turbines.map((turbine) => {
    const prod = productionMap.get(turbine.id);
    const productionKwh = prod ? Number(prod.productionKwh) : 0;
    const productionMwh = productionKwh / 1000;
    const ratedPowerKw = turbine.ratedPowerKw ? Number(turbine.ratedPowerKw) : null;
    const capacityFactor =
      ratedPowerKw && ratedPowerKw > 0
        ? (productionKwh / (ratedPowerKw * monthHours)) * 100
        : null;

    return {
      turbineId: turbine.id,
      designation: turbine.designation,
      productionMwh,
      operatingHours: prod?.operatingHours
        ? Number(prod.operatingHours)
        : scadaOpHoursMap.get(turbine.id) ?? null,
      availabilityPct: prod?.availabilityPct ? Number(prod.availabilityPct) : null,
      capacityFactor,
      ratedPowerKw,
    };
  });

  // Turbine availability rows
  const turbineAvailability: TurbineAvailabilityRow[] = park.turbines
    .map((turbine) => {
      const avail = availabilityMap.get(turbine.id);
      if (!avail) return null;
      return {
        turbineId: turbine.id,
        designation: turbine.designation,
        t1Hours: avail.t1 / 3600,
        t2Hours: avail.t2 / 3600,
        t3Hours: avail.t3 / 3600,
        t4Hours: avail.t4 / 3600,
        t5Hours: avail.t5 / 3600,
        t6Hours: avail.t6 / 3600,
        availabilityPct: avail.availabilityPct ? Number(avail.availabilityPct) : null,
      };
    })
    .filter((a): a is TurbineAvailabilityRow => a !== null);

  // Service event rows
  const serviceEventRows: ServiceEventRow[] = serviceEvents.map((e) => ({
    id: e.id,
    eventDate: e.eventDate,
    eventType: e.eventType,
    turbineDesignation: e.turbine.designation,
    description: e.description,
    durationHours: e.durationHours ? Number(e.durationHours) : null,
  }));

  // Aggregate KPIs
  const totalProductionMwh = turbineProduction.reduce((s, t) => s + t.productionMwh, 0);

  const availabilityValues = turbineProduction
    .map((t) => t.availabilityPct)
    .filter((v): v is number => v != null);
  const avgAvailabilityPct =
    availabilityValues.length > 0
      ? availabilityValues.reduce((s, v) => s + v, 0) / availabilityValues.length
      : null;

  const windSpeedValues = windData
    .map((w) => (w.meanWindSpeed ? Number(w.meanWindSpeed) : null))
    .filter((v): v is number => v != null);
  const avgWindSpeedMs =
    windSpeedValues.length > 0
      ? windSpeedValues.reduce((s, v) => s + v, 0) / windSpeedValues.length
      : null;

  const totalRatedPowerKw = park.turbines.reduce(
    (s, t) => s + (t.ratedPowerKw ? Number(t.ratedPowerKw) : 0),
    0
  );
  const specificYieldKwhPerKw =
    totalRatedPowerKw > 0 ? (totalProductionMwh * 1000) / totalRatedPowerKw : null;

  const totalRevenueEur = settlement
    ? Number(settlement.netOperatorRevenueEur)
    : null;

  // Previous year aggregates
  const prevTotalProductionKwh = prevProductions.reduce(
    (s, p) => s + Number(p.productionKwh),
    0
  );
  const prevTotalProductionMwh =
    prevProductions.length > 0 ? prevTotalProductionKwh / 1000 : null;

  const prevAvailValues = prevProductions
    .map((p) => (p.availabilityPct ? Number(p.availabilityPct) : null))
    .filter((v): v is number => v != null);
  const prevAvgAvailabilityPct =
    prevAvailValues.length > 0
      ? prevAvailValues.reduce((s, v) => s + v, 0) / prevAvailValues.length
      : null;

  const prevWindValues = prevWindData
    .map((w) => (w.meanWindSpeed ? Number(w.meanWindSpeed) : null))
    .filter((v): v is number => v != null);
  const prevAvgWindSpeedMs =
    prevWindValues.length > 0
      ? prevWindValues.reduce((s, v) => s + v, 0) / prevWindValues.length
      : null;

  const prevRevenueEur = prevSettlement
    ? Number(prevSettlement.netOperatorRevenueEur)
    : null;

  // Notable downtimes (turbines with availability < 90%)
  const notableDowntimes: string[] = [];
  for (const avail of turbineAvailability) {
    if (avail.availabilityPct != null && avail.availabilityPct < 90) {
      notableDowntimes.push(
        `${avail.designation}: Verfügbarkeit ${Number(avail.availabilityPct).toFixed(1)}% (T5: ${avail.t5Hours.toFixed(0)}h Störung)`
      );
    }
  }

  // Park address
  const parkAddress = [
    [park.street, park.houseNumber].filter(Boolean).join(" "),
    `${park.postalCode || ""} ${park.city || ""}`.trim()
  ].filter(Boolean).join(", ");

  // Cover image
  let coverImageUrl: string | null = null;
  if (park.reportCoverImageKey) {
    try {
      coverImageUrl = await getSignedUrl(park.reportCoverImageKey);
    } catch {
      // Graceful degradation — report renders without cover image
    }
  }

  // ---- CHART DATA (graceful — charts render only when data present) ----

  const chartFrom = new Date(year, month - 1, 1);
  const chartTo = new Date(year, month, 1);

  // Wind rose + wind distribution + power curve + daily profile in parallel
  const [windRoseRows, windRoseMetaRows, windDistRows, pcScatterRows, pcCurveRows, dailyRows] =
    await Promise.all([
      // Wind rose sectors
      prisma.$queryRaw<Array<{ direction_sector: string; speed_range: string; count: bigint }>>(Prisma.sql`
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
        WHERE "tenantId" = ${tenantId}
          AND "sourceFile" = 'WSD'
          AND "windDirection" IS NOT NULL AND "windSpeedMs" IS NOT NULL
          AND "turbineId" IN (${Prisma.join(turbineIds)})
          AND "timestamp" >= ${chartFrom} AND "timestamp" < ${chartTo}
        GROUP BY direction_sector, speed_range
      `),
      // Wind rose meta
      prisma.$queryRaw<Array<{ total_measurements: bigint; avg_wind_speed: number | null }>>(Prisma.sql`
        SELECT COUNT(*) AS total_measurements, AVG("windSpeedMs")::float AS avg_wind_speed
        FROM scada_measurements
        WHERE "tenantId" = ${tenantId}
          AND "sourceFile" = 'WSD'
          AND "windDirection" IS NOT NULL AND "windSpeedMs" IS NOT NULL
          AND "turbineId" IN (${Prisma.join(turbineIds)})
          AND "timestamp" >= ${chartFrom} AND "timestamp" < ${chartTo}
      `),
      // Wind distribution (1 m/s bins)
      prisma.$queryRaw<Array<{ bin_start: number; cnt: bigint }>>(Prisma.sql`
        SELECT FLOOR("windSpeedMs"::numeric)::int AS bin_start, COUNT(*) AS cnt
        FROM scada_measurements
        WHERE "tenantId" = ${tenantId}
          AND "sourceFile" = 'WSD'
          AND "windSpeedMs" IS NOT NULL AND "windSpeedMs" >= 0
          AND "turbineId" IN (${Prisma.join(turbineIds)})
          AND "timestamp" >= ${chartFrom} AND "timestamp" < ${chartTo}
        GROUP BY bin_start ORDER BY bin_start
      `),
      // Power curve scatter (random 500)
      prisma.$queryRaw<Array<{ wind_speed: number; power_kw: number }>>(Prisma.sql`
        SELECT "windSpeedMs"::float AS wind_speed, "powerW"::float / 1000.0 AS power_kw
        FROM scada_measurements
        WHERE "tenantId" = ${tenantId}
          AND "sourceFile" = 'WSD'
          AND "powerW" IS NOT NULL AND "windSpeedMs" IS NOT NULL AND "powerW" > 0
          AND "turbineId" IN (${Prisma.join(turbineIds)})
          AND "timestamp" >= ${chartFrom} AND "timestamp" < ${chartTo}
        ORDER BY RANDOM() LIMIT 500
      `),
      // Power curve mean (0.5 m/s bins)
      prisma.$queryRaw<Array<{ wind_speed: number; avg_power_kw: number; cnt: bigint }>>(Prisma.sql`
        SELECT ROUND("windSpeedMs"::numeric * 2) / 2 AS wind_speed,
               AVG("powerW")::float / 1000.0 AS avg_power_kw,
               COUNT(*) AS cnt
        FROM scada_measurements
        WHERE "tenantId" = ${tenantId}
          AND "sourceFile" = 'WSD'
          AND "powerW" IS NOT NULL AND "windSpeedMs" IS NOT NULL AND "powerW" > 0
          AND "turbineId" IN (${Prisma.join(turbineIds)})
          AND "timestamp" >= ${chartFrom} AND "timestamp" < ${chartTo}
        GROUP BY ROUND("windSpeedMs"::numeric * 2) / 2
        ORDER BY wind_speed
      `),
      // Daily profile (avg by time-of-day)
      prisma.$queryRaw<Array<{ time_slot: string; avg_power_kw: number; avg_wind_speed: number | null }>>(Prisma.sql`
        SELECT TO_CHAR("timestamp", 'HH24:MI') AS time_slot,
               AVG("powerW")::float / 1000.0 AS avg_power_kw,
               AVG("windSpeedMs")::float AS avg_wind_speed
        FROM scada_measurements
        WHERE "tenantId" = ${tenantId}
          AND "sourceFile" = 'WSD'
          AND "powerW" IS NOT NULL
          AND "turbineId" IN (${Prisma.join(turbineIds)})
          AND "timestamp" >= ${chartFrom} AND "timestamp" < ${chartTo}
        GROUP BY TO_CHAR("timestamp", 'HH24:MI')
        ORDER BY time_slot
      `),
    ]);

  // Build wind rose data
  const DIRECTION_SECTORS = [
    { label: "N", deg: 0 }, { label: "NNE", deg: 22.5 }, { label: "NE", deg: 45 },
    { label: "ENE", deg: 67.5 }, { label: "E", deg: 90 }, { label: "ESE", deg: 112.5 },
    { label: "SE", deg: 135 }, { label: "SSE", deg: 157.5 }, { label: "S", deg: 180 },
    { label: "SSW", deg: 202.5 }, { label: "SW", deg: 225 }, { label: "WSW", deg: 247.5 },
    { label: "W", deg: 270 }, { label: "WNW", deg: 292.5 }, { label: "NW", deg: 315 },
    { label: "NNW", deg: 337.5 },
  ];
  const SPEED_RANGES = ["0-3", "3-6", "6-9", "9-12", "12-15", "15+"];

  const wrCountMap = new Map<string, Map<string, number>>();
  for (const row of windRoseRows) {
    if (!row.direction_sector) continue;
    if (!wrCountMap.has(row.direction_sector)) wrCountMap.set(row.direction_sector, new Map());
    wrCountMap.get(row.direction_sector)!.set(row.speed_range, Number(row.count));
  }

  const wrMeta = windRoseMetaRows[0];
  const totalMeasurements = Number(wrMeta?.total_measurements ?? 0);

  let windRose: MonthlyReportData["windRose"] = undefined;
  if (totalMeasurements > 0) {
    const dirTotals: Record<string, number> = {};
    const wrData = DIRECTION_SECTORS.map((sec) => {
      const speedMap = wrCountMap.get(sec.label);
      let total = 0;
      const speedRanges = SPEED_RANGES.map((range) => {
        const cnt = speedMap?.get(range) ?? 0;
        total += cnt;
        return { range, count: cnt };
      });
      dirTotals[sec.label] = total;
      return { direction: sec.label, directionDeg: sec.deg, total, speedRanges };
    });

    let dominant = "N"; let maxDir = 0;
    for (const [dir, t] of Object.entries(dirTotals)) {
      if (t > maxDir) { maxDir = t; dominant = dir; }
    }

    windRose = {
      data: wrData,
      meta: {
        totalMeasurements,
        avgWindSpeed: wrMeta?.avg_wind_speed ? Math.round(wrMeta.avg_wind_speed * 100) / 100 : null,
        dominantDirection: dominant,
      },
    };
  }

  // Build wind distribution
  const totalWindObs = windDistRows.reduce((s, r) => s + Number(r.cnt), 0);
  const windDistribution: MonthlyReportData["windDistribution"] = totalWindObs > 0
    ? windDistRows.map((r) => ({
        binStart: Number(r.bin_start),
        binEnd: Number(r.bin_start) + 1,
        count: Number(r.cnt),
        percentage: (Number(r.cnt) / totalWindObs) * 100,
      }))
    : undefined;

  // Build power curve
  const powerCurve: MonthlyReportData["powerCurve"] =
    pcScatterRows.length > 0 || pcCurveRows.length > 0
      ? {
          scatter: pcScatterRows.map((r) => ({
            windSpeed: Number(r.wind_speed),
            powerKw: Number(r.power_kw),
          })),
          curve: pcCurveRows.map((r) => ({
            windSpeed: Number(r.wind_speed),
            avgPowerKw: Number(r.avg_power_kw),
            count: Number(r.cnt),
          })),
          ratedPowerKw: totalRatedPowerKw > 0 ? totalRatedPowerKw : null,
        }
      : undefined;

  // Build daily profile
  const dailyProfile: MonthlyReportData["dailyProfile"] = dailyRows.length > 0
    ? dailyRows.map((r) => ({
        timeSlot: r.time_slot,
        avgPowerKw: Number(r.avg_power_kw),
        avgWindSpeed: r.avg_wind_speed != null ? Number(r.avg_wind_speed) : null,
      }))
    : undefined;

  return {
    parkName: park.name,
    parkAddress: parkAddress || null,
    fundName: park.fundParks[0]?.fund?.name || null,
    operatorName: park.operatorFund?.name || null,
    year,
    month,
    monthName: MONTH_NAMES[month - 1],
    totalProductionMwh,
    avgAvailabilityPct,
    avgWindSpeedMs,
    specificYieldKwhPerKw,
    totalRevenueEur,
    prevYearProductionMwh: prevTotalProductionMwh,
    prevYearAvailabilityPct: prevAvgAvailabilityPct,
    prevYearWindSpeedMs: prevAvgWindSpeedMs,
    prevYearRevenueEur: prevRevenueEur,
    turbineProduction,
    turbineAvailability,
    serviceEvents: serviceEventRows,
    notableDowntimes,
    coverImageUrl,
    windRose,
    windDistribution,
    powerCurve,
    dailyProfile,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a monthly report PDF
 */
export async function generateMonthlyReportPdf(
  parkId: string,
  year: number,
  month: number,
  tenantId: string,
  sections?: MonthlyReportSections
): Promise<Buffer> {
  // Fetch data
  const data = await fetchMonthlyReportData(parkId, year, month, tenantId);
  if (sections) data.sections = sections;

  // Resolve template and letterhead
  // Use SETTLEMENT_REPORT as the closest document type for reports
  const { template, letterhead } = await resolveTemplateAndLetterhead(
    tenantId,
    "SETTLEMENT_REPORT",
    parkId
  );

  // Render PDF
  const pdfBuffer = await renderToBuffer(
    <MonthlyReportTemplate data={data} template={template} letterhead={letterhead} />
  );

  return applyLetterheadBackground(pdfBuffer, letterhead);
}

/**
 * Generate a monthly report PDF as Base64 string (for preview)
 */
export async function generateMonthlyReportPdfBase64(
  parkId: string,
  year: number,
  month: number,
  tenantId: string,
  sections?: MonthlyReportSections
): Promise<string> {
  const buffer = await generateMonthlyReportPdf(parkId, year, month, tenantId, sections);
  return buffer.toString("base64");
}

/**
 * Generate a filename for the monthly report
 */
export function getMonthlyReportFilename(
  parkName: string,
  year: number,
  month: number
): string {
  const sanitizedParkName = parkName
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 30);
  const monthStr = month.toString().padStart(2, "0");
  return `Monatsbericht_${sanitizedParkName}_${year}_${monthStr}.pdf`;
}
