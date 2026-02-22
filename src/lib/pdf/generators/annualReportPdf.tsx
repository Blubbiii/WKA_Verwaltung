/**
 * Annual Report PDF Generator
 *
 * Fetches all necessary data from the database and renders
 * the AnnualReportTemplate into a PDF buffer.
 */

import { renderToBuffer } from "@react-pdf/renderer";
import {
  AnnualReportTemplate,
  type AnnualReportData,
  type MonthlyTrendRow,
  type TurbineAnnualRow,
  type ServiceEventSummaryRow,
  type NotableEventRow,
} from "../templates/AnnualReportTemplate";
import type { TopologyTurbine } from "../templates/components/PdfNetworkTopology";
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
 * Translate event type to German label
 */
function translateEventType(type: string): string {
  const translations: Record<string, string> = {
    MAINTENANCE: "Wartung",
    REPAIR: "Reparatur",
    INSPECTION: "Inspektion",
    COMMISSIONING: "Inbetriebnahme",
    DECOMMISSIONING: "Stilllegung",
    INCIDENT: "Vorfall",
    GRID_OUTAGE: "Netzausfall",
    CURTAILMENT: "Abregelung",
    OTHER: "Sonstiges",
  };
  return translations[type] || type;
}

/**
 * Calculate hours in a year (accounting for leap years)
 */
function hoursInYear(year: number): number {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isLeap ? 8784 : 8760;
}

/**
 * Fetch annual report data from the database
 */
async function fetchAnnualReportData(
  parkId: string,
  year: number,
  tenantId: string
): Promise<AnnualReportData> {
  // 1. Park with turbines
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
      billingEntityFund: {
        select: { name: true, legalForm: true },
      },
    },
  });

  if (!park) throw new Error("Park nicht gefunden");

  // 1b. Topology data (separate query with expanded relations for Netz-Topologie)
  const topologyTurbinesRaw = await prisma.turbine.findMany({
    where: { parkId, status: "ACTIVE" },
    orderBy: { designation: "asc" },
    select: {
      id: true,
      designation: true,
      ratedPowerKw: true,
      status: true,
      netzgesellschaftFundId: true,
      netzgesellschaftFund: {
        select: {
          id: true,
          name: true,
          legalForm: true,
          fundCategory: { select: { color: true } },
          childHierarchies: {
            select: { ownershipPercentage: true, childFundId: true },
          },
        },
      },
      operatorHistory: {
        where: { status: "ACTIVE" },
        select: {
          ownershipPercentage: true,
          operatorFund: {
            select: {
              id: true,
              name: true,
              legalForm: true,
              fundCategory: { select: { color: true } },
            },
          },
        },
        take: 1,
      },
    },
  });

  // Map to TopologyTurbine shape (convert Decimal → number)
  const topologyTurbines: TopologyTurbine[] = topologyTurbinesRaw.map((t) => ({
    id: t.id,
    designation: t.designation,
    ratedPowerKw: t.ratedPowerKw ? Number(t.ratedPowerKw) : null,
    status: t.status,
    netzgesellschaftFundId: t.netzgesellschaftFundId,
    netzgesellschaftFund: t.netzgesellschaftFund
      ? {
          id: t.netzgesellschaftFund.id,
          name: t.netzgesellschaftFund.name,
          legalForm: t.netzgesellschaftFund.legalForm,
          fundCategory: t.netzgesellschaftFund.fundCategory,
          childHierarchies: t.netzgesellschaftFund.childHierarchies.map((h) => ({
            ownershipPercentage: h.ownershipPercentage ? Number(h.ownershipPercentage) : null,
            childFundId: h.childFundId,
          })),
        }
      : null,
    operatorHistory: t.operatorHistory.map((oh) => ({
      ownershipPercentage: oh.ownershipPercentage ? Number(oh.ownershipPercentage) : null,
      operatorFund: {
        id: oh.operatorFund.id,
        name: oh.operatorFund.name,
        legalForm: oh.operatorFund.legalForm,
        fundCategory: oh.operatorFund.fundCategory,
      },
    })),
  }));

  const turbineIds = park.turbines.map((t) => t.id);
  const yearHours = hoursInYear(year);

  // 2. All production data for the year (all 12 months)
  const productions = await prisma.turbineProduction.findMany({
    where: {
      turbineId: { in: turbineIds },
      year,
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

  // 3. Wind data for the year
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);

  const windData = await prisma.scadaWindSummary.findMany({
    where: {
      turbineId: { in: turbineIds },
      date: { gte: yearStart, lte: yearEnd },
      periodType: "MONTHLY",
    },
    select: {
      turbineId: true,
      date: true,
      meanWindSpeed: true,
    },
  });

  // 4. Energy settlements for the year (per month)
  const settlements = await prisma.energySettlement.findMany({
    where: {
      parkId,
      year,
      tenantId,
    },
    select: {
      month: true,
      netOperatorRevenueEur: true,
    },
  });

  const settlementByMonth = new Map(
    settlements
      .filter((s) => s.month != null)
      .map((s) => [s.month!, Number(s.netOperatorRevenueEur)])
  );

  // 5. Service events for the year
  const serviceEvents = await prisma.serviceEvent.findMany({
    where: {
      turbine: { parkId },
      eventDate: {
        gte: yearStart,
        lte: new Date(year, 11, 31, 23, 59, 59),
      },
    },
    include: {
      turbine: { select: { designation: true } },
    },
    orderBy: { eventDate: "asc" },
  });

  // 6. Previous year data
  const prevProductions = await prisma.turbineProduction.findMany({
    where: {
      turbineId: { in: turbineIds },
      year: year - 1,
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
        gte: new Date(year - 1, 0, 1),
        lte: new Date(year - 1, 11, 31),
      },
      periodType: "MONTHLY",
    },
    select: {
      meanWindSpeed: true,
    },
  });

  const prevSettlements = await prisma.energySettlement.findMany({
    where: {
      parkId,
      year: year - 1,
      tenantId,
    },
    select: {
      netOperatorRevenueEur: true,
    },
  });

  // ---- BUILD MONTHLY TREND ----

  const monthlyTrend: MonthlyTrendRow[] = [];
  for (let m = 1; m <= 12; m++) {
    const monthProductions = productions.filter((p) => p.month === m);
    const monthProductionKwh = monthProductions.reduce(
      (s, p) => s + Number(p.productionKwh),
      0
    );
    const monthOperatingHours = monthProductions.reduce(
      (s, p) => s + (p.operatingHours ? Number(p.operatingHours) : 0),
      0
    );
    const monthAvailValues = monthProductions
      .map((p) => (p.availabilityPct ? Number(p.availabilityPct) : null))
      .filter((v): v is number => v != null);
    const monthAvgAvailability =
      monthAvailValues.length > 0
        ? monthAvailValues.reduce((s, v) => s + v, 0) / monthAvailValues.length
        : null;

    // Wind for this month
    const monthWindValues = windData
      .filter((w) => {
        const d = new Date(w.date);
        return d.getMonth() + 1 === m;
      })
      .map((w) => (w.meanWindSpeed ? Number(w.meanWindSpeed) : null))
      .filter((v): v is number => v != null);
    const monthAvgWind =
      monthWindValues.length > 0
        ? monthWindValues.reduce((s, v) => s + v, 0) / monthWindValues.length
        : null;

    monthlyTrend.push({
      month: m,
      monthName: MONTH_NAMES[m - 1],
      productionMwh: monthProductionKwh / 1000,
      avgWindSpeedMs: monthAvgWind,
      avgAvailabilityPct: monthAvgAvailability,
      operatingHours: monthProductions.length > 0 ? monthOperatingHours : null,
      revenueEur: settlementByMonth.get(m) ?? null,
    });
  }

  // ---- BUILD TURBINE PERFORMANCE ----

  const turbinePerformance: TurbineAnnualRow[] = park.turbines.map((turbine) => {
    const turbineProds = productions.filter((p) => p.turbineId === turbine.id);
    const totalKwh = turbineProds.reduce((s, p) => s + Number(p.productionKwh), 0);
    const totalMwh = totalKwh / 1000;
    const totalHours = turbineProds.reduce(
      (s, p) => s + (p.operatingHours ? Number(p.operatingHours) : 0),
      0
    );
    const availValues = turbineProds
      .map((p) => (p.availabilityPct ? Number(p.availabilityPct) : null))
      .filter((v): v is number => v != null);
    const avgAvail =
      availValues.length > 0
        ? availValues.reduce((s, v) => s + v, 0) / availValues.length
        : null;

    const ratedPowerKw = turbine.ratedPowerKw ? Number(turbine.ratedPowerKw) : null;
    const capacityFactor =
      ratedPowerKw && ratedPowerKw > 0
        ? (totalKwh / (ratedPowerKw * yearHours)) * 100
        : null;
    const specificYield =
      ratedPowerKw && ratedPowerKw > 0 ? totalKwh / ratedPowerKw : null;

    return {
      turbineId: turbine.id,
      designation: turbine.designation,
      totalProductionMwh: totalMwh,
      totalOperatingHours: turbineProds.length > 0 ? totalHours : null,
      avgAvailabilityPct: avgAvail,
      capacityFactor,
      ratedPowerKw,
      specificYield,
    };
  });

  // Best/worst turbines
  const sortedByProd = [...turbinePerformance].sort(
    (a, b) => b.totalProductionMwh - a.totalProductionMwh
  );
  const bestTurbine =
    sortedByProd.length > 0
      ? {
          designation: sortedByProd[0].designation,
          productionMwh: sortedByProd[0].totalProductionMwh,
        }
      : null;
  const worstTurbine =
    sortedByProd.length > 1
      ? {
          designation: sortedByProd[sortedByProd.length - 1].designation,
          productionMwh: sortedByProd[sortedByProd.length - 1].totalProductionMwh,
        }
      : null;

  // ---- AGGREGATE KPIs ----

  const totalProductionMwh = turbinePerformance.reduce(
    (s, t) => s + t.totalProductionMwh,
    0
  );
  const allAvailValues = turbinePerformance
    .map((t) => t.avgAvailabilityPct)
    .filter((v): v is number => v != null);
  const avgAvailabilityPct =
    allAvailValues.length > 0
      ? allAvailValues.reduce((s, v) => s + v, 0) / allAvailValues.length
      : null;

  const allWindValues = windData
    .map((w) => (w.meanWindSpeed ? Number(w.meanWindSpeed) : null))
    .filter((v): v is number => v != null);
  const avgWindSpeedMs =
    allWindValues.length > 0
      ? allWindValues.reduce((s, v) => s + v, 0) / allWindValues.length
      : null;

  const totalOperatingHours = turbinePerformance.reduce(
    (s, t) => s + (t.totalOperatingHours ?? 0),
    0
  );

  const totalRatedPowerKw = park.turbines.reduce(
    (s, t) => s + (t.ratedPowerKw ? Number(t.ratedPowerKw) : 0),
    0
  );
  const specificYieldKwhPerKw =
    totalRatedPowerKw > 0 ? (totalProductionMwh * 1000) / totalRatedPowerKw : null;

  const totalRevenueEur = settlements.length > 0
    ? settlements.reduce((s, se) => s + Number(se.netOperatorRevenueEur), 0)
    : null;

  const avgRevenuePerKwh =
    totalRevenueEur != null && totalProductionMwh > 0
      ? totalRevenueEur / (totalProductionMwh * 1000)
      : null;

  // ---- PREVIOUS YEAR ----

  const prevTotalKwh = prevProductions.reduce(
    (s, p) => s + Number(p.productionKwh),
    0
  );
  const prevTotalMwh = prevProductions.length > 0 ? prevTotalKwh / 1000 : null;

  const prevAvailValues = prevProductions
    .map((p) => (p.availabilityPct ? Number(p.availabilityPct) : null))
    .filter((v): v is number => v != null);
  const prevAvgAvail =
    prevAvailValues.length > 0
      ? prevAvailValues.reduce((s, v) => s + v, 0) / prevAvailValues.length
      : null;

  const prevWindValues = prevWindData
    .map((w) => (w.meanWindSpeed ? Number(w.meanWindSpeed) : null))
    .filter((v): v is number => v != null);
  const prevAvgWind =
    prevWindValues.length > 0
      ? prevWindValues.reduce((s, v) => s + v, 0) / prevWindValues.length
      : null;

  const prevTotalRevenue =
    prevSettlements.length > 0
      ? prevSettlements.reduce((s, se) => s + Number(se.netOperatorRevenueEur), 0)
      : null;

  const prevYear =
    prevTotalMwh != null ||
    prevAvgAvail != null ||
    prevAvgWind != null ||
    prevTotalRevenue != null
      ? {
          totalProductionMwh: prevTotalMwh,
          avgAvailabilityPct: prevAvgAvail,
          avgWindSpeedMs: prevAvgWind,
          totalRevenueEur: prevTotalRevenue,
        }
      : null;

  // ---- SERVICE EVENTS ----

  // Group by event type
  const eventTypeMap = new Map<
    string,
    { count: number; totalDuration: number; totalCost: number }
  >();
  let totalDuration = 0;
  let totalCost = 0;
  let hasCost = false;

  for (const event of serviceEvents) {
    const type = event.eventType;
    const existing = eventTypeMap.get(type) || { count: 0, totalDuration: 0, totalCost: 0 };
    existing.count += 1;
    const dur = event.durationHours ? Number(event.durationHours) : 0;
    existing.totalDuration += dur;
    totalDuration += dur;
    if (event.cost) {
      const c = Number(event.cost);
      existing.totalCost += c;
      totalCost += c;
      hasCost = true;
    }
    eventTypeMap.set(type, existing);
  }

  const serviceEventSummary: ServiceEventSummaryRow[] = Array.from(eventTypeMap.entries())
    .map(([type, data]) => ({
      eventType: type,
      eventTypeLabel: translateEventType(type),
      count: data.count,
      totalDurationHours: data.totalDuration,
      totalCost: hasCost ? data.totalCost : null,
      percentageOfTotal:
        serviceEvents.length > 0 ? (data.count / serviceEvents.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Notable events (long duration or high cost)
  const notableEvents: NotableEventRow[] = serviceEvents
    .filter((e) => {
      const dur = e.durationHours ? Number(e.durationHours) : 0;
      const cost = e.cost ? Number(e.cost) : 0;
      return dur >= 24 || cost >= 5000 || e.eventType === "INCIDENT";
    })
    .slice(0, 20)
    .map((e) => ({
      id: e.id,
      eventDate: e.eventDate,
      eventType: e.eventType,
      turbineDesignation: e.turbine.designation,
      description: e.description,
      durationHours: e.durationHours ? Number(e.durationHours) : null,
    }));

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
    totalProductionMwh,
    avgAvailabilityPct,
    avgWindSpeedMs,
    totalOperatingHours: productions.length > 0 ? totalOperatingHours : null,
    specificYieldKwhPerKw,
    totalRevenueEur,
    avgRevenuePerKwh,
    prevYear,
    monthlyTrend,
    turbinePerformance,
    bestTurbine,
    worstTurbine,
    hasFinancialData: settlements.length > 0,
    serviceEventSummary,
    notableEvents,
    totalServiceEvents: serviceEvents.length,
    totalServiceDurationHours: totalDuration,
    totalServiceCost: hasCost ? totalCost : null,
    generatedAt: new Date().toISOString(),

    // Topology
    topologyTurbines,
    billingEntityName: park.billingEntityFund
      ? `${park.billingEntityFund.name}${park.billingEntityFund.legalForm ? ` ${park.billingEntityFund.legalForm}` : ""}`
      : null,
  };
}

/**
 * Generate an annual report PDF
 */
export async function generateAnnualReportPdf(
  parkId: string,
  year: number,
  tenantId: string
): Promise<Buffer> {
  // Fetch data
  const data = await fetchAnnualReportData(parkId, year, tenantId);

  // Resolve template and letterhead
  const { template, letterhead } = await resolveTemplateAndLetterhead(
    tenantId,
    "SETTLEMENT_REPORT",
    parkId
  );

  // Render PDF
  const pdfBuffer = await renderToBuffer(
    <AnnualReportTemplate data={data} template={template} letterhead={letterhead} />
  );

  return applyLetterheadBackground(pdfBuffer, letterhead);
}

/**
 * Generate an annual report PDF as Base64 string (for preview)
 */
export async function generateAnnualReportPdfBase64(
  parkId: string,
  year: number,
  tenantId: string
): Promise<string> {
  const buffer = await generateAnnualReportPdf(parkId, year, tenantId);
  return buffer.toString("base64");
}

/**
 * Generate a filename for the annual report
 */
export function getAnnualReportFilename(
  parkName: string,
  year: number
): string {
  const sanitizedParkName = parkName
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 30);
  return `Jahresbericht_${sanitizedParkName}_${year}.pdf`;
}
