/**
 * DBF Field Schemas — deklarativer Ersatz für hand-gerollte Reader-Field-Mappings.
 *
 * Warum: Der WSD-Reader las bis Sprint A (2026-07) nur 5 von 38 verfügbaren
 * Feldern — der WSR-Aggregat-Reader las die vollen 20 Felder mit ähnlichen
 * Namen. Drift zwischen zwei Readern die dieselben Daten in unterschiedlicher
 * Granularität lesen sollten. Curtailment-Daten (§13a EnWG-relevant) waren
 * daher in Monats-Reports vorhanden, in Tages-Reports aber nicht.
 *
 * Deklaratives Schema löst das strukturell:
 *  - Ein Descriptor pro Feld: DBF-Name(n), Skalierung, Integer-Konversion
 *  - Reader iteriert Schema statt 20× getNum() zu callen
 *  - Neue Firmware-Version bringt neues Feld? → Descriptor ergänzen, kein
 *    neuer Reader-Code
 *
 * Scope Phase 3: nur die Daily-10-min-Reader (WSD, UQD). UID hat
 * Array-Felder (Voltages/Currents als [U1,U2,U3]) und die Aggregat-Reader
 * (WSR, AVR, ...) haben abweichende Timestamp-Handhabung (date statt
 * timestamp). Für die zweite Ausbaustufe.
 */

import { DBFFile } from "dbffile";
import {
  buildTimestamp,
  getPlantNo,
  getNum,
  getInt,
  scadaLogger,
  type WsdRecord,
  type ElectricalPhaseRecord,
} from "./dbf-reader";

// =============================================================================
// Schema-Descriptor-Typen
// =============================================================================

/**
 * Extraktions-Regel für ein DBF-Feld.
 *
 * - `dbf`: DBF-Feld-Name (Standard) ODER Array von Fallback-Namen (probiert
 *          nacheinander, erster Match gewinnt)
 * - `scale`: Multiplikator NACH null-Check (z.B. kW → W = 1000)
 * - `int`: Wenn true, wird auf Integer gerundet (via getInt)
 */
export interface FieldDescriptor {
  readonly dbf: string | readonly string[];
  readonly scale?: number;
  readonly int?: boolean;
}

/**
 * Schema für einen DBF-Reader — pro Feld des Result-Records ein Descriptor.
 * `timestamp` und `plantNo` sind implizit (aus Date+Hour+Minute+Second bzw.
 * PlantNo) und daher aus dem Schema ausgeklammert.
 */
export type ReaderSchema<T> = {
  readonly [K in Exclude<keyof T, "timestamp" | "plantNo">]: FieldDescriptor;
};

// =============================================================================
// WSD-Schema — Wind Speed Daily (10-Minuten-Werte)
// =============================================================================

/**
 * WSD: 20 Felder inkl. Curtailment (§13a EnWG-relevant), Meteo, Vereisung.
 *
 * Skalierungen:
 *  - `powerW` (mrwSmpP): DBF liefert kW → DB speichert Watt (×1000)
 *  - `reactivePowerVar` (mrwSmpQ): DBF liefert kVAr → DB speichert VAr (×1000)
 *  - Curtailment-Felder (`mrwSmpPwin/Pte/Pfm/Pext`): bleiben in kW (raw),
 *    konsistent zum WSR-Aggregat-Reader
 *  - Meteo/Betriebs-Felder: raw, kein Scale
 */
export const WSD_SCHEMA: ReaderSchema<WsdRecord> = {
  windSpeedMs: { dbf: "mrwSmpVWi" },
  powerW: { dbf: "mrwSmpP", scale: 1000 },
  rotorRpm: { dbf: "mrwSmpNRot" },
  operatingHours: { dbf: "arwAbWorkH" },
  windDirection: { dbf: "mrwAbGoPos" },
  reactivePowerVar: { dbf: "mrwSmpQ", scale: 1000 },
  cumulativeEnergyWh: { dbf: "arwAbW" },
  operatingMinutes: { dbf: "arwAbWrkM" },
  powerWindKw: { dbf: "mrwSmpPwin" },
  powerTechnicalKw: { dbf: "mrwSmpPte" },
  powerForcedKw: { dbf: "mrwSmpPfm" },
  powerExternalKw: { dbf: "mrwSmpPext" },
  pitchAngle: { dbf: "mrwSmpAng" },
  rainIndex: { dbf: "mrwSmpRai" },
  airPressureHpa: { dbf: "mrwSmpAirP" },
  airHumidityPct: { dbf: "mrwSmpAirH" },
  visibilityRange: { dbf: "mrwSmpVisR" },
  brightnessNight: { dbf: "mrwSmpBriN" },
  icingCount: { dbf: "mrwSmpLIcA" },
  coldIcing: { dbf: "mrwSmpCIce" },
};

// =============================================================================
// UQD-Schema — Reactive per-Phase Daily
// =============================================================================

/**
 * UQD: 18 Felder (mean/peak/low pro P1/P2/P3 + Q1/Q2/Q3).
 *
 * Fallback-Namen: Standard-Enercon nutzt `mruqSmpP1` etc., manche
 * Firmware-Versionen aber `mrSmpP1` oder ähnliches. Historisch wurden
 * die Fallbacks über dynamisches Field-Scanning erkannt — jetzt explizit
 * im Schema deklariert.
 */
export const UQD_SCHEMA: ReaderSchema<ElectricalPhaseRecord> = {
  error: { dbf: "Error", int: true },
  // Standard-Enercon: mruqSmp*. Manche Firmwares nutzen mruiSmp* (mit UI-
  // Präfix wie UID-Files) oder mrSmp* (ohne Namespace). Erste Match-Reihenfolge
  // ist die häufigste.
  meanP1: { dbf: ["mruqSmpP1", "mruiSmpP1", "mrSmpP1"] },
  peakP1: { dbf: ["pruqSmpP1", "pruiSmpP1", "prSmpP1"] },
  lowP1: { dbf: ["lruqSmpP1", "lruiSmpP1", "lrSmpP1"] },
  meanP2: { dbf: ["mruqSmpP2", "mruiSmpP2", "mrSmpP2"] },
  peakP2: { dbf: ["pruqSmpP2", "pruiSmpP2", "prSmpP2"] },
  lowP2: { dbf: ["lruqSmpP2", "lruiSmpP2", "lrSmpP2"] },
  meanP3: { dbf: ["mruqSmpP3", "mruiSmpP3", "mrSmpP3"] },
  peakP3: { dbf: ["pruqSmpP3", "pruiSmpP3", "prSmpP3"] },
  lowP3: { dbf: ["lruqSmpP3", "lruiSmpP3", "lrSmpP3"] },
  meanQ1: { dbf: ["mruqSmpQ1", "mruiSmpQ1", "mrSmpQ1"] },
  peakQ1: { dbf: ["pruqSmpQ1", "pruiSmpQ1", "prSmpQ1"] },
  lowQ1: { dbf: ["lruqSmpQ1", "lruiSmpQ1", "lrSmpQ1"] },
  meanQ2: { dbf: ["mruqSmpQ2", "mruiSmpQ2", "mrSmpQ2"] },
  peakQ2: { dbf: ["pruqSmpQ2", "pruiSmpQ2", "prSmpQ2"] },
  lowQ2: { dbf: ["lruqSmpQ2", "lruiSmpQ2", "lrSmpQ2"] },
  meanQ3: { dbf: ["mruqSmpQ3", "mruiSmpQ3", "mrSmpQ3"] },
  peakQ3: { dbf: ["pruqSmpQ3", "pruiSmpQ3", "prSmpQ3"] },
  lowQ3: { dbf: ["lruqSmpQ3", "lruiSmpQ3", "lrSmpQ3"] },
};

// =============================================================================
// Generischer Schema-Reader (Daily-10-min-Records)
// =============================================================================

/**
 * Liest DBF-Datei mit einem Schema-Descriptor und produziert typisierte Records.
 * Für Daily-10-min-Reader (WSD, UQD): Timestamp aus Date+Hour+Minute+Second,
 * plantNo aus PlantNo, alle numerischen Felder via Schema-Descriptor.
 *
 * Verhalten identisch zu den hand-gerollten Readern:
 *  - Timestamp-Bau schlägt fehl → Record wird übersprungen (kein Throw)
 *  - plantNo fehlt oder <=0 → Record übersprungen
 *  - File-Read-Error → leeres Array + Log (nicht Throw)
 */
export async function readDbfWithSchema<T>(
  filePath: string,
  schema: ReaderSchema<T>,
  loggerContext: string,
): Promise<T[]> {
  try {
    const dbf = await DBFFile.open(filePath);
    const rawRecords = await dbf.readRecords();

    // Für Fallback-Auflösung: Set aller vorhandenen Feld-Namen (case-preserved
    // für den Zugriff, lowercase für den Vergleich)
    const availableFieldsLower = new Set(
      dbf.fields.map((f) => f.name.toLowerCase()),
    );

    // Descriptor-Cache: für jeden Schema-Key den tatsächlich vorhandenen DBF-Name.
    // Falls Fallback-Match → einmal loggen, dann normal verarbeiten.
    const resolvedFields: Record<string, string | null> = {};
    const fallbackHits: Record<string, string> = {};

    for (const [key, descriptor] of Object.entries(schema) as Array<
      [string, FieldDescriptor]
    >) {
      const candidates = Array.isArray(descriptor.dbf)
        ? descriptor.dbf
        : [descriptor.dbf];
      let resolved: string | null = null;
      for (const candidate of candidates) {
        if (availableFieldsLower.has(candidate.toLowerCase())) {
          resolved = candidate;
          break;
        }
      }
      resolvedFields[key] = resolved;
      // Wenn nicht der Standard (= erster Kandidat) gewinnt: als Fallback loggen
      if (resolved && resolved !== candidates[0]) {
        fallbackHits[key] = resolved;
      }
    }

    if (Object.keys(fallbackHits).length > 0) {
      scadaLogger.warn(
        { filePath, fallbackFields: fallbackHits, context: loggerContext },
        `${loggerContext}: fallback field names used (non-standard firmware)`,
      );
    }

    const records: T[] = [];

    for (const raw of rawRecords) {
      const rec = raw as Record<string, unknown>;

      const timestamp = buildTimestamp(rec);
      if (!timestamp) continue;

      const plantNo = getPlantNo(rec);
      if (!plantNo) continue;

      const record: Record<string, unknown> = { timestamp, plantNo };

      for (const [key, descriptor] of Object.entries(schema) as Array<
        [string, FieldDescriptor]
      >) {
        const dbfName = resolvedFields[key];
        if (!dbfName) {
          record[key] = null;
          continue;
        }
        const raw = descriptor.int
          ? getInt(rec, dbfName)
          : getNum(rec, dbfName);
        record[key] =
          raw != null && descriptor.scale != null ? raw * descriptor.scale : raw;
      }

      records.push(record as T);
    }

    return records;
  } catch (err) {
    scadaLogger.error(
      { err, filePath, context: loggerContext },
      `Error reading ${loggerContext} file`,
    );
    return [];
  }
}
