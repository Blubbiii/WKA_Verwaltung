/**
 * Ausfallarbeit und Forderung eines Abregelungsereignisses ermitteln.
 *
 * A4 (Audit 2026-07). Die Regeln stehen in `compensation.ts` — hier steht nur
 * die Beschaffung.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  computeLostWorkFromSignal,
  computeCompensation,
  type CurtailmentSample,
  type LegalBasis,
} from "./compensation";
import { apiLogger as logger } from "@/lib/logger";

/** SCADA liefert Zehnminutenwerte. */
const INTERVAL_MINUTES = 10;

export interface EventComputation {
  lostWorkKwh: number | null;
  lostWorkMethod: "CONTROLLER_SIGNAL" | null;
  lostWorkBasis: Record<string, unknown> | null;
  ratePerKwh: number | null;
  rateSource: string | null;
  lostRevenueEur: number | null;
  portionAt95Eur: number | null;
  portionAt100Eur: number | null;
  claimEur: number | null;
  annualRevenueBasisEur: number | null;
  priorLostRevenueInYearEur: number | null;
  warnings: string[];
  /** Warum nichts gerechnet werden konnte. */
  reason?: string;
}

export async function computeCurtailmentEvent(input: {
  tenantId: string;
  eventId: string;
}): Promise<EventComputation> {
  const { tenantId, eventId } = input;

  const event = await prisma.curtailmentEvent.findFirst({
    where: { id: eventId, tenantId },
    select: {
      id: true,
      parkId: true,
      turbineId: true,
      startAt: true,
      endAt: true,
      legalBasis: true,
      additionalExpensesEur: true,
      savedExpensesEur: true,
    },
  });

  if (!event) {
    return empty("Ereignis nicht gefunden");
  }

  if (!event.endAt) {
    // Ohne Ende gibt es kein abgeschlossenes Fenster. Eine laufende Abregelung
    // „bis jetzt" zu bewerten ergäbe eine Zahl, die beim nächsten Klick anders
    // ausfällt — und trotzdem als Forderung im Datensatz stünde.
    return empty("Das Ereignis hat kein Ende. Erst danach lässt sich die Ausfallarbeit beziffern.");
  }

  // Betroffene Anlagen: eine einzelne oder der ganze Park.
  const turbines = event.turbineId
    ? [{ id: event.turbineId }]
    : await prisma.turbine.findMany({
        where: { parkId: event.parkId, park: { tenantId } },
        select: { id: true },
      });

  if (turbines.length === 0) {
    return empty("Keine Anlagen zum Ereignis gefunden");
  }

  const samples = await loadCurtailmentSamples(
    tenantId,
    turbines.map((t) => t.id),
    event.startAt,
    event.endAt,
  );

  const work = computeLostWorkFromSignal(samples, { intervalMinutes: INTERVAL_MINUTES });

  if (work.lostWorkKwh === null) {
    return empty(work.reason);
  }

  const rate = await findRate(tenantId, event.startAt);

  if (rate === null) {
    // Menge ohne Bewertung ist ein brauchbarer Zwischenstand — eine Forderung
    // von 0 EUR wäre es nicht.
    return {
      lostWorkKwh: work.lostWorkKwh,
      lostWorkMethod: "CONTROLLER_SIGNAL",
      lostWorkBasis: {
        intervalCount: work.intervalCount,
        turbineCount: turbines.length,
        windowStart: event.startAt.toISOString(),
        windowEnd: event.endAt.toISOString(),
        warnings: work.warnings,
      },
      ratePerKwh: null,
      rateSource: null,
      lostRevenueEur: null,
      portionAt95Eur: null,
      portionAt100Eur: null,
      claimEur: null,
      annualRevenueBasisEur: null,
      priorLostRevenueInYearEur: null,
      warnings: [
        ...work.warnings,
        "Kein Vergütungssatz für den Monat hinterlegt — Ausfallarbeit ermittelt, Bewertung offen.",
      ],
    };
  }

  const year = event.startAt.getFullYear();
  const [priorLostRevenue, annualRevenue] = await Promise.all([
    sumPriorLostRevenue(tenantId, event.parkId, year, event.startAt, eventId),
    sumAnnualRevenue(tenantId, event.parkId, year),
  ]);

  const compensation = computeCompensation({
    legalBasis: event.legalBasis as LegalBasis,
    lostWorkKwh: work.lostWorkKwh,
    ratePerKwh: rate.ratePerKwh,
    priorLostRevenueEurInYear: priorLostRevenue,
    annualRevenueEur: annualRevenue,
    additionalExpensesEur: toNumber(event.additionalExpensesEur) ?? 0,
    savedExpensesEur: toNumber(event.savedExpensesEur) ?? 0,
  });

  logger.info(
    { eventId, lostWorkKwh: work.lostWorkKwh, claimEur: compensation.claimEur },
    "[Curtailment] Forderung ermittelt",
  );

  return {
    lostWorkKwh: work.lostWorkKwh,
    lostWorkMethod: "CONTROLLER_SIGNAL",
    lostWorkBasis: {
      intervalCount: work.intervalCount,
      turbineCount: turbines.length,
      windowStart: event.startAt.toISOString(),
      windowEnd: event.endAt.toISOString(),
      thresholdEur: compensation.thresholdEur,
      thresholdCrossed: compensation.thresholdCrossed,
      warnings: [...work.warnings, ...compensation.warnings],
    },
    ratePerKwh: rate.ratePerKwh,
    rateSource: rate.source,
    lostRevenueEur: compensation.lostRevenueEur,
    portionAt95Eur: compensation.portionAt95Eur,
    portionAt100Eur: compensation.portionAt100Eur,
    claimEur: compensation.claimEur,
    annualRevenueBasisEur: annualRevenue,
    priorLostRevenueInYearEur: priorLostRevenue,
    warnings: [...work.warnings, ...compensation.warnings],
  };
}

/** Abregelungssignale aller betroffenen Anlagen im Fenster. */
async function loadCurtailmentSamples(
  tenantId: string,
  turbineIds: string[],
  from: Date,
  to: Date,
): Promise<CurtailmentSample[]> {
  const rows = await prisma.scadaMeasurement.findMany({
    where: {
      tenantId,
      turbineId: { in: turbineIds },
      timestamp: { gte: from, lte: to },
    },
    select: { timestamp: true, powerExternalKw: true, powerForcedKw: true },
    orderBy: { timestamp: "asc" },
  });

  return rows.map((row) => ({
    timestamp: row.timestamp,
    powerExternalKw: toNumber(row.powerExternalKw),
    powerForcedKw: toNumber(row.powerForcedKw),
  }));
}

/**
 * Bereits im Jahr aufgelaufene entgangene Einnahmen desselben Parks.
 *
 * Die 1-%-Schwelle des § 15 EEG läuft über das Kalenderjahr — ohne diese
 * Summe wäre jedes Ereignis für sich unter der Schwelle und die 100-%-Quote
 * käme nie zum Tragen.
 *
 * Gezählt wird, was VOR diesem Ereignis begann. Das eigene Ereignis wird
 * ausgeschlossen, sonst zählte eine erneute Berechnung sich selbst mit.
 */
async function sumPriorLostRevenue(
  tenantId: string,
  parkId: string,
  year: number,
  before: Date,
  excludeEventId: string,
): Promise<number> {
  const result = await prisma.curtailmentEvent.aggregate({
    where: {
      tenantId,
      parkId,
      id: { not: excludeEventId },
      startAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: before },
      legalBasis: "EEG_15",
    },
    _sum: { lostRevenueEur: true },
  });
  return toNumber(result._sum.lostRevenueEur) ?? 0;
}

/**
 * Einnahmen des Parks im Kalenderjahr, gegen die die Schwelle läuft.
 *
 * Quelle sind die Netzbetreiber-Abrechnungen. Solange das Jahr läuft, ist die
 * Summe unvollständig — die Schwelle wird dadurch zu niedrig angesetzt und die
 * 100-%-Quote zu früh erreicht. Das ist die für den Betreiber günstigere
 * Richtung, weshalb der Wert am Datensatz steht und nach Jahresabschluss neu
 * bewertet gehört.
 */
async function sumAnnualRevenue(
  tenantId: string,
  parkId: string,
  year: number,
): Promise<number | null> {
  const result = await prisma.energySettlement.aggregate({
    where: { tenantId, parkId, year },
    _sum: { netOperatorRevenueEur: true },
    _count: true,
  });
  if (result._count === 0) return null;
  return toNumber(result._sum.netOperatorRevenueEur);
}

async function findRate(
  tenantId: string,
  reference: Date,
): Promise<{ ratePerKwh: number; source: string } | null> {
  const year = reference.getFullYear();
  const month = reference.getMonth() + 1;

  const rate = await prisma.energyMonthlyRate.findFirst({
    where: { tenantId, year, month },
    orderBy: { createdAt: "desc" },
    select: { ratePerKwh: true, revenueType: { select: { name: true } } },
  });

  const value = toNumber(rate?.ratePerKwh);
  if (value === null) return null;

  return {
    ratePerKwh: value,
    source: `EnergyMonthlyRate ${year}-${String(month).padStart(2, "0")}${
      rate?.revenueType?.name ? ` (${rate.revenueType.name})` : ""
    }`,
  };
}

function empty(reason: string): EventComputation {
  return {
    lostWorkKwh: null,
    lostWorkMethod: null,
    lostWorkBasis: null,
    ratePerKwh: null,
    rateSource: null,
    lostRevenueEur: null,
    portionAt95Eur: null,
    portionAt100Eur: null,
    claimEur: null,
    annualRevenueBasisEur: null,
    priorLostRevenueInYearEur: null,
    warnings: [],
    reason,
  };
}

function toNumber(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
