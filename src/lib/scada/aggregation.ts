/**
 * Aggregation Service für SCADA-Produktionsdaten
 *
 * Berechnet monatliche Produktionswerte (kWh) aus den 10-Minuten-Rohdaten
 * der ScadaMeasurement-Tabelle und schreibt diese in TurbineProduction.
 *
 * Berechnungsformel:
 *   Summe(powerW * 10min / 60min / 1000) = kWh pro Monat
 *   Jeder 10-Min-Messwert repraesentiert eine durchschnittliche Leistung
 *   über das Intervall. Die Energie ist: P_avg * dt.
 */

import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client-runtime-utils';
import { Prisma } from '@prisma/client';

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

/** Ergebnis einer monatlichen Aggregation */
export interface MonthlyAggregationResult {
  /** Gesamtproduktion in kWh */
  totalKwh: number;
  /** Anzahl gültiger Messpunkte mit Leistungswert */
  dataPoints: number;
  /** Erwartete Messpunkte im Monat (Tage * 24h * 6 Intervalle) */
  expectedPoints: number;
  /** Datenabdeckung in Prozent (dataPoints / expectedPoints * 100) */
  coveragePercent: number;
}

// ---------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------

/** Dauer eines SCADA-Messintervalls in Minuten */
const INTERVAL_MINUTES = 10;

/** Anzahl 10-Min-Intervalle pro Stunde */
const INTERVALS_PER_HOUR = 60 / INTERVAL_MINUTES; // 6

// ---------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------

/**
 * Berechnet die Anzahl Tage in einem Monat.
 * Beruecksichtigt Schaltjahre.
 */
function daysInMonth(year: number, month: number): number {
  // month ist 1-basiert (1=Januar, 12=Dezember)
  // new Date(year, month, 0) gibt den letzten Tag des Vormonats zurück
  return new Date(year, month, 0).getDate();
}

// ---------------------------------------------------------------
// Oeffentliche API
// ---------------------------------------------------------------

/**
 * Aggregiert die monatliche Produktion einer Turbine aus SCADA-Messdaten.
 *
 * Liest alle ScadaMeasurement-Einträge des Monats für die Turbine,
 * summiert die Leistungswerte und rechnet in kWh um.
 *
 * Berechnung pro Messpunkt:
 *   kWh_Intervall = powerW * (10/60) / 1000
 *                 = powerW / 6000
 *
 * @param turbineId - UUID der Turbine
 * @param year - Jahr (z.B. 2025)
 * @param month - Monat (1-12)
 * @returns Aggregationsergebnis mit kWh, Datenpunkten und Abdeckung
 */
export async function aggregateMonthlyProduction(
  turbineId: string,
  year: number,
  month: number,
  tenantId: string,
): Promise<MonthlyAggregationResult> {
  // Zeitraum: erster bis letzter Tag des Monats
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0)); // Exklusiv

  // Alle WSD-Messwerte mit gültigem Leistungswert für den Monat laden.
  // tenantId-Filter verhindert Cross-Tenant-Aggregation falls Caller mit
  // turbineId aus User-Input arbeitet (defense-in-depth).
  const measurements = await prisma.scadaMeasurement.findMany({
    where: {
      tenantId,
      turbineId,
      sourceFile: 'WSD',
      timestamp: {
        gte: startDate,
        lt: endDate,
      },
      // Nur Messwerte mit Leistungsdaten
      powerW: { not: null },
    },
    select: {
      powerW: true,
    },
  });

  // Produktion berechnen: Summe(P_avg * 10min / 60min / 1000)
  let totalKwh = 0;
  let dataPoints = 0;

  for (const m of measurements) {
    if (m.powerW !== null) {
      // powerW ist Decimal in Prisma -> in Number konvertieren
      const watts = m.powerW instanceof Decimal
        ? m.powerW.toNumber()
        : Number(m.powerW);

      if (isFinite(watts) && watts >= 0) {
        // Energie für 10-Min-Intervall: P * dt
        // kWh = W * (10/60) h / 1000
        totalKwh += watts * INTERVAL_MINUTES / 60 / 1000;
        dataPoints++;
      }
    }
  }

  // Erwartete Messpunkte: Tage * 24 Stunden * 6 Intervalle pro Stunde
  const days = daysInMonth(year, month);
  const expectedPoints = days * 24 * INTERVALS_PER_HOUR;

  const coveragePercent =
    expectedPoints > 0
      ? Math.round((dataPoints / expectedPoints) * 10000) / 100
      : 0;

  return {
    totalKwh: Math.round(totalKwh * 1000) / 1000, // 3 Nachkommastellen
    dataPoints,
    expectedPoints,
    coveragePercent,
  };
}

/**
 * Bulk-Aggregation für mehrere (Turbine × Monat)-Kombinationen in EINER
 * SQL-Query. Ersetzt die N+1-Schleife im import-service (N Turbinen ×
 * M Monate = N×M Queries) durch eine einzige GROUP-BY-Query, die
 * DB-seitig summiert statt Decimal-Rows in den Node-Heap zu laden.
 *
 * Bei 10 Turbinen × 12 Monaten: 120 Queries → 1 Query. Mit DB-seitiger
 * SUM() statt JS-seitig: ~50-100× schneller bei großen Imports.
 *
 * @param tenantId - UUID des Mandanten (Multi-Tenancy enforced)
 * @param turbineIds - Liste der Turbinen-UUIDs
 * @param months - Liste von { year, month }-Tupeln
 * @returns Map mit Schlüssel `${turbineId}:${year}:${month}` → { totalKwh, dataPoints }
 */
export async function aggregateMonthlyProductionBulk(
  tenantId: string,
  turbineIds: string[],
  months: Array<{ year: number; month: number }>,
): Promise<Map<string, { totalKwh: number; dataPoints: number; coveragePercent: number }>> {
  if (turbineIds.length === 0 || months.length === 0) {
    return new Map();
  }

  // Berechne den Gesamt-Zeitbereich für die Query (alle Monate)
  const earliestStart = months.reduce(
    (min, { year, month }) => {
      const d = new Date(Date.UTC(year, month - 1, 1));
      return d < min ? d : min;
    },
    new Date(Date.UTC(months[0].year, months[0].month - 1, 1)),
  );
  const latestEnd = months.reduce(
    (max, { year, month }) => {
      const d = new Date(Date.UTC(year, month, 1));
      return d > max ? d : max;
    },
    new Date(Date.UTC(months[0].year, months[0].month, 1)),
  );

  // GROUP BY turbineId + date_trunc('month', timestamp).
  // tenantId-Filter ist Pflicht (Multi-Tenancy + Index-Nutzung).
  const rows = await prisma.$queryRaw<
    Array<{
      turbine_id: string;
      year: number;
      month: number;
      total_power_w: number; // sum of all powerW
      data_points: bigint;
    }>
  >(Prisma.sql`
    SELECT
      "turbineId" AS turbine_id,
      EXTRACT(YEAR FROM "timestamp")::int AS year,
      EXTRACT(MONTH FROM "timestamp")::int AS month,
      SUM("powerW")::float AS total_power_w,
      COUNT(*) AS data_points
    FROM scada_measurements
    WHERE "tenantId" = ${tenantId}
      AND "turbineId" IN (${Prisma.join(turbineIds)})
      AND "sourceFile" = 'WSD'
      AND "powerW" IS NOT NULL
      AND "powerW" >= 0
      AND "timestamp" >= ${earliestStart}
      AND "timestamp" < ${latestEnd}
    GROUP BY "turbineId", EXTRACT(YEAR FROM "timestamp"), EXTRACT(MONTH FROM "timestamp")
  `);

  // Ergebnis als Map aufbereiten + nur die angeforderten Monate behalten
  const requestedMonths = new Set(months.map((m) => `${m.year}:${m.month}`));
  const result = new Map<
    string,
    { totalKwh: number; dataPoints: number; coveragePercent: number }
  >();

  for (const row of rows) {
    const monthKey = `${row.year}:${row.month}`;
    if (!requestedMonths.has(monthKey)) continue;

    const totalKwh = Math.round((row.total_power_w * INTERVAL_MINUTES) / 60 / 1000 * 1000) / 1000;
    const dataPoints = Number(row.data_points);
    const expectedPoints = daysInMonth(row.year, row.month) * 24 * INTERVALS_PER_HOUR;
    const coveragePercent =
      expectedPoints > 0
        ? Math.round((dataPoints / expectedPoints) * 10000) / 100
        : 0;

    result.set(`${row.turbine_id}:${row.year}:${row.month}`, {
      totalKwh,
      dataPoints,
      coveragePercent,
    });
  }

  return result;
}

/**
 * Schreibt aggregierte Produktionsdaten in die TurbineProduction-Tabelle.
 *
 * Verwendet upsert basierend auf dem unique constraint:
 *   turbineId + year + month + tenantId
 *
 * Setzt source="SCADA" und status="DRAFT", damit der Wert
 * vom Benutzer noch geprüft/bestätigt werden kann.
 *
 * @param turbineId - UUID der Turbine
 * @param tenantId - UUID des Mandanten (Multi-Tenancy)
 * @param year - Jahr (z.B. 2025)
 * @param month - Monat (1-12)
 * @param kwhValue - Berechnete Produktion in kWh
 * @returns Der erstellte oder aktualisierte TurbineProduction-Eintrag
 */
export async function writeToTurbineProduction(
  turbineId: string,
  tenantId: string,
  year: number,
  month: number,
  kwhValue: number,
) {
  // Fetch SCADA availability for this turbine+month to enrich production record
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0)); // last day of month
  const scadaAvail = await prisma.scadaAvailability.findFirst({
    where: {
      turbineId,
      periodType: 'MONTHLY',
      date: { gte: monthStart, lte: monthEnd },
    },
    select: { availabilityPct: true, t1: true },
  });

  const availabilityPct = scadaAvail?.availabilityPct
    ? new Decimal(scadaAvail.availabilityPct.toString())
    : undefined;
  // t1 is production time in seconds → convert to hours
  const operatingHours = scadaAvail?.t1 && scadaAvail.t1 > 0
    ? new Decimal((scadaAvail.t1 / 3600).toFixed(2))
    : undefined;

  const result = await prisma.turbineProduction.upsert({
    where: {
      turbineId_year_month_tenantId: {
        turbineId,
        year,
        month,
        tenantId,
      },
    },
    create: {
      turbineId,
      tenantId,
      year,
      month,
      productionKwh: new Decimal(kwhValue),
      ...(availabilityPct && { availabilityPct }),
      ...(operatingHours && { operatingHours }),
      source: 'SCADA',
      status: 'DRAFT',
      notes: `Automatisch aggregiert aus SCADA-Daten (${year}-${String(month).padStart(2, '0')})`,
    },
    update: {
      productionKwh: new Decimal(kwhValue),
      ...(availabilityPct && { availabilityPct }),
      ...(operatingHours && { operatingHours }),
      source: 'SCADA',
      status: 'DRAFT',
      notes: `Automatisch aggregiert aus SCADA-Daten (${year}-${String(month).padStart(2, '0')}) - Aktualisiert`,
      updatedAt: new Date(),
    },
  });

  return result;
}
