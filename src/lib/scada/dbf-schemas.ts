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
  getDateField,
  getPlantNo,
  getNum,
  getInt,
  getBool,
  scadaLogger,
  type WsdRecord,
  type ElectricalPhaseRecord,
  type UidRecord,
  type AvailabilityRecord,
  type StateSummaryRecord,
  type WarningSummaryRecord,
} from "./dbf-reader";

// =============================================================================
// Schema-Descriptor-Typen
// =============================================================================

/**
 * Extraktions-Regel für ein DBF-Feld.
 *
 * Scalar-Descriptor:
 * - `dbf`: DBF-Feld-Name (Standard) ODER Array von Fallback-Namen (probiert
 *          nacheinander, erster Match gewinnt)
 * - `scale`: Multiplikator NACH null-Check (z.B. kW → W = 1000)
 * - `int`: Wenn true, wird auf Integer gerundet (via getInt)
 *
 * Composite-Descriptor (für UID's Voltages/Currents als [U1,U2,U3]):
 * - `composite`: Liste von DBF-Feld-Namen in Result-Array-Reihenfolge
 * - `scale`: Wird auf jedes Element angewendet
 * Fallback-Support: pro Position kann ein Array von Namen angegeben werden.
 */
export type FieldDescriptor =
  | {
      readonly dbf: string | readonly string[];
      readonly scale?: number;
      readonly int?: boolean;
    }
  | {
      readonly composite: readonly (string | readonly string[])[];
      readonly scale?: number;
      readonly int?: boolean;
    }
  | {
      /** Boolean-Feld — DBF-Feld wird per getBool interpretiert (T/1/true → true) */
      readonly dbf: string | readonly string[];
      readonly bool: true;
    };

function isCompositeDescriptor(
  d: FieldDescriptor,
): d is Extract<FieldDescriptor, { composite: readonly unknown[] }> {
  return "composite" in d;
}

function isBoolDescriptor(
  d: FieldDescriptor,
): d is Extract<FieldDescriptor, { bool: true }> {
  return "bool" in d && d.bool === true;
}

/**
 * Schema für einen DBF-Reader (10-min-Timestamp-basiert).
 * `timestamp` und `plantNo` sind implizit (aus Date+Hour+Minute+Second bzw.
 * PlantNo) und daher aus dem Schema ausgeklammert.
 */
export type ReaderSchema<T> = {
  readonly [K in Exclude<keyof T, "timestamp" | "plantNo">]: FieldDescriptor;
};

/**
 * Schema für einen Aggregat-Reader (date-basiert, kein Hour/Minute/Second).
 * Gilt für AVR/SSM/SWM/WSR — die Records repräsentieren Perioden, nicht Momente.
 */
export type ReaderSchemaByDate<T> = {
  readonly [K in Exclude<keyof T, "date" | "plantNo">]: FieldDescriptor;
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
// =============================================================================
// UID-Schema — Electrical Daily (P/Q/S/cos φ/Frequenz + 3-Phasen-U/I)
// =============================================================================

/**
 * UID: 30+ Felder inkl. Composite-Arrays für Voltages/Currents pro Phase.
 *
 * Skalierungen:
 *  - Alle Scalar-Fields sind bereits in ihrer Ziel-Einheit im DBF
 *    (mruiSmpP in W, mruiSmpQ in VAr, mruiSmpS in VA — anders als WSD wo kW→W)
 *  - Frequenz in Hz, cos φ dimensionslos
 *  - Composite-Arrays: [U1, U2, U3] bzw. [I1, I2, I3]
 */
export const UID_SCHEMA: ReaderSchema<UidRecord> = {
  error: { dbf: "Error", int: true },

  // Active Power (W) — mean/peak/low
  meanPowerW: { dbf: "mruiSmpP" },
  peakPowerW: { dbf: "pruiSmpP" },
  lowPowerW: { dbf: "lruiSmpP" },

  // Reactive Power (VAr)
  meanReactivePowerVar: { dbf: "mruiSmpQ" },
  peakReactivePowerVar: { dbf: "pruiSmpQ" },
  lowReactivePowerVar: { dbf: "lruiSmpQ" },

  // Apparent Power (VA)
  meanApparentPowerVa: { dbf: "mruiSmpS" },
  peakApparentPowerVa: { dbf: "pruiSmpS" },
  lowApparentPowerVa: { dbf: "lruiSmpS" },

  // Power Factor
  meanCosPhi: { dbf: "mruiSmpCos" },
  peakCosPhi: { dbf: "pruiSmpCos" },
  lowCosPhi: { dbf: "lruiSmpCos" },

  // Grid Frequency (Hz)
  meanFrequencyHz: { dbf: "mruiSmpFre" },
  peakFrequencyHz: { dbf: "pruiSmpFre" },
  lowFrequencyHz: { dbf: "lruiSmpFre" },

  // Phase Voltages (V) — [U1, U2, U3]
  meanVoltagesV: { composite: ["mruiSmpU1", "mruiSmpU2", "mruiSmpU3"] },
  peakVoltagesV: { composite: ["pruiSmpU1", "pruiSmpU2", "pruiSmpU3"] },
  lowVoltagesV: { composite: ["lruiSmpU1", "lruiSmpU2", "lruiSmpU3"] },

  // Phase Currents (A) — [I1, I2, I3]
  meanCurrentsA: { composite: ["mruiSmpI1", "mruiSmpI2", "mruiSmpI3"] },
  peakCurrentsA: { composite: ["pruiSmpI1", "pruiSmpI2", "pruiSmpI3"] },
  lowCurrentsA: { composite: ["lruiSmpI1", "lruiSmpI2", "lruiSmpI3"] },

  // Per-Phase Apparent Power (VA) — [S1, S2, S3]
  meanApparentPowerPerPhaseVa: {
    composite: ["mruiSmpS1", "mruiSmpS2", "mruiSmpS3"],
  },

  // Cumulative Counters
  cumulativeActiveEnergyProduced: { dbf: "aruiAbWpr" },
  cumulativeEnergyConsumed: { dbf: "aruiAbWcm" },
  cumulativeInductiveReactiveEnergy: { dbf: "aruiAbQin" },
  cumulativeCapacitiveReactiveEnergy: { dbf: "aruiAbQcap" },
  cumulativeWorkingHours: { dbf: "aruiAbWkH" },
};

// =============================================================================
// UQD-Schema — Reactive per-Phase Daily
// =============================================================================

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

    /**
     * Resolve `string | readonly string[]` gegen die vorhandenen DBF-Felder.
     * Ergebnis: der tatsächliche Field-Name (Case-preserved), oder null.
     */
    function resolveOne(candidates: string | readonly string[]): string | null {
      const list = Array.isArray(candidates) ? candidates : [candidates];
      for (const c of list) {
        if (availableFieldsLower.has(c.toLowerCase())) {
          // Preserve original casing from DBF header
          const original = dbf.fields.find((f) => f.name.toLowerCase() === c.toLowerCase());
          return original?.name ?? c;
        }
      }
      return null;
    }

    // Descriptor-Cache: für jeden Schema-Key entweder ein string (scalar) oder
    // string[] (composite). Falls Fallback-Match → einmal loggen.
    type ResolvedField = string | (string | null)[] | null;
    const resolvedFields: Record<string, ResolvedField> = {};
    const fallbackHits: Record<string, string> = {};

    for (const [key, descriptor] of Object.entries(schema) as Array<
      [string, FieldDescriptor]
    >) {
      if (isCompositeDescriptor(descriptor)) {
        // Composite: pro Element auflösen, Array<string|null>
        resolvedFields[key] = descriptor.composite.map((c) => resolveOne(c));
      } else {
        const resolved = resolveOne(descriptor.dbf);
        resolvedFields[key] = resolved;
        // Fallback-Log: wenn nicht der erste Kandidat gewonnen hat
        const primary = Array.isArray(descriptor.dbf) ? descriptor.dbf[0] : descriptor.dbf;
        if (resolved && resolved !== primary) {
          fallbackHits[key] = resolved;
        }
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
        const resolved = resolvedFields[key];

        if (isCompositeDescriptor(descriptor)) {
          // Composite → Array<number | null>
          const dbfNames = resolved as (string | null)[];
          record[key] = dbfNames.map((n) => {
            if (!n) return null;
            const raw = descriptor.int ? getInt(rec, n) : getNum(rec, n);
            return raw != null && descriptor.scale != null
              ? raw * descriptor.scale
              : raw;
          });
        } else if (isBoolDescriptor(descriptor)) {
          const dbfName = resolved as string | null;
          record[key] = dbfName ? getBool(rec, dbfName) : false;
        } else {
          const dbfName = resolved as string | null;
          if (!dbfName) {
            record[key] = null;
            continue;
          }
          const raw = descriptor.int ? getInt(rec, dbfName) : getNum(rec, dbfName);
          record[key] =
            raw != null && descriptor.scale != null ? raw * descriptor.scale : raw;
        }
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


// =============================================================================
// Aggregat-Reader (date-basiert)
// =============================================================================

/**
 * AVR/AVW/AVM/AVY: Verfuegbarkeit (IEC 61400-26 T1-T6).
 * Alle Zeiten in Sekunden.
 */
export const AVR_SCHEMA: ReaderSchemaByDate<AvailabilityRecord> = {
  t1: { dbf: "T1", int: true },
  t2: { dbf: "T2", int: true },
  t3: { dbf: "T3", int: true },
  t4: { dbf: "T4", int: true },
  t5: { dbf: "T5", int: true },
  t6: { dbf: "T6", int: true },
  t5_1: { dbf: "T5_1", int: true },
  t5_2: { dbf: "T5_2", int: true },
  t5_3: { dbf: "T5_3", int: true },
};

/**
 * SSM: State Summary Monthly — Aggregat pro Zustand.
 * Duration in Sekunden.
 */
export const SSM_SCHEMA: ReaderSchemaByDate<StateSummaryRecord> = {
  state: { dbf: "State", int: true },
  subState: { dbf: "SubState", int: true },
  isFault: { dbf: "FaultMsg", bool: true },
  frequency: { dbf: "Frequency", int: true },
  duration: { dbf: "Duration", int: true },
};

/**
 * SWM: Warning Summary Monthly — Aggregat pro Warnung.
 */
export const SWM_SCHEMA: ReaderSchemaByDate<WarningSummaryRecord> = {
  warn: { dbf: "Warn", int: true },
  subWarn: { dbf: "SubWarn", int: true },
  isWarnMsg: { dbf: "WarnMsg", bool: true },
  frequency: { dbf: "Frequency", int: true },
  duration: { dbf: "Duration", int: true },
};

/**
 * Generischer Reader fuer date-basierte Aggregat-Records (AVR/SSM/SWM/...).
 * Unterschied zu readDbfWithSchema: Timestamp aus Date-Feld (nicht buildTimestamp
 * mit Hour/Minute/Second), Output-Feld heisst `date` statt `timestamp`.
 */
export async function readDbfWithDateSchema<T>(
  filePath: string,
  schema: ReaderSchemaByDate<T>,
  loggerContext: string,
): Promise<T[]> {
  try {
    const dbf = await DBFFile.open(filePath);
    const rawRecords = await dbf.readRecords();

    const availableFieldsLower = new Set(dbf.fields.map((f) => f.name.toLowerCase()));

    function resolveOne(candidates: string | readonly string[]): string | null {
      const list = Array.isArray(candidates) ? candidates : [candidates];
      for (const c of list) {
        if (availableFieldsLower.has(c.toLowerCase())) {
          const original = dbf.fields.find((f) => f.name.toLowerCase() === c.toLowerCase());
          return original?.name ?? c;
        }
      }
      return null;
    }

    type ResolvedField = string | (string | null)[] | null;
    const resolvedFields: Record<string, ResolvedField> = {};
    for (const [key, descriptor] of Object.entries(schema) as Array<[string, FieldDescriptor]>) {
      if (isCompositeDescriptor(descriptor)) {
        resolvedFields[key] = descriptor.composite.map((c) => resolveOne(c));
      } else {
        resolvedFields[key] = resolveOne(descriptor.dbf);
      }
    }

    const records: T[] = [];
    for (const raw of rawRecords) {
      const rec = raw as Record<string, unknown>;

      const date = getDateField(rec);
      if (!date) continue;

      const plantNo = getPlantNo(rec);
      if (!plantNo) continue;

      const record: Record<string, unknown> = { date, plantNo };

      for (const [key, descriptor] of Object.entries(schema) as Array<[string, FieldDescriptor]>) {
        const resolved = resolvedFields[key];
        if (isCompositeDescriptor(descriptor)) {
          const dbfNames = resolved as (string | null)[];
          record[key] = dbfNames.map((n) => {
            if (!n) return null;
            const raw = descriptor.int ? getInt(rec, n) : getNum(rec, n);
            return raw != null && descriptor.scale != null ? raw * descriptor.scale : raw;
          });
        } else if (isBoolDescriptor(descriptor)) {
          const dbfName = resolved as string | null;
          record[key] = dbfName ? getBool(rec, dbfName) : false;
        } else {
          const dbfName = resolved as string | null;
          if (!dbfName) { record[key] = null; continue; }
          const raw = descriptor.int ? getInt(rec, dbfName) : getNum(rec, dbfName);
          record[key] = raw != null && descriptor.scale != null ? raw * descriptor.scale : raw;
        }
      }
      records.push(record as T);
    }
    return records;
  } catch (err) {
    scadaLogger.error({ err, filePath, context: loggerContext }, `Error reading ${loggerContext} file`);
    return [];
  }
}
