/**
 * Ertragsausfall einer Störung aus den vorhandenen Daten ermitteln.
 *
 * A1 (Audit 2026-07). Die Rechenregeln stehen in `lost-energy.ts` als reine
 * Funktion — hier wird nur beschafft, was sie braucht, und das Ergebnis
 * bewertet.
 *
 * Die Trennung ist Absicht: die Regeln sind ohne Datenbank prüfbar, und diese
 * Datei bleibt klein genug, um sie zu überblicken.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  computeLostEnergy,
  valuateLostEnergy,
  type TurbineSeries,
  type LostEnergyResult,
  type LostEnergyFailure,
} from "./lost-energy";
import { apiLogger as logger } from "@/lib/logger";

/** SCADA liefert Zehnminutenwerte. */
const INTERVAL_MINUTES = 10;

/**
 * Wie viele Referenzanlagen höchstens herangezogen werden.
 *
 * Bei einem Park mit 30 Anlagen würden sonst 30 Zeitreihen geladen, ohne dass
 * das Ergebnis besser wird — der Mittelwert stabilisiert sich lange vorher.
 */
const MAX_REFERENCES = 8;

export interface ValuationInput {
  tenantId: string;
  turbineId: string;
  startAt: Date;
  endAt: Date;
}

export interface ValuationOutcome {
  energy: LostEnergyResult | LostEnergyFailure;
  /** EUR/kWh, sofern ein Satz gefunden wurde. */
  ratePerKwh: number | null;
  rateSource: string | null;
  lostRevenueEur: number | null;
}

/**
 * Störungsfenster bewerten.
 *
 * Liefert immer ein Ergebnis — auch wenn nichts berechenbar war. Dann steht in
 * `energy.reason`, woran es lag. Ein stiller Nullwert wäre hier besonders
 * schädlich: er sähe aus wie „kein Schaden".
 */
export async function valuateFaultWindow(input: ValuationInput): Promise<ValuationOutcome> {
  const { tenantId, turbineId, startAt, endAt } = input;

  // Turbine traegt KEINE tenantId — die Mandantenbindung laeuft ueber den
  // Park. Ohne diesen Umweg liesse sich eine fremde Anlage bewerten.
  const affected = await prisma.turbine.findFirst({
    where: { id: turbineId, park: { tenantId } },
    select: { id: true, ratedPowerKw: true, parkId: true },
  });

  if (!affected) {
    return {
      energy: { method: null, reason: "Anlage nicht gefunden" },
      ratePerKwh: null,
      rateSource: null,
      lostRevenueEur: null,
    };
  }

  // Referenzanlagen: derselbe Park, nicht die betroffene, und ohne eigenen
  // offenen Störungsvorgang im selben Fenster. Letzteres ist entscheidend —
  // eine mitgestörte Referenz drückt die Erwartung und damit den Ausfall nach
  // unten, der Fehler ginge also immer zu Lasten des Anspruchstellers.
  const overlappingCases = await prisma.faultCase.findMany({
    where: {
      tenantId,
      turbine: { parkId: affected.parkId },
      startAt: { lte: endAt },
      OR: [{ endAt: null }, { endAt: { gte: startAt } }],
    },
    select: { turbineId: true },
  });
  const excluded = new Set(overlappingCases.map((c) => c.turbineId));
  excluded.add(turbineId);

  const referenceTurbines = await prisma.turbine.findMany({
    where: {
      park: { tenantId },
      parkId: affected.parkId,
      id: { notIn: [...excluded] },
      ratedPowerKw: { not: null },
    },
    select: { id: true, ratedPowerKw: true },
    take: MAX_REFERENCES,
  });

  const series = await loadSeries(
    tenantId,
    [{ id: affected.id, ratedPowerKw: affected.ratedPowerKw }, ...referenceTurbines],
    startAt,
    endAt,
  );

  const energy = computeLostEnergy({
    affected: series.get(affected.id) ?? {
      turbineId: affected.id,
      ratedPowerKw: toNumber(affected.ratedPowerKw) ?? 0,
      samples: [],
    },
    references: referenceTurbines
      .map((t) => series.get(t.id))
      .filter((s): s is TurbineSeries => s !== undefined),
    intervalMinutes: INTERVAL_MINUTES,
  });

  const rate = await findRate(tenantId, startAt);

  const lostRevenueEur =
    energy.method !== null && rate ? valuateLostEnergy(energy.lostKwh, rate.ratePerKwh) : null;

  if (energy.method === null) {
    logger.info(
      { turbineId, startAt, endAt, reason: energy.reason },
      "[FaultCase] Ertragsausfall nicht berechenbar",
    );
  }

  return {
    energy,
    ratePerKwh: rate?.ratePerKwh ?? null,
    rateSource: rate?.source ?? null,
    lostRevenueEur,
  };
}

/** Zeitreihen aller beteiligten Anlagen in EINER Abfrage. */
async function loadSeries(
  tenantId: string,
  turbines: { id: string; ratedPowerKw: Prisma.Decimal | null }[],
  startAt: Date,
  endAt: Date,
): Promise<Map<string, TurbineSeries>> {
  const ids = turbines.map((t) => t.id);
  if (ids.length === 0) return new Map();

  const measurements = await prisma.scadaMeasurement.findMany({
    where: {
      tenantId,
      turbineId: { in: ids },
      timestamp: { gte: startAt, lte: endAt },
    },
    select: { turbineId: true, timestamp: true, powerW: true },
    orderBy: { timestamp: "asc" },
  });

  const result = new Map<string, TurbineSeries>();
  for (const turbine of turbines) {
    result.set(turbine.id, {
      turbineId: turbine.id,
      ratedPowerKw: toNumber(turbine.ratedPowerKw) ?? 0,
      samples: [],
    });
  }
  for (const row of measurements) {
    result.get(row.turbineId)?.samples.push({
      timestamp: row.timestamp,
      powerW: toNumber(row.powerW),
    });
  }
  return result;
}

/**
 * Vergütungssatz für den Monat des Störungsbeginns.
 *
 * Bewusst der Beginn und nicht das Ende: eine über den Monatswechsel laufende
 * Störung bekäme sonst den Satz des Folgemonats, obwohl der Schaden
 * überwiegend im ersten entstanden ist. Bei mehrmonatigen Störungen ist beides
 * eine Näherung — der Satz steht deshalb am Vorgang und ist überschreibbar.
 */
async function findRate(
  tenantId: string,
  startAt: Date,
): Promise<{ ratePerKwh: number; source: string } | null> {
  const year = startAt.getFullYear();
  const month = startAt.getMonth() + 1;

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

function toNumber(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
