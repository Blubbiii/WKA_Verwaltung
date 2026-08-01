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

/** Ergebnis eines Schreibvorgangs in TurbineProduction */
export interface WriteProductionResult {
  /**
   * `created`          – Zeile neu angelegt
   * `updated`          – bestehende Zeile überschrieben
   * `skipped_invoiced` – Zeile ist bereits abgerechnet und wurde NICHT angefasst
   */
  outcome: 'created' | 'updated' | 'skipped_invoiced';
  turbineId: string;
  year: number;
  month: number;
  /** kWh-Wert, der geschrieben wurde bzw. geschrieben worden wäre */
  kwhValue: number;
  /** Bestehender kWh-Wert bei `skipped_invoiced` (für die Abweichungs-Warnung) */
  existingKwh?: number;
}

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

// Intervall und Ableitungen kommen aus @/lib/config/scada — eine Stelle für
// alle fünf Module, die daraus Arbeit rechnen.
import {
  SCADA_INTERVAL_MINUTES as INTERVAL_MINUTES,
  SCADA_INTERVALS_PER_HOUR as INTERVALS_PER_HOUR,
} from "@/lib/config/scada";

/**
 * Zeitzone der Abrechnungsperiode.
 *
 * FIX P2-8: SCADA-Timestamps liegen in UTC (dbf-reader rechnet die Enercon-Wanduhr-
 * zeit korrekt nach UTC um). Die Abrechnungsperiode einer Gutschrift ist dagegen
 * LOKAL definiert (`new Date(year, month-1, 1)` in create-invoices). Eine UTC-basierte
 * Monatsgruppierung schiebt deshalb die Produktion vom 01.01. 00:00–01:00 Ortszeit
 * (bzw. 00:00–02:00 in der Sommerzeit) in den Dezember.
 * Monatsgrenzen werden daher konsequent in Europe/Berlin gebildet.
 *
 * ⚠️ TODO BACKFILL (NICHT automatisch ausführen):
 * Diese Umstellung ändert bestehende Aggregate. `TurbineProduction`-Zeilen, die vor
 * dieser Änderung erzeugt wurden, enthalten UTC-gebuckete Monatswerte — die erste
 * bzw. letzte Stunde jedes Monats liegt dort im falschen Monat.
 * Ein Backfill müsste:
 *   1. je Turbine/Monat mit `aggregateMonthlyProduction` neu rechnen,
 *   2. Zeilen mit `status = INVOICED` ÜBERSPRINGEN (bereits abgerechnet — eine
 *      nachträgliche Korrektur würde von der ausgestellten Gutschrift abweichen),
 *   3. die Abweichungen als Report ausgeben, bevor etwas geschrieben wird.
 * Bewusst nicht implementiert: der Eingriff braucht eine fachliche Freigabe.
 * Zusammenhängender TODO in dbf-reader.ts (`buildTimestamp`) für historisch
 * falsch gelabelte Rohdaten-Zeilen.
 */
export const SETTLEMENT_TIME_ZONE = 'Europe/Berlin';

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

/**
 * UTC-Offset einer Zeitzone zum gegebenen Zeitpunkt, in Millisekunden.
 * (Positiv östlich von Greenwich: Berlin = +1 h im Winter, +2 h im Sommer.)
 */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // Intl liefert Stunde 24 statt 0 für Mitternacht in einigen Runtimes
  const hour = get('hour') % 24;
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  );
  return asUtc - instant.getTime();
}

/**
 * UTC-Zeitpunkt, der dem lokalen Monatsanfang (00:00 Ortszeit) entspricht.
 *
 * FIX P2-8: Monatsgrenzen der Abrechnungsperiode liegen in Europe/Berlin, die
 * gespeicherten SCADA-Timestamps in UTC.
 */
export function localMonthStartUtc(
  year: number,
  month: number,
  timeZone: string = SETTLEMENT_TIME_ZONE,
): Date {
  // month ist 1-basiert; month = 13 ist zulässig (= Januar des Folgejahres)
  const naive = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  // Zwei Durchläufe: der Offset am geschätzten Zeitpunkt kann bei einem
  // DST-Wechsel am Monatsersten vom Offset am korrigierten Zeitpunkt abweichen.
  const firstPass = new Date(naive.getTime() - timeZoneOffsetMs(naive, timeZone));
  return new Date(naive.getTime() - timeZoneOffsetMs(firstPass, timeZone));
}

/**
 * Jahr/Monat eines UTC-Zeitpunkts in der Abrechnungs-Zeitzone.
 * Gegenstück zu {@link localMonthStartUtc}.
 */
export function localYearMonth(
  instant: Date,
  timeZone: string = SETTLEMENT_TIME_ZONE,
): { year: number; month: number } {
  const shifted = new Date(instant.getTime() + timeZoneOffsetMs(instant, timeZone));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
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
  // Zeitraum: Monatsanfang bis Monatsanfang des Folgemonats — LOKALE Grenzen
  // (Europe/Berlin), in UTC-Zeitpunkte umgerechnet. Siehe SETTLEMENT_TIME_ZONE.
  const startDate = localMonthStartUtc(year, month);
  const endDate = localMonthStartUtc(year, month + 1); // Exklusiv

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

  // Berechne den Gesamt-Zeitbereich für die Query (alle Monate).
  // FIX P2-8: Monatsgrenzen in Europe/Berlin, als UTC-Zeitpunkte.
  const earliestStart = months.reduce(
    (min, { year, month }) => {
      const d = localMonthStartUtc(year, month);
      return d < min ? d : min;
    },
    localMonthStartUtc(months[0].year, months[0].month),
  );
  const latestEnd = months.reduce(
    (max, { year, month }) => {
      const d = localMonthStartUtc(year, month + 1);
      return d > max ? d : max;
    },
    localMonthStartUtc(months[0].year, months[0].month + 1),
  );

  // GROUP BY turbineId + Monat in Europe/Berlin.
  //
  // FIX P2-8: `EXTRACT(... FROM "timestamp")` gruppierte nach UTC-Monat, während der
  // Leistungszeitraum der Gutschrift lokal definiert ist. Die Spalte ist
  // `timestamp WITHOUT TIME ZONE` und enthält UTC — deshalb erst `AT TIME ZONE 'UTC'`
  // (naive → timestamptz), dann `AT TIME ZONE 'Europe/Berlin'` (→ lokale Wanduhrzeit).
  //
  // tenantId-Filter ist Pflicht (Multi-Tenancy + Index-Nutzung).
  const localTs = Prisma.sql`(("timestamp" AT TIME ZONE 'UTC') AT TIME ZONE ${SETTLEMENT_TIME_ZONE})`;

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
      EXTRACT(YEAR FROM ${localTs})::int AS year,
      EXTRACT(MONTH FROM ${localTs})::int AS month,
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
    GROUP BY "turbineId", EXTRACT(YEAR FROM ${localTs}), EXTRACT(MONTH FROM ${localTs})
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
 * WICHTIG: Bereits abgerechnete Zeilen (`status = INVOICED`) werden NICHT
 * überschrieben. Eine verschickte Gutschrift nennt einen konkreten kWh-Wert —
 * ein SCADA-Nachimport darf die Datenbasis dahinter nicht still verändern.
 * Der Aufrufer erhält `outcome: 'skipped_invoiced'` und muss das in der
 * Import-Warnliste ausweisen (gleiches Verhalten wie CSV-Import und PATCH,
 * siehe api/energy/productions/import + productions/[id]).
 *
 * @param turbineId - UUID der Turbine
 * @param tenantId - UUID des Mandanten (Multi-Tenancy)
 * @param year - Jahr (z.B. 2025)
 * @param month - Monat (1-12)
 * @param kwhValue - Berechnete Produktion in kWh
 * @returns Ergebnis des Schreibvorgangs (created / updated / skipped_invoiced)
 */
export async function writeToTurbineProduction(
  turbineId: string,
  tenantId: string,
  year: number,
  month: number,
  kwhValue: number,
): Promise<WriteProductionResult> {
  // Guard: bereits abgerechnete Perioden bleiben unangetastet.
  const existing = await prisma.turbineProduction.findUnique({
    where: {
      turbineId_year_month_tenantId: { turbineId, year, month, tenantId },
    },
    select: { status: true, productionKwh: true },
  });

  if (existing?.status === 'INVOICED') {
    return {
      outcome: 'skipped_invoiced',
      turbineId,
      year,
      month,
      kwhValue,
      existingKwh: Number(existing.productionKwh),
    };
  }

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

  await prisma.turbineProduction.upsert({
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

  return {
    outcome: existing ? 'updated' : 'created',
    turbineId,
    year,
    month,
    kwhValue,
  };
}
