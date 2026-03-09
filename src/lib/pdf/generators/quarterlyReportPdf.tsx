/**
 * Quarterly Report PDF Generator
 *
 * Fetches 3 months of data and renders the MonthlyReportTemplate
 * with periodType=QUARTERLY including monthly trend tables.
 */

import { renderToBuffer } from "@react-pdf/renderer";
import {
  MonthlyReportTemplate,
  type MonthlyReportData,
  type TurbineProductionRow,
  type TurbineAvailabilityRow,
  type ServiceEventRow,
  type MonthlyTrendEntry,
  type TurbineMonthlyProduction,
} from "../templates/MonthlyReportTemplate";
import { resolveTemplateAndLetterhead, applyLetterheadBackground } from "../utils/templateResolver";
import { prisma } from "@/lib/prisma";
import { getSignedUrl } from "@/lib/storage";

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const MONTH_SHORT = [
  "Jan", "Feb", "Mrz", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

const QUARTER_LABELS: Record<number, { name: string; months: number[] }> = {
  1: { name: "Q1", months: [1, 2, 3] },
  2: { name: "Q2", months: [4, 5, 6] },
  3: { name: "Q3", months: [7, 8, 9] },
  4: { name: "Q4", months: [10, 11, 12] },
};

function hoursInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate() * 24;
}

/**
 * Fetch quarterly report data
 */
async function fetchQuarterlyReportData(
  parkId: string,
  year: number,
  quarter: number,
  tenantId: string
): Promise<MonthlyReportData> {
  const q = QUARTER_LABELS[quarter];
  if (!q) throw new Error("Ungültiges Quartal (1-4)");

  const months = q.months;
  const startMonth = months[0];
  const endMonth = months[months.length - 1];

  // 1. Park with turbines
  const park = await prisma.park.findUnique({
    where: { id: parkId },
    include: {
      turbines: {
        where: { status: "ACTIVE" },
        orderBy: { designation: "asc" },
        select: { id: true, designation: true, ratedPowerKw: true },
      },
      fundParks: {
        include: { fund: { select: { name: true } } },
        take: 1,
      },
      operatorFund: { select: { name: true } },
    },
  });

  if (!park) throw new Error("Park nicht gefunden");

  const turbineIds = park.turbines.map((t) => t.id);

  // 2. Production data for the quarter (3 months)
  const productions = await prisma.turbineProduction.findMany({
    where: {
      turbineId: { in: turbineIds },
      year,
      month: { in: months },
      tenantId,
    },
    select: {
      turbineId: true,
      month: true,
      productionKwh: true,
      operatingHours: true,
      availabilityPct: true,
    },
  });

  // 3. SCADA availability (monthly records for 3 months)
  const monthStart = new Date(year, startMonth - 1, 1);
  const monthEnd = new Date(year, endMonth, 0);

  const availabilityData = await prisma.scadaAvailability.findMany({
    where: {
      turbineId: { in: turbineIds },
      date: { gte: monthStart, lte: monthEnd },
      periodType: "MONTHLY",
      tenantId,
    },
    select: {
      turbineId: true,
      date: true,
      t1: true, t2: true, t3: true, t4: true, t5: true, t6: true,
      availabilityPct: true,
    },
  });

  // 4. Wind data
  const windData = await prisma.scadaWindSummary.findMany({
    where: {
      turbineId: { in: turbineIds },
      date: { gte: monthStart, lte: monthEnd },
      periodType: "MONTHLY",
    },
    select: { turbineId: true, date: true, meanWindSpeed: true },
  });

  // 5. Revenue
  const settlements = await prisma.energySettlement.findMany({
    where: { parkId, year, month: { in: months }, tenantId },
    select: { month: true, netOperatorRevenueEur: true },
  });
  const settlementByMonth = new Map(
    settlements.filter((s) => s.month != null).map((s) => [s.month!, Number(s.netOperatorRevenueEur)])
  );

  // 6. Service events
  const serviceEvents = await prisma.serviceEvent.findMany({
    where: {
      turbine: { parkId },
      eventDate: {
        gte: monthStart,
        lte: new Date(year, endMonth, 0, 23, 59, 59),
      },
    },
    include: { turbine: { select: { designation: true } } },
    orderBy: { eventDate: "asc" },
  });

  // 7. Previous year data (same quarter)
  const prevProductions = await prisma.turbineProduction.findMany({
    where: {
      turbineId: { in: turbineIds },
      year: year - 1,
      month: { in: months },
      tenantId,
    },
    select: { productionKwh: true, availabilityPct: true },
  });

  const prevWindData = await prisma.scadaWindSummary.findMany({
    where: {
      turbineId: { in: turbineIds },
      date: {
        gte: new Date(year - 1, startMonth - 1, 1),
        lte: new Date(year - 1, endMonth, 0),
      },
      periodType: "MONTHLY",
    },
    select: { meanWindSpeed: true },
  });

  const prevSettlements = await prisma.energySettlement.findMany({
    where: { parkId, year: year - 1, month: { in: months }, tenantId },
    select: { netOperatorRevenueEur: true },
  });

  // ---- BUILD MONTHLY TREND ----

  const monthlyTrend: MonthlyTrendEntry[] = months.map((m) => {
    const mProds = productions.filter((p) => p.month === m);
    const mKwh = mProds.reduce((s, p) => s + Number(p.productionKwh), 0);
    const mAvail = mProds
      .map((p) => (p.availabilityPct ? Number(p.availabilityPct) : null))
      .filter((v): v is number => v != null);
    const mWind = windData
      .filter((w) => new Date(w.date).getMonth() + 1 === m)
      .map((w) => (w.meanWindSpeed ? Number(w.meanWindSpeed) : null))
      .filter((v): v is number => v != null);

    return {
      month: m,
      monthNameShort: MONTH_SHORT[m - 1],
      productionMwh: mKwh / 1000,
      avgAvailabilityPct: mAvail.length > 0
        ? mAvail.reduce((s, v) => s + v, 0) / mAvail.length : null,
      avgWindSpeedMs: mWind.length > 0
        ? mWind.reduce((s, v) => s + v, 0) / mWind.length : null,
      revenueEur: settlementByMonth.get(m) ?? null,
    };
  });

  // ---- BUILD TURBINE MONTHLY PRODUCTION ----

  const turbineMonthlyProduction: TurbineMonthlyProduction[] = park.turbines.map((turbine) => {
    const monthlyMwh = months.map((m) => {
      const p = productions.find((pr) => pr.turbineId === turbine.id && pr.month === m);
      return p ? Number(p.productionKwh) / 1000 : null;
    });
    const totalMwh: number = monthlyMwh.reduce<number>((acc, v) => acc + (v ?? 0), 0);
    return {
      turbineId: turbine.id,
      designation: turbine.designation,
      monthlyMwh,
      totalMwh,
    };
  });

  // ---- AGGREGATE QUARTER TOTALS ----

  const totalHoursInQuarter = months.reduce((s, m) => s + hoursInMonth(year, m), 0);

  const turbineProduction: TurbineProductionRow[] = park.turbines.map((turbine) => {
    const tProds = productions.filter((p) => p.turbineId === turbine.id);
    const totalKwh = tProds.reduce((s, p) => s + Number(p.productionKwh), 0);
    const totalMwh = totalKwh / 1000;
    const totalHours = tProds.reduce((s, p) => s + (p.operatingHours ? Number(p.operatingHours) : 0), 0);
    const availValues = tProds
      .map((p) => (p.availabilityPct ? Number(p.availabilityPct) : null))
      .filter((v): v is number => v != null);
    const avgAvail = availValues.length > 0
      ? availValues.reduce((s, v) => s + v, 0) / availValues.length : null;
    const ratedPowerKw = turbine.ratedPowerKw ? Number(turbine.ratedPowerKw) : null;
    const cf = ratedPowerKw && ratedPowerKw > 0
      ? (totalKwh / (ratedPowerKw * totalHoursInQuarter)) * 100 : null;

    return {
      turbineId: turbine.id,
      designation: turbine.designation,
      productionMwh: totalMwh,
      operatingHours: tProds.length > 0 ? totalHours : null,
      availabilityPct: avgAvail,
      capacityFactor: cf,
      ratedPowerKw,
    };
  });

  // Availability: sum T1-T6 across the 3 months
  const turbineAvailability: TurbineAvailabilityRow[] = park.turbines
    .map((turbine) => {
      const tAvails = availabilityData.filter((a) => a.turbineId === turbine.id);
      if (tAvails.length === 0) return null;
      const sum = (field: "t1" | "t2" | "t3" | "t4" | "t5" | "t6") =>
        tAvails.reduce((s, a) => s + a[field], 0) / 3600;
      const avgPct = tAvails
        .map((a) => (a.availabilityPct ? Number(a.availabilityPct) : null))
        .filter((v): v is number => v != null);
      return {
        turbineId: turbine.id,
        designation: turbine.designation,
        t1Hours: sum("t1"),
        t2Hours: sum("t2"),
        t3Hours: sum("t3"),
        t4Hours: sum("t4"),
        t5Hours: sum("t5"),
        t6Hours: sum("t6"),
        availabilityPct: avgPct.length > 0
          ? avgPct.reduce((s, v) => s + v, 0) / avgPct.length : null,
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

  // Aggregated KPIs
  const totalProductionMwh = turbineProduction.reduce((s, t) => s + t.productionMwh, 0);
  const availValues = turbineProduction
    .map((t) => t.availabilityPct)
    .filter((v): v is number => v != null);
  const avgAvailabilityPct = availValues.length > 0
    ? availValues.reduce((s, v) => s + v, 0) / availValues.length : null;

  const windValues = windData
    .map((w) => (w.meanWindSpeed ? Number(w.meanWindSpeed) : null))
    .filter((v): v is number => v != null);
  const avgWindSpeedMs = windValues.length > 0
    ? windValues.reduce((s, v) => s + v, 0) / windValues.length : null;

  const totalRatedKw = park.turbines.reduce(
    (s, t) => s + (t.ratedPowerKw ? Number(t.ratedPowerKw) : 0), 0
  );
  const specificYield = totalRatedKw > 0 ? (totalProductionMwh * 1000) / totalRatedKw : null;
  const totalRevenue = settlements.length > 0
    ? settlements.reduce((s, se) => s + Number(se.netOperatorRevenueEur), 0) : null;

  // Previous year
  const prevTotalKwh = prevProductions.reduce((s, p) => s + Number(p.productionKwh), 0);
  const prevTotalMwh = prevProductions.length > 0 ? prevTotalKwh / 1000 : null;
  const prevAvails = prevProductions
    .map((p) => (p.availabilityPct ? Number(p.availabilityPct) : null))
    .filter((v): v is number => v != null);
  const prevAvgAvail = prevAvails.length > 0
    ? prevAvails.reduce((s, v) => s + v, 0) / prevAvails.length : null;
  const prevWindVals = prevWindData
    .map((w) => (w.meanWindSpeed ? Number(w.meanWindSpeed) : null))
    .filter((v): v is number => v != null);
  const prevAvgWind = prevWindVals.length > 0
    ? prevWindVals.reduce((s, v) => s + v, 0) / prevWindVals.length : null;
  const prevTotalRev = prevSettlements.length > 0
    ? prevSettlements.reduce((s, se) => s + Number(se.netOperatorRevenueEur), 0) : null;

  // Notable downtimes
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
    `${park.postalCode || ""} ${park.city || ""}`.trim(),
  ].filter(Boolean).join(", ");

  const periodLabel = `${MONTH_NAMES[startMonth - 1]} – ${MONTH_NAMES[endMonth - 1]} ${year}`;

  // Cover image
  let coverImageUrl: string | null = null;
  if (park.reportCoverImageKey) {
    try {
      coverImageUrl = await getSignedUrl(park.reportCoverImageKey);
    } catch {
      // Graceful degradation
    }
  }

  return {
    parkName: park.name,
    parkAddress: parkAddress || null,
    fundName: park.fundParks[0]?.fund?.name || null,
    operatorName: park.operatorFund?.name || null,
    year,
    month: startMonth, // first month of quarter
    monthName: `${q.name} ${year}`,
    periodType: "QUARTERLY",
    periodLabel,
    totalProductionMwh,
    avgAvailabilityPct,
    avgWindSpeedMs,
    specificYieldKwhPerKw: specificYield,
    totalRevenueEur: totalRevenue,
    prevYearProductionMwh: prevTotalMwh,
    prevYearAvailabilityPct: prevAvgAvail,
    prevYearWindSpeedMs: prevAvgWind,
    prevYearRevenueEur: prevTotalRev,
    turbineProduction,
    turbineAvailability,
    serviceEvents: serviceEventRows,
    notableDowntimes,
    monthlyTrend,
    turbineMonthlyProduction,
    coverImageUrl,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a quarterly report PDF
 */
export async function generateQuarterlyReportPdf(
  parkId: string,
  year: number,
  quarter: number,
  tenantId: string
): Promise<Buffer> {
  const data = await fetchQuarterlyReportData(parkId, year, quarter, tenantId);

  const { template, letterhead } = await resolveTemplateAndLetterhead(
    tenantId,
    "SETTLEMENT_REPORT",
    parkId
  );

  const pdfBuffer = await renderToBuffer(
    <MonthlyReportTemplate data={data} template={template} letterhead={letterhead} />
  );

  return applyLetterheadBackground(pdfBuffer, letterhead);
}

/**
 * Generate a quarterly report PDF as Base64 (for preview)
 */
export async function generateQuarterlyReportPdfBase64(
  parkId: string,
  year: number,
  quarter: number,
  tenantId: string
): Promise<string> {
  const buffer = await generateQuarterlyReportPdf(parkId, year, quarter, tenantId);
  return buffer.toString("base64");
}

/**
 * Generate a filename for the quarterly report
 */
export function getQuarterlyReportFilename(
  parkName: string,
  year: number,
  quarter: number
): string {
  const sanitized = parkName
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 30);
  return `Quartalsbericht_${sanitized}_${year}_Q${quarter}.pdf`;
}
