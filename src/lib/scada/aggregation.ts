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
import { Decimal } from '@prisma/client/runtime/library';

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
): Promise<MonthlyAggregationResult> {
  // Zeitraum: erster bis letzter Tag des Monats
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0)); // Exklusiv

  // Alle WSD-Messwerte mit gültigem Leistungswert für den Monat laden
  const measurements = await prisma.scadaMeasurement.findMany({
    where: {
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
      source: 'SCADA',
      status: 'DRAFT',
      notes: `Automatisch aggregiert aus SCADA-Daten (${year}-${String(month).padStart(2, '0')})`,
    },
    update: {
      productionKwh: new Decimal(kwhValue),
      source: 'SCADA',
      status: 'DRAFT',
      notes: `Automatisch aggregiert aus SCADA-Daten (${year}-${String(month).padStart(2, '0')}) - Aktualisiert`,
      updatedAt: new Date(),
    },
  });

  return result;
}
