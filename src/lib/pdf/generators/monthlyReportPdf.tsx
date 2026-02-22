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
        where: { status: "ACTIVE" },
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
      operatingHours: prod?.operatingHours ? Number(prod.operatingHours) : null,
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
        `${avail.designation}: Verfuegbarkeit ${Number(avail.availabilityPct).toFixed(1)}% (T5: ${avail.t5Hours.toFixed(0)}h Stoerung)`
      );
    }
  }

  // Park address
  const parkAddress = [
    [park.street, park.houseNumber].filter(Boolean).join(" "),
    `${park.postalCode || ""} ${park.city || ""}`.trim()
  ].filter(Boolean).join(", ");

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
  tenantId: string
): Promise<Buffer> {
  // Fetch data
  const data = await fetchMonthlyReportData(parkId, year, month, tenantId);

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
  tenantId: string
): Promise<string> {
  const buffer = await generateMonthlyReportPdf(parkId, year, month, tenantId);
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
