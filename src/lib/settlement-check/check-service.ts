/**
 * Die drei Mengenquellen für den Abgleich beschaffen.
 *
 * A3 (Audit 2026-07). Die Regeln stehen in `reconciliation.ts` — hier steht
 * nur, woher die Zahlen kommen.
 *
 * ## Warum die SCADA-Menge aus dem Zählerstand kommt
 *
 * Es gibt zwei Wege: die 10-Minuten-Leistung aufsummieren oder die Differenz
 * des kumulativen Zählwerks nehmen. Für einen Abgleich gegen eine Abrechnung
 * ist das Zählwerk der richtige Weg — der Netzbetreiber rechnet ebenfalls mit
 * Zählerständen, und eine Integration über die Leistung schleppt bei jeder
 * Datenlücke einen Fehler ein.
 *
 * Fällt das Zählwerk aus, wird auf die Integration ausgewichen UND das
 * vermerkt: eine Zahl aus einer anderen Quelle darf nicht so aussehen wie eine
 * aus der erwarteten.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";

export interface SourceQuantities {
  scadaKwh: number | null;
  /** Woher die SCADA-Menge stammt — gehört in die Herleitung. */
  scadaSource: "METER_READING" | "POWER_INTEGRATION" | null;
  reportedKwh: number | null;
  expectedRatePerKwh: number | null;
  rateSource: string | null;
  notes: string[];
}

/**
 * Mengen und Satz für einen Abrechnungszeitraum zusammentragen.
 *
 * Liefert überall `null`, wo nichts vorliegt — nie 0. Eine 0 würde im Abgleich
 * als „nichts produziert" gelesen und eine dramatische Abweichung erzeugen,
 * obwohl nur die Daten fehlen.
 */
export async function loadSourceQuantities(input: {
  tenantId: string;
  parkId: string;
  year: number;
  month: number | null;
}): Promise<SourceQuantities> {
  const { tenantId, parkId, year, month } = input;
  const notes: string[] = [];

  // Zeitfenster: ein Monat oder das ganze Jahr. UTC, weil die SCADA-Daten so
  // abgelegt sind — eine lokale Grenze verschöbe den Monatsanfang um zwei
  // Stunden und zöge Werte des Vormonats herein.
  const from = month
    ? new Date(Date.UTC(year, month - 1, 1))
    : new Date(Date.UTC(year, 0, 1));
  const to = month
    ? new Date(Date.UTC(year, month, 1))
    : new Date(Date.UTC(year + 1, 0, 1));

  const turbines = await prisma.turbine.findMany({
    where: { parkId, park: { tenantId } },
    select: { id: true },
  });
  const turbineIds = turbines.map((t) => t.id);

  const [scada, reported, rate] = await Promise.all([
    loadScadaKwh(tenantId, turbineIds, from, to, notes),
    loadReportedKwh(tenantId, turbineIds, year, month),
    loadRate(tenantId, year, month),
  ]);

  return {
    scadaKwh: scada.value,
    scadaSource: scada.source,
    reportedKwh: reported,
    expectedRatePerKwh: rate?.ratePerKwh ?? null,
    rateSource: rate?.source ?? null,
    notes,
  };
}

async function loadScadaKwh(
  tenantId: string,
  turbineIds: string[],
  from: Date,
  to: Date,
  notes: string[],
): Promise<{ value: number | null; source: SourceQuantities["scadaSource"] }> {
  if (turbineIds.length === 0) {
    notes.push("Der Park hat keine Anlagen — keine SCADA-Menge ermittelbar");
    return { value: null, source: null };
  }

  // Zählwerksdifferenz je Anlage: letzter minus erster Stand im Fenster.
  const meterRows = await prisma.$queryRaw<{ turbineId: string; delta: number | null }[]>`
    SELECT
      "turbineId",
      (MAX("cumulativeEnergyWh") - MIN("cumulativeEnergyWh")) / 1000.0 AS "delta"
    FROM "scada_measurements"
    WHERE "tenantId" = ${tenantId}
      AND "turbineId" = ANY(${turbineIds})
      AND "timestamp" >= ${from}
      AND "timestamp" < ${to}
      AND "cumulativeEnergyWh" IS NOT NULL
    GROUP BY "turbineId"
  `;

  const meterTotal = meterRows.reduce((sum, row) => sum + (Number(row.delta) || 0), 0);

  if (meterRows.length === turbineIds.length && meterTotal > 0) {
    return { value: round3(meterTotal), source: "METER_READING" };
  }

  if (meterRows.length > 0) {
    notes.push(
      `Zählwerksdaten nur für ${meterRows.length} von ${turbineIds.length} Anlagen — auf Leistungsintegration ausgewichen`,
    );
  }

  // Ausweichweg: die 10-Minuten-Leistung integrieren. Bewusst als eigene
  // Quelle gekennzeichnet — sie ist ungenauer, und das muss am Ergebnis
  // sichtbar bleiben.
  const powerRows = await prisma.$queryRaw<{ total: number | null }[]>`
    SELECT SUM("powerW") / 6.0 / 1000.0 AS "total"
    FROM "scada_measurements"
    WHERE "tenantId" = ${tenantId}
      AND "turbineId" = ANY(${turbineIds})
      AND "timestamp" >= ${from}
      AND "timestamp" < ${to}
      AND "powerW" IS NOT NULL
  `;

  const powerTotal = Number(powerRows[0]?.total);
  if (!Number.isFinite(powerTotal) || powerTotal <= 0) {
    notes.push("Keine SCADA-Daten im Zeitraum");
    return { value: null, source: null };
  }

  notes.push("SCADA-Menge aus der Leistungsintegration — ungenauer als der Zählerstand");
  return { value: round3(powerTotal), source: "POWER_INTEGRATION" };
}

async function loadReportedKwh(
  tenantId: string,
  turbineIds: string[],
  year: number,
  month: number | null,
): Promise<number | null> {
  if (turbineIds.length === 0) return null;

  const rows = await prisma.turbineProduction.aggregate({
    where: {
      tenantId,
      turbineId: { in: turbineIds },
      year,
      ...(month ? { month } : {}),
    },
    _sum: { productionKwh: true },
    _count: true,
  });

  // Kein Datensatz heisst "nicht erfasst" — nicht "0 kWh produziert".
  if (rows._count === 0) return null;
  return toNumber(rows._sum.productionKwh);
}

async function loadRate(
  tenantId: string,
  year: number,
  month: number | null,
): Promise<{ ratePerKwh: number; source: string } | null> {
  if (month === null) {
    // Für ein ganzes Jahr gibt es keinen einzelnen Satz. Ihn aus zwölf
    // Monatssätzen zu mitteln wäre eine Zahl ohne Grundlage: die Monate haben
    // unterschiedliche Mengen, ein ungewichtetes Mittel wäre schlicht falsch.
    return null;
  }

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

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export { logger as settlementCheckLogger };
