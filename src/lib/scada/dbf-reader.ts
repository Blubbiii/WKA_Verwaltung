/**
 * DBF-Reader Service für Enercon SCADA-Daten
 *
 * Liest dBASE III (DBF) Dateien aus dem Enercon SCADA-System.
 * Unterstuetzt alle Enercon-Dateitypen:
 *
 *   WSD - Wind Speed Daily (10-Min Leistungsdaten)
 *   UID - Electrical / Grid Data (Zaehlerstaende, Netzparameter)
 *   AVR/AVW/AVM/AVY - Availability (Verfügbarkeit: daily/weekly/monthly/yearly)
 *   SSM - State Summary Monthly (Zustandsstatistik)
 *   SWM - Warning Summary Monthly (Warnungsstatistik)
 *   PES - Plant Event State (Zustandsereignisse)
 *   PEW - Plant Event Warning (Warnungsereignisse)
 *   PET - Plant Event Text (Textereignisse)
 *   WSR/WSW/WSM/WSY - Wind Summary (Zusammenfassungen: daily/weekly/monthly/yearly)
 *
 * Die Dateien liegen in der Enercon-Verzeichnisstruktur:
 *   Loc_XXXX/YYYY/MM/YYYYMMDD.ext (Tagesdateien)
 *   Loc_XXXX/YYYY/YYYYMM00.ext (Monatszusammenfassungen)
 */

import { DBFFile } from 'dbffile';
import * as path from 'path';
import * as fs from 'fs/promises';
import { logger } from '@/lib/logger';

const scadaLogger = logger.child({ module: 'scada' });

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

/** Ergebnis eines Standort-Scans */
export interface LocationScanResult {
  /** Dateityp (z.B. "WSD", "UID") */
  fileType: string;
  /** Gefundene DBF-Dateien (absolute Pfade) */
  files: string[];
  /** Zeitraum der Daten (aus Dateinamen oder Inhalt) */
  dateRange: { from: Date | null; to: Date | null };
  /** Anlagen-Nummern die in den Dateien vorkommen */
  plantNumbers: number[];
}

/** Einzelner Messwert aus einer WSD-Datei */
export interface WsdRecord {
  /** Zeitstempel des 10-Min-Intervalls */
  timestamp: Date;
  /** Anlagen-Nummer innerhalb des Standorts */
  plantNo: number;
  /** Windgeschwindigkeit in m/s (null = kein Messwert) */
  windSpeedMs: number | null;
  /** Wirkleistung in Watt (null = kein Messwert) */
  powerW: number | null;
  /** Rotordrehzahl in RPM (null = kein Messwert) */
  rotorRpm: number | null;
  /** Kumulative Betriebsstunden (null = kein Messwert) */
  operatingHours: number | null;
  /** Windrichtung in Grad (null = kein Messwert) */
  windDirection: number | null;
}

/** Einzelner Messwert aus einer UID-Datei (Electrical / Grid Data) */
export interface UidRecord {
  /** Zeitstempel des 10-Min-Intervalls */
  timestamp: Date;
  /** Anlagen-Nummer innerhalb des Standorts */
  plantNo: number;
  /** Error code (0 = no error) */
  error: number | null;

  // Active Power (W)
  /** Mean active power in W */
  meanPowerW: number | null;
  /** Peak active power in W */
  peakPowerW: number | null;
  /** Low active power in W */
  lowPowerW: number | null;

  // Reactive Power (VAr)
  /** Mean reactive power in VAr */
  meanReactivePowerVar: number | null;
  /** Peak reactive power in VAr */
  peakReactivePowerVar: number | null;
  /** Low reactive power in VAr */
  lowReactivePowerVar: number | null;

  // Apparent Power (VA)
  /** Mean apparent power in VA */
  meanApparentPowerVa: number | null;
  /** Peak apparent power in VA */
  peakApparentPowerVa: number | null;
  /** Low apparent power in VA */
  lowApparentPowerVa: number | null;

  // Power Factor (cos phi)
  /** Mean power factor cos(phi) */
  meanCosPhi: number | null;
  /** Peak power factor cos(phi) */
  peakCosPhi: number | null;
  /** Low power factor cos(phi) */
  lowCosPhi: number | null;

  // Grid Frequency (Hz)
  /** Mean grid frequency in Hz */
  meanFrequencyHz: number | null;
  /** Peak grid frequency in Hz */
  peakFrequencyHz: number | null;
  /** Low grid frequency in Hz */
  lowFrequencyHz: number | null;

  // Phase Voltages (V) - U1, U2, U3
  /** Mean phase voltages [U1, U2, U3] in V */
  meanVoltagesV: [number | null, number | null, number | null];
  /** Peak phase voltages [U1, U2, U3] in V */
  peakVoltagesV: [number | null, number | null, number | null];
  /** Low phase voltages [U1, U2, U3] in V */
  lowVoltagesV: [number | null, number | null, number | null];

  // Phase Currents (A) - I1, I2, I3
  /** Mean phase currents [I1, I2, I3] in A */
  meanCurrentsA: [number | null, number | null, number | null];
  /** Peak phase currents [I1, I2, I3] in A */
  peakCurrentsA: [number | null, number | null, number | null];
  /** Low phase currents [I1, I2, I3] in A */
  lowCurrentsA: [number | null, number | null, number | null];

  // Apparent Power per Phase (VA) - S1, S2, S3
  /** Mean apparent power per phase [S1, S2, S3] in VA */
  meanApparentPowerPerPhaseVa: [number | null, number | null, number | null];

  // Cumulative Counters
  /** Cumulative active energy produced (kWh or Wh depending on firmware) */
  cumulativeActiveEnergyProduced: number | null;
  /** Cumulative energy consumed (kWh or Wh) */
  cumulativeEnergyConsumed: number | null;
  /** Cumulative inductive reactive energy */
  cumulativeInductiveReactiveEnergy: number | null;
  /** Cumulative capacitive reactive energy */
  cumulativeCapacitiveReactiveEnergy: number | null;
  /** Cumulative working hours */
  cumulativeWorkingHours: number | null;
}

/** Availability record from AVR/AVW/AVM/AVY files */
export interface AvailabilityRecord {
  /** Date of the record */
  date: Date;
  /** Plant number */
  plantNo: number;
  /** T1: Production time in seconds */
  t1: number | null;
  /** T2: Waiting for wind in seconds */
  t2: number | null;
  /** T3: Environmental stop in seconds */
  t3: number | null;
  /** T4: Routine maintenance in seconds */
  t4: number | null;
  /** T5: Equipment failure in seconds */
  t5: number | null;
  /** T6: Other downtime in seconds */
  t6: number | null;
  /** T5_1: External stop - grid failure */
  t5_1: number | null;
  /** T5_2: External stop - remote stop */
  t5_2: number | null;
  /** T5_3: External stop - other */
  t5_3: number | null;
}

/** State summary record from SSM files */
export interface StateSummaryRecord {
  /** Date of the summary period */
  date: Date;
  /** Plant number */
  plantNo: number;
  /** State code */
  state: number | null;
  /** Sub-state code */
  subState: number | null;
  /** Whether this is a fault message */
  isFault: boolean;
  /** Number of times this state occurred */
  frequency: number | null;
  /** Total duration of this state in seconds */
  duration: number | null;
}

/** Warning summary record from SWM files */
export interface WarningSummaryRecord {
  /** Date of the summary period */
  date: Date;
  /** Plant number */
  plantNo: number;
  /** Warning code */
  warn: number | null;
  /** Sub-warning code */
  subWarn: number | null;
  /** Whether this is a warning message */
  isWarnMsg: boolean;
  /** Number of times this warning occurred */
  frequency: number | null;
  /** Total duration of this warning in seconds */
  duration: number | null;
}

/** State event record from PES files */
export interface StateEventRecord {
  /** Timestamp of the event */
  timestamp: Date;
  /** Plant number */
  plantNo: number;
  /** State code */
  state: number | null;
  /** Sub-state code */
  subState: number | null;
  /** Whether service mode was active */
  isService: boolean;
  /** Whether this is a fault message */
  isFault: boolean;
  /** Wind speed at the time of the event in m/s */
  windSpeedAtEvent: number | null;
}

/** Warning event record from PEW files */
export interface WarningEventRecord {
  /** Timestamp of the event */
  timestamp: Date;
  /** Plant number */
  plantNo: number;
  /** Warning code */
  warn: number | null;
  /** Sub-warning code */
  subWarn: number | null;
  /** Whether this is a warning message */
  isWarnMsg: boolean;
}

/** Wind summary record from WSR/WSW/WSM/WSY files */
export interface WindSummaryRecord {
  /** Date of the summary period */
  date: Date;
  /** Plant number */
  plantNo: number;
  /** Number of samples in this summary period */
  sampleCount: number | null;

  // Wind Speed (m/s)
  /** Mean wind speed in m/s */
  meanWindSpeedMs: number | null;
  /** Peak wind speed in m/s */
  peakWindSpeedMs: number | null;
  /** Low wind speed in m/s */
  lowWindSpeedMs: number | null;

  // Rotor RPM
  /** Mean rotor RPM */
  meanRotorRpm: number | null;
  /** Peak rotor RPM */
  peakRotorRpm: number | null;
  /** Low rotor RPM */
  lowRotorRpm: number | null;

  // Power (kW - raw from file, NOT converted to W)
  /** Mean power in kW */
  meanPowerKw: number | null;
  /** Peak power in kW */
  peakPowerKw: number | null;
  /** Low power in kW */
  lowPowerKw: number | null;

  // Reactive Power (kVAr)
  /** Mean reactive power in kVAr */
  meanReactivePowerKvar: number | null;
  /** Peak reactive power in kVAr */
  peakReactivePowerKvar: number | null;
  /** Low reactive power in kVAr */
  lowReactivePowerKvar: number | null;

  // Nacelle / Wind Direction
  /** Mean nacelle position (wind direction) in degrees */
  meanWindDirection: number | null;

  // Cumulative Counters
  /** Cumulative operating hours */
  cumulativeOperatingHours: number | null;
  /** Cumulative energy produced (kWh) */
  cumulativeEnergyKwh: number | null;
  /** Cumulative minutes worked */
  cumulativeWorkMinutes: number | null;

  // Power Components (kW)
  /** Mean wind power component in kW */
  meanPowerWindKw: number | null;
  /** Mean technical power component in kW */
  meanPowerTechnicalKw: number | null;
  /** Mean forced power component in kW */
  meanPowerForcedKw: number | null;
  /** Mean external power component in kW */
  meanPowerExternalKw: number | null;

  // Blade Angle
  /** Mean blade angle in degrees */
  meanBladeAngle: number | null;

  // Environmental Sensors
  /** Mean rainfall in mm */
  meanRainfall: number | null;
  /** Peak rainfall in mm */
  peakRainfall: number | null;
  /** Low rainfall in mm */
  lowRainfall: number | null;

  /** Mean visibility range in m */
  meanVisibilityRange: number | null;
  /** Peak visibility range in m */
  peakVisibilityRange: number | null;
  /** Low visibility range in m */
  lowVisibilityRange: number | null;

  /** Mean brightness in arbitrary units */
  meanBrightness: number | null;

  /** Mean lightning current in A */
  meanLightningCurrent: number | null;

  /** Mean ice detection value */
  meanIceDetection: number | null;

  /** Mean air pressure in hPa */
  meanAirPressure: number | null;

  /** Mean air humidity in % */
  meanAirHumidity: number | null;

  /** Peak timestamps for various measurements (JSON-compatible) */
  peakTimestamps: Record<string, { hour?: number; minute?: number; second?: number; date?: Date | null }>;
}

/** Text event record from PET files */
export interface TextEventRecord {
  /** Timestamp of the event */
  timestamp: Date;
  /** Plant number */
  plantNo: number;
  /** Info text (up to 100 characters) */
  info: string;
}

/** Ergebnis eines Multi-Location-Scans */
export interface AllLocationsResult {
  /** Standort-Code (z.B. "Loc_5842") */
  locationCode: string;
  /** Anlagen-Nummern im Standort */
  plantNumbers: number[];
  /** Anzahl gefundener DBF-Dateien */
  fileCount: number;
  /** Zeitraum der Daten */
  dateRange: { from: Date | null; to: Date | null };
  /** Gefundene Dateitypen (z.B. ["WSD", "UID"]) */
  fileTypes: string[];
}

// ---------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------

/**
 * Ungültige Messwerte im Enercon SCADA-System.
 * Diese Werte bedeuten "Sensor nicht verfügbar" oder "Messfehler"
 * und muessen als null interpretiert werden.
 */
const INVALID_VALUES = [32767, 65535, 6553.5, 65.535];

/** Mapping von Dateityp-Kuerzel zu Dateiendung */
const FILE_TYPE_EXTENSIONS: Record<string, string> = {
  WSD: 'wsd',  // Wind Speed Daily (10-Min Leistungsdaten)
  UID: 'uid',  // Electrical Data (Zaehlerstaende, Netzparameter)
  AVR: 'avr',  // Availability Daily
  AVW: 'avw',  // Availability Weekly
  AVM: 'avm',  // Availability Monthly
  AVY: 'avy',  // Availability Yearly
  SSM: 'ssm',  // State Summary Monthly
  SWM: 'swm',  // Warning Summary Monthly
  PES: 'pes',  // Plant Event State
  PEW: 'pew',  // Plant Event Warning
  PET: 'pet',  // Plant Event Text
  WSR: 'wsr',  // Wind Summary Daily (Report)
  WSW: 'wsw',  // Wind Summary Weekly
  WSM: 'wsm',  // Wind Summary Monthly
  WSY: 'wsy',  // Wind Summary Yearly
};

/** Bekannte Dateitypen */
const KNOWN_FILE_TYPES = Object.keys(FILE_TYPE_EXTENSIONS);

// ---------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------

/**
 * Prueft ob ein Messwert gültig ist.
 * Enercon SCADA verwendet 32767, 65535, 6553.5 und 65.535 als "kein Messwert"-Markierung.
 */
function isValidValue(val: unknown): val is number {
  if (val == null || typeof val !== 'number') return false;
  return !INVALID_VALUES.includes(val) && isFinite(val);
}

/**
 * Konvertiert einen unbekannten Wert in eine Zahl oder null.
 * Beruecksichtigt die SCADA-spezifischen ungültigen Werte.
 */
function toValidNumber(val: unknown): number | null {
  if (val == null) return null;
  const num = typeof val === 'number' ? val : Number(val);
  if (!isValidValue(num)) return null;
  return num;
}

/**
 * Case-insensitive field getter for DBF records.
 * Enercon DBF files may have fields in any casing (e.g. "PlantNo", "PLANTNO", "plantno").
 * This helper tries multiple casings to reliably extract a field value.
 *
 * @param rec - The raw DBF record as key-value map
 * @param fieldName - The expected field name (canonical casing)
 * @returns The field value or undefined if not found
 */
function caseGet(rec: Record<string, unknown>, fieldName: string): unknown {
  // Try canonical name first (fastest path)
  if (rec[fieldName] !== undefined) return rec[fieldName];
  // Try all uppercase
  const upper = fieldName.toUpperCase();
  if (rec[upper] !== undefined) return rec[upper];
  // Try all lowercase
  const lower = fieldName.toLowerCase();
  if (rec[lower] !== undefined) return rec[lower];
  // Fallback: case-insensitive search through all keys
  const lowerField = fieldName.toLowerCase();
  for (const key of Object.keys(rec)) {
    if (key.toLowerCase() === lowerField) {
      return rec[key];
    }
  }
  return undefined;
}

/**
 * Extracts a number field from a DBF record using case-insensitive lookup.
 * Returns null for invalid/sentinel values.
 */
function getNum(rec: Record<string, unknown>, fieldName: string): number | null {
  return toValidNumber(caseGet(rec, fieldName));
}

/**
 * Extracts an integer field from a DBF record using case-insensitive lookup.
 * Returns null for invalid/sentinel values. Rounds the value to integer.
 */
function getInt(rec: Record<string, unknown>, fieldName: string): number | null {
  const val = toValidNumber(caseGet(rec, fieldName));
  return val != null ? Math.round(val) : null;
}

/**
 * Extracts a boolean field from a DBF record using case-insensitive lookup.
 * DBF boolean fields may be stored as boolean, number (0/1), or string ("T"/"F").
 */
function getBool(rec: Record<string, unknown>, fieldName: string): boolean {
  const val = caseGet(rec, fieldName);
  if (val == null) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') {
    const upper = val.toUpperCase().trim();
    return upper === 'T' || upper === 'TRUE' || upper === 'Y' || upper === 'YES' || upper === '1';
  }
  return false;
}

/**
 * Extracts a string field from a DBF record using case-insensitive lookup.
 * Returns the trimmed string or empty string if not found.
 */
function getStr(rec: Record<string, unknown>, fieldName: string): string {
  const val = caseGet(rec, fieldName);
  if (val == null) return '';
  return String(val).trim();
}

/**
 * Extrahiert ein Datum aus einem DBF-Feld.
 * Enercon speichert Timestamps als Date-Objekte oder als Strings.
 */
function toDate(val: unknown): Date | null {
  if (val == null) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'string') {
    const parsed = new Date(val);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Builds a UTC timestamp from a Date field plus Hour/Minute/Second fields in a DBF record.
 * Returns null if the date field is missing or invalid.
 */
function buildTimestamp(rec: Record<string, unknown>): Date | null {
  const dateVal = toDate(caseGet(rec, 'Date'));
  if (!dateVal) return null;

  const hour = Number(caseGet(rec, 'Hour') ?? 0);
  const minute = Number(caseGet(rec, 'Minute') ?? 0);
  const second = Number(caseGet(rec, 'Second') ?? 0);

  const timestamp = new Date(Date.UTC(
    dateVal.getUTCFullYear(),
    dateVal.getUTCMonth(),
    dateVal.getUTCDate(),
    isNaN(hour) ? 0 : hour,
    isNaN(minute) ? 0 : minute,
    isNaN(second) ? 0 : second,
  ));

  return isNaN(timestamp.getTime()) ? null : timestamp;
}

/**
 * Extracts the PlantNo field from a DBF record.
 * Returns the plant number or null if missing/invalid.
 */
function getPlantNo(rec: Record<string, unknown>): number | null {
  const plantNo = Number(caseGet(rec, 'PlantNo'));
  if (isNaN(plantNo) || plantNo <= 0) return null;
  return plantNo;
}

/**
 * Extracts the Date field from a DBF record.
 * Returns the date or null if missing/invalid.
 */
function getDateField(rec: Record<string, unknown>): Date | null {
  return toDate(caseGet(rec, 'Date'));
}

/**
 * Prueft ob ein Verzeichnis existiert.
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------
// Reader Functions
// ---------------------------------------------------------------

/**
 * Liest eine WSD-Datei (Wind Speed Daily) und gibt die Messwerte zurück.
 *
 * WSD-Dateien enthalten 10-Minuten-Intervall-Daten mit folgenden Feldern:
 * - Date: Datum (Date-Objekt, nur der Tag)
 * - Hour, Minute, Second: Uhrzeit-Felder (numerisch)
 * - PlantNo: Anlagen-Nummer (1-n)
 * - mrwSmpVWi: Mittelwert Windgeschwindigkeit in m/s
 * - mrwAbGoPos: Gondelposition / Windrichtung in Grad
 * - mrwSmpP: Mittelwert Leistung in kW
 * - mrwSmpNRot: Mittelwert Rotordrehzahl in RPM
 * - arwAbWorkH: Kumulative Betriebsstunden
 *
 * WICHTIG: Werte 32767, 65535, 6553.5, 65.535 sind Enercon-spezifische
 *          "kein Messwert"-Markierungen und werden als null zurückgegeben.
 *
 * @param filePath - Absoluter Pfad zur .wsd Datei (dBASE III Format)
 * @returns Array der geparseten WSD-Messwerte
 */
export async function readWsdFile(filePath: string): Promise<WsdRecord[]> {
  try {
    const dbf = await DBFFile.open(filePath);
    const rawRecords = await dbf.readRecords();

    const records: WsdRecord[] = [];

    for (const raw of rawRecords) {
      const rec = raw as Record<string, unknown>;

      const timestamp = buildTimestamp(rec);
      if (!timestamp) continue;

      const plantNo = getPlantNo(rec);
      if (!plantNo) continue;

      // Power: mrwSmpP is in kW, database expects Watt -> * 1000
      const powerKw = getNum(rec, 'mrwSmpP');

      records.push({
        timestamp,
        plantNo,
        windSpeedMs: getNum(rec, 'mrwSmpVWi'),
        powerW: powerKw != null ? powerKw * 1000 : null,
        rotorRpm: getNum(rec, 'mrwSmpNRot'),
        operatingHours: getNum(rec, 'arwAbWorkH'),
        windDirection: getNum(rec, 'mrwAbGoPos'),
      });
    }

    return records;
  } catch (err) {
    scadaLogger.error({ err, filePath }, "Error reading WSD file");
    return [];
  }
}

/**
 * Liest eine UID-Datei (Electrical / Grid Data).
 *
 * UID-Dateien enthalten 10-Minuten-Intervall-Daten mit Netz- und Leistungsparametern:
 * - Wirkleistung (P), Blindleistung (Q), Scheinleistung (S) jeweils als mean/peak/low
 * - Leistungsfaktor cos(phi), Netzfrequenz
 * - Phasenspannungen (U1-U3) und Phasenstrme (I1-I3)
 * - Kumulative Zaehlerstaende (Einspeisung, Bezug, Blindenergie, Betriebsstunden)
 *
 * @param filePath - Absoluter Pfad zur .uid Datei (dBASE III Format)
 * @returns Array der geparseten UID-Messwerte
 */
export async function readUidFile(filePath: string): Promise<UidRecord[]> {
  try {
    const dbf = await DBFFile.open(filePath);
    const rawRecords = await dbf.readRecords();

    const records: UidRecord[] = [];

    for (const raw of rawRecords) {
      const rec = raw as Record<string, unknown>;

      const timestamp = buildTimestamp(rec);
      if (!timestamp) continue;

      const plantNo = getPlantNo(rec);
      if (!plantNo) continue;

      records.push({
        timestamp,
        plantNo,
        error: getInt(rec, 'Error'),

        // Active Power (W)
        meanPowerW: getNum(rec, 'mruiSmpP'),
        peakPowerW: getNum(rec, 'pruiSmpP'),
        lowPowerW: getNum(rec, 'lruiSmpP'),

        // Reactive Power (VAr)
        meanReactivePowerVar: getNum(rec, 'mruiSmpQ'),
        peakReactivePowerVar: getNum(rec, 'pruiSmpQ'),
        lowReactivePowerVar: getNum(rec, 'lruiSmpQ'),

        // Apparent Power (VA)
        meanApparentPowerVa: getNum(rec, 'mruiSmpS'),
        peakApparentPowerVa: getNum(rec, 'pruiSmpS'),
        lowApparentPowerVa: getNum(rec, 'lruiSmpS'),

        // Power Factor
        meanCosPhi: getNum(rec, 'mruiSmpCos'),
        peakCosPhi: getNum(rec, 'pruiSmpCos'),
        lowCosPhi: getNum(rec, 'lruiSmpCos'),

        // Grid Frequency (Hz)
        meanFrequencyHz: getNum(rec, 'mruiSmpFre'),
        peakFrequencyHz: getNum(rec, 'pruiSmpFre'),
        lowFrequencyHz: getNum(rec, 'lruiSmpFre'),

        // Phase Voltages (V)
        meanVoltagesV: [
          getNum(rec, 'mruiSmpU1'),
          getNum(rec, 'mruiSmpU2'),
          getNum(rec, 'mruiSmpU3'),
        ],
        peakVoltagesV: [
          getNum(rec, 'pruiSmpU1'),
          getNum(rec, 'pruiSmpU2'),
          getNum(rec, 'pruiSmpU3'),
        ],
        lowVoltagesV: [
          getNum(rec, 'lruiSmpU1'),
          getNum(rec, 'lruiSmpU2'),
          getNum(rec, 'lruiSmpU3'),
        ],

        // Phase Currents (A)
        meanCurrentsA: [
          getNum(rec, 'mruiSmpI1'),
          getNum(rec, 'mruiSmpI2'),
          getNum(rec, 'mruiSmpI3'),
        ],
        peakCurrentsA: [
          getNum(rec, 'pruiSmpI1'),
          getNum(rec, 'pruiSmpI2'),
          getNum(rec, 'pruiSmpI3'),
        ],
        lowCurrentsA: [
          getNum(rec, 'lruiSmpI1'),
          getNum(rec, 'lruiSmpI2'),
          getNum(rec, 'lruiSmpI3'),
        ],

        // Apparent Power per Phase (VA)
        meanApparentPowerPerPhaseVa: [
          getNum(rec, 'mruiSmpS1'),
          getNum(rec, 'mruiSmpS2'),
          getNum(rec, 'mruiSmpS3'),
        ],

        // Cumulative Counters
        cumulativeActiveEnergyProduced: getNum(rec, 'aruiAbWpr'),
        cumulativeEnergyConsumed: getNum(rec, 'aruiAbWcm'),
        cumulativeInductiveReactiveEnergy: getNum(rec, 'aruiAbQin'),
        cumulativeCapacitiveReactiveEnergy: getNum(rec, 'aruiAbQcap'),
        cumulativeWorkingHours: getNum(rec, 'aruiAbWkH'),
      });
    }

    return records;
  } catch (err) {
    scadaLogger.error({ err, filePath }, "Error reading UID file");
    return [];
  }
}

/**
 * Liest eine AVR/AVW/AVM/AVY-Datei (Availability).
 *
 * Availability-Dateien enthalten Verfügbarkeitsdaten mit Zeitkategorien T1-T6:
 * - T1: Production time (Produktion)
 * - T2: Waiting for wind (Windflaute)
 * - T3: Environmental stop (Umweltstop)
 * - T4: Routine maintenance (Wartung)
 * - T5: Equipment failure (Störung)
 * - T6: Other downtime (Sonstige)
 * - T5_1, T5_2, T5_3: External stop subtypes
 *
 * All time values are in seconds.
 *
 * @param filePath - Absoluter Pfad zur .avr/.avw/.avm/.avy Datei
 * @returns Array der geparseten Availability-Records
 */
export async function readAvrFile(filePath: string): Promise<AvailabilityRecord[]> {
  try {
    const dbf = await DBFFile.open(filePath);
    const rawRecords = await dbf.readRecords();

    const records: AvailabilityRecord[] = [];

    for (const raw of rawRecords) {
      const rec = raw as Record<string, unknown>;

      const date = getDateField(rec);
      if (!date) continue;

      const plantNo = getPlantNo(rec);
      if (!plantNo) continue;

      records.push({
        date,
        plantNo,
        t1: getInt(rec, 'T1'),
        t2: getInt(rec, 'T2'),
        t3: getInt(rec, 'T3'),
        t4: getInt(rec, 'T4'),
        t5: getInt(rec, 'T5'),
        t6: getInt(rec, 'T6'),
        t5_1: getInt(rec, 'T5_1'),
        t5_2: getInt(rec, 'T5_2'),
        t5_3: getInt(rec, 'T5_3'),
      });
    }

    return records;
  } catch (err) {
    scadaLogger.error({ err, filePath }, "Error reading AVR file");
    return [];
  }
}

/**
 * Liest eine SSM-Datei (State Summary Monthly).
 *
 * SSM-Dateien enthalten zusammengefasste Zustandsinformationen mit:
 * - State/SubState: Zustandscodes der Anlage
 * - FaultMsg: ob es sich um eine Störung handelt
 * - Frequency: Haeufigkeit des Zustands
 * - Duration: Gesamtdauer des Zustands in Sekunden
 *
 * @param filePath - Absoluter Pfad zur .ssm Datei
 * @returns Array der geparseten State-Summary-Records
 */
export async function readSsmFile(filePath: string): Promise<StateSummaryRecord[]> {
  try {
    const dbf = await DBFFile.open(filePath);
    const rawRecords = await dbf.readRecords();

    const records: StateSummaryRecord[] = [];

    for (const raw of rawRecords) {
      const rec = raw as Record<string, unknown>;

      const date = getDateField(rec);
      if (!date) continue;

      const plantNo = getPlantNo(rec);
      if (!plantNo) continue;

      records.push({
        date,
        plantNo,
        state: getInt(rec, 'State'),
        subState: getInt(rec, 'SubState'),
        isFault: getBool(rec, 'FaultMsg'),
        frequency: getInt(rec, 'Frequency'),
        duration: getInt(rec, 'Duration'),
      });
    }

    return records;
  } catch (err) {
    scadaLogger.error({ err, filePath }, "Error reading SSM file");
    return [];
  }
}

/**
 * Liest eine SWM-Datei (Warning Summary Monthly).
 *
 * SWM-Dateien enthalten zusammengefasste Warnungsinformationen mit:
 * - Warn/SubWarn: Warnungscodes
 * - WarnMsg: ob es sich um eine Warnmeldung handelt
 * - Frequency: Haeufigkeit der Warnung
 * - Duration: Gesamtdauer der Warnung in Sekunden
 *
 * @param filePath - Absoluter Pfad zur .swm Datei
 * @returns Array der geparseten Warning-Summary-Records
 */
export async function readSwmFile(filePath: string): Promise<WarningSummaryRecord[]> {
  try {
    const dbf = await DBFFile.open(filePath);
    const rawRecords = await dbf.readRecords();

    const records: WarningSummaryRecord[] = [];

    for (const raw of rawRecords) {
      const rec = raw as Record<string, unknown>;

      const date = getDateField(rec);
      if (!date) continue;

      const plantNo = getPlantNo(rec);
      if (!plantNo) continue;

      records.push({
        date,
        plantNo,
        warn: getInt(rec, 'Warn'),
        subWarn: getInt(rec, 'SubWarn'),
        isWarnMsg: getBool(rec, 'WarnMsg'),
        frequency: getInt(rec, 'Frequency'),
        duration: getInt(rec, 'Duration'),
      });
    }

    return records;
  } catch (err) {
    scadaLogger.error({ err, filePath }, "Error reading SWM file");
    return [];
  }
}

/**
 * Liest eine PES-Datei (Plant Event State).
 *
 * PES-Dateien enthalten einzelne Zustandsereignisse mit Zeitstempel:
 * - State/SubState: Zustandscodes
 * - Service: ob Servicemodus aktiv war
 * - FaultMsg: ob Störungsmeldung
 * - Value0: Windgeschwindigkeit zum Zeitpunkt des Ereignisses
 *
 * @param filePath - Absoluter Pfad zur .pes Datei
 * @returns Array der geparseten State-Event-Records
 */
export async function readPesFile(filePath: string): Promise<StateEventRecord[]> {
  try {
    const dbf = await DBFFile.open(filePath);
    const rawRecords = await dbf.readRecords();

    const records: StateEventRecord[] = [];

    for (const raw of rawRecords) {
      const rec = raw as Record<string, unknown>;

      const timestamp = buildTimestamp(rec);
      if (!timestamp) continue;

      const plantNo = getPlantNo(rec);
      if (!plantNo) continue;

      records.push({
        timestamp,
        plantNo,
        state: getInt(rec, 'State'),
        subState: getInt(rec, 'SubState'),
        isService: getBool(rec, 'Service'),
        isFault: getBool(rec, 'FaultMsg'),
        windSpeedAtEvent: getNum(rec, 'Value0'),
      });
    }

    return records;
  } catch (err) {
    scadaLogger.error({ err, filePath }, "Error reading PES file");
    return [];
  }
}

/**
 * Liest eine PEW-Datei (Plant Event Warning).
 *
 * PEW-Dateien enthalten einzelne Warnungsereignisse mit Zeitstempel:
 * - Warn/SubWarn: Warnungscodes
 * - WarnMsg: ob Warnmeldung
 *
 * @param filePath - Absoluter Pfad zur .pew Datei
 * @returns Array der geparseten Warning-Event-Records
 */
export async function readPewFile(filePath: string): Promise<WarningEventRecord[]> {
  try {
    const dbf = await DBFFile.open(filePath);
    const rawRecords = await dbf.readRecords();

    const records: WarningEventRecord[] = [];

    for (const raw of rawRecords) {
      const rec = raw as Record<string, unknown>;

      const timestamp = buildTimestamp(rec);
      if (!timestamp) continue;

      const plantNo = getPlantNo(rec);
      if (!plantNo) continue;

      records.push({
        timestamp,
        plantNo,
        warn: getInt(rec, 'Warn'),
        subWarn: getInt(rec, 'SubWarn'),
        isWarnMsg: getBool(rec, 'WarnMsg'),
      });
    }

    return records;
  } catch (err) {
    scadaLogger.error({ err, filePath }, "Error reading PEW file");
    return [];
  }
}

/**
 * Liest eine WSR/WSW/WSM/WSY-Datei (Wind Summary).
 *
 * Wind-Summary-Dateien enthalten aggregierte Messdaten mit:
 * - Alle Kern-Messwerte wie in WSD (Wind, Leistung, Rotor) als mean/peak/low
 * - Zusätzliche Umweltsensoren (Regen, Sicht, Helligkeit, Blitz, Eis)
 * - Kumulative Zaehler (Energie, Betriebsstunden, Arbeitsminuten)
 * - Leistungskomponenten (Wind, Technik, Zwang, Extern)
 * - Peak-Zeitstempel für verschiedene Messwerte
 * - SmpCount: Anzahl der Messwerte in der Zusammenfassung
 *
 * Die verschiedenen Dateitypen haben die gleiche Struktur, unterscheiden sich aber
 * im Aggregationszeitraum:
 * - WSR: Tageszusammenfassung (Daily Report)
 * - WSW: Wochenzusammenfassung
 * - WSM: Monatszusammenfassung
 * - WSY: Jahreszusammenfassung
 *
 * @param filePath - Absoluter Pfad zur .wsr/.wsw/.wsm/.wsy Datei
 * @returns Array der geparseten Wind-Summary-Records
 */
export async function readWsrFile(filePath: string): Promise<WindSummaryRecord[]> {
  try {
    const dbf = await DBFFile.open(filePath);
    const rawRecords = await dbf.readRecords();

    const records: WindSummaryRecord[] = [];

    for (const raw of rawRecords) {
      const rec = raw as Record<string, unknown>;

      const date = getDateField(rec);
      if (!date) continue;

      const plantNo = getPlantNo(rec);
      if (!plantNo) continue;

      // Collect peak timestamps from various HourN/MinuteN/SecondN or DateN fields
      const peakTimestamps: Record<string, { hour?: number; minute?: number; second?: number; date?: Date | null }> = {};

      // Common peak timestamp fields: wind speed, rotor RPM, power
      const peakFields = [
        { prefix: 'VWi', label: 'windSpeed' },
        { prefix: 'NRot', label: 'rotorRpm' },
        { prefix: 'P', label: 'power' },
        { prefix: 'Q', label: 'reactivePower' },
        { prefix: 'Rai', label: 'rainfall' },
        { prefix: 'VisR', label: 'visibility' },
      ];

      for (const pf of peakFields) {
        // Try HourN/MinuteN/SecondN pattern (used in daily files)
        const hourVal = getInt(rec, `Hour${pf.prefix}`);
        const minuteVal = getInt(rec, `Minute${pf.prefix}`);
        const secondVal = getInt(rec, `Second${pf.prefix}`);
        // Try DateN pattern (used in monthly/yearly files)
        const dateVal = toDate(caseGet(rec, `Date${pf.prefix}`));

        if (hourVal != null || minuteVal != null || secondVal != null || dateVal != null) {
          peakTimestamps[pf.label] = {};
          if (hourVal != null) peakTimestamps[pf.label].hour = hourVal;
          if (minuteVal != null) peakTimestamps[pf.label].minute = minuteVal;
          if (secondVal != null) peakTimestamps[pf.label].second = secondVal;
          if (dateVal != null) peakTimestamps[pf.label].date = dateVal;
        }
      }

      records.push({
        date,
        plantNo,
        sampleCount: getInt(rec, 'SmpCount'),

        // Wind Speed (m/s)
        meanWindSpeedMs: getNum(rec, 'mrwSmpVWi'),
        peakWindSpeedMs: getNum(rec, 'prwSmpVWi'),
        lowWindSpeedMs: getNum(rec, 'lrwSmpVWi'),

        // Rotor RPM
        meanRotorRpm: getNum(rec, 'mrwSmpNRot'),
        peakRotorRpm: getNum(rec, 'prwSmpNRot'),
        lowRotorRpm: getNum(rec, 'lrwSmpNRot'),

        // Power (kW - raw from file)
        meanPowerKw: getNum(rec, 'mrwSmpP'),
        peakPowerKw: getNum(rec, 'prwSmpP'),
        lowPowerKw: getNum(rec, 'lrwSmpP'),

        // Reactive Power (kVAr)
        meanReactivePowerKvar: getNum(rec, 'mrwSmpQ'),
        peakReactivePowerKvar: getNum(rec, 'prwSmpQ'),
        lowReactivePowerKvar: getNum(rec, 'lrwSmpQ'),

        // Nacelle / Wind Direction
        meanWindDirection: getNum(rec, 'mrwAbGoPos'),

        // Cumulative Counters
        cumulativeOperatingHours: getNum(rec, 'arwAbWorkH'),
        cumulativeEnergyKwh: getNum(rec, 'arwAbW'),
        cumulativeWorkMinutes: getNum(rec, 'arwAbWrkM'),

        // Power Components (kW)
        meanPowerWindKw: getNum(rec, 'mrwSmpPwin'),
        meanPowerTechnicalKw: getNum(rec, 'mrwSmpPte'),
        meanPowerForcedKw: getNum(rec, 'mrwSmpPfm'),
        meanPowerExternalKw: getNum(rec, 'mrwSmpPext'),

        // Blade Angle
        meanBladeAngle: getNum(rec, 'mrwSmpAng'),

        // Environmental Sensors
        meanRainfall: getNum(rec, 'mrwSmpRai'),
        peakRainfall: getNum(rec, 'prwSmpRai'),
        lowRainfall: getNum(rec, 'lrwSmpRai'),

        meanVisibilityRange: getNum(rec, 'mrwSmpVisR'),
        peakVisibilityRange: getNum(rec, 'prwSmpVisR'),
        lowVisibilityRange: getNum(rec, 'lrwSmpVisR'),

        meanBrightness: getNum(rec, 'mrwSmpBriN'),
        meanLightningCurrent: getNum(rec, 'mrwSmpLIcA'),
        meanIceDetection: getNum(rec, 'mrwSmpCIce'),
        meanAirPressure: getNum(rec, 'mrwSmpAirP'),
        meanAirHumidity: getNum(rec, 'mrwSmpAirH'),

        peakTimestamps,
      });
    }

    return records;
  } catch (err) {
    scadaLogger.error({ err, filePath }, "Error reading WSR file");
    return [];
  }
}

/**
 * Liest eine PET-Datei (Plant Event Text).
 *
 * PET-Dateien enthalten Textereignisse mit Zeitstempel und einer
 * Info-Nachricht (bis zu 100 Zeichen).
 *
 * @param filePath - Absoluter Pfad zur .pet Datei
 * @returns Array der geparseten Text-Event-Records
 */
export async function readPetFile(filePath: string): Promise<TextEventRecord[]> {
  try {
    const dbf = await DBFFile.open(filePath);
    const rawRecords = await dbf.readRecords();

    const records: TextEventRecord[] = [];

    for (const raw of rawRecords) {
      const rec = raw as Record<string, unknown>;

      const timestamp = buildTimestamp(rec);
      if (!timestamp) continue;

      const plantNo = getPlantNo(rec);
      if (!plantNo) continue;

      records.push({
        timestamp,
        plantNo,
        info: getStr(rec, 'Info'),
      });
    }

    return records;
  } catch (err) {
    scadaLogger.error({ err, filePath }, "Error reading PET file");
    return [];
  }
}

// ---------------------------------------------------------------
// Scan Functions
// ---------------------------------------------------------------

/**
 * Scannt einen Enercon-Standort-Ordner nach SCADA-Dateien eines bestimmten Typs.
 *
 * Beispiel: scanLocation("C:\\Enercon", "Loc_5842") scannt:
 *   - C:\Enercon\Loc_5842\YYYY\MM\YYYYMMDD.wsd
 *   - C:\Enercon\Loc_5842\YYYY\MM\YYYYMMDD.uid
 *   - etc.
 *
 * @param basePath - Basis-Pfad (z.B. "C:\\Enercon")
 * @param locationCode - Standort-Code (z.B. "Loc_5842")
 * @returns Scan-Ergebnis pro Dateityp
 */
export async function scanLocation(
  basePath: string,
  locationCode: string,
): Promise<LocationScanResult[]> {
  const locationPath = path.join(basePath, locationCode);

  if (!(await directoryExists(locationPath))) {
    throw new Error(
      `Standort-Verzeichnis nicht gefunden: ${locationPath}`,
    );
  }

  const results: LocationScanResult[] = [];

  // Enercon-Verzeichnisstruktur: Loc_XXXX/YYYY/MM/YYYYMMDD.ext
  // Jahres-Ordner finden (4-stellige Ziffern)
  const locationEntries = await fs.readdir(locationPath);
  const yearDirs = locationEntries.filter((e) => /^\d{4}$/.test(e)).sort();

  for (const fileType of KNOWN_FILE_TYPES) {
    const ext = FILE_TYPE_EXTENSIONS[fileType];
    const files: string[] = [];

    // Durch alle Jahre und Monate traversieren
    for (const yearDir of yearDirs) {
      const yearPath = path.join(locationPath, yearDir);
      if (!(await directoryExists(yearPath))) continue;

      const yearEntries = await fs.readdir(yearPath);
      const monthDirs = yearEntries.filter((e) => /^\d{2}$/.test(e)).sort();

      for (const monthDir of monthDirs) {
        const monthPath = path.join(yearPath, monthDir);
        if (!(await directoryExists(monthPath))) continue;

        const monthEntries = await fs.readdir(monthPath);
        const matchingFiles = monthEntries
          .filter((f) => f.toLowerCase().endsWith(`.${ext}`))
          .sort()
          .map((f) => path.join(monthPath, f));

        files.push(...matchingFiles);
      }

      // Also check for summary files directly in the year folder
      // (e.g., Loc_XXXX/YYYY/YYYYMM00.wsr)
      const yearFiles = yearEntries
        .filter((f) => f.toLowerCase().endsWith(`.${ext}`) && /^\d{8}\./.test(f))
        .sort()
        .map((f) => path.join(yearPath, f));

      files.push(...yearFiles);
    }

    if (files.length === 0) {
      continue;
    }

    // Anlagen-Nummern und Zeitraum aus den Dateien ermitteln
    const plantNumbers = new Set<number>();
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    // Erste Datei: fruehestes Datum und Anlagen-Nummern ermitteln
    try {
      const firstFile = await DBFFile.open(files[0]);
      const firstRecords = await firstFile.readRecords(100);

      for (const record of firstRecords) {
        const rec = record as Record<string, unknown>;
        const pn = getPlantNo(rec);
        if (pn) plantNumbers.add(pn);

        const dateVal = getDateField(rec);
        if (dateVal) {
          if (!minDate || dateVal < minDate) minDate = dateVal;
          if (!maxDate || dateVal > maxDate) maxDate = dateVal;
        }
      }
    } catch {
      // Fehler beim Lesen der ersten Datei - fortfahren
    }

    // Letzte Datei: spaetestes Datum ermitteln (wenn mehr als eine Datei)
    if (files.length > 1) {
      try {
        const lastFile = await DBFFile.open(files[files.length - 1]);
        const lastRecords = await lastFile.readRecords(100);

        for (const record of lastRecords) {
          const rec = record as Record<string, unknown>;
          const pn = getPlantNo(rec);
          if (pn) plantNumbers.add(pn);

          const dateVal = getDateField(rec);
          if (dateVal) {
            if (!minDate || dateVal < minDate) minDate = dateVal;
            if (!maxDate || dateVal > maxDate) maxDate = dateVal;
          }
        }
      } catch {
        // Fehler beim Lesen der letzten Datei - fortfahren
      }
    }

    results.push({
      fileType,
      files,
      dateRange: { from: minDate, to: maxDate },
      plantNumbers: Array.from(plantNumbers).sort((a, b) => a - b),
    });
  }

  return results;
}

/**
 * Scannt alle Loc_XXXX Ordner unter dem Basis-Pfad.
 *
 * Findet automatisch alle Enercon-Standort-Verzeichnisse und analysiert
 * welche SCADA-Dateien vorliegen.
 *
 * @param basePath - Basis-Pfad (z.B. "C:\\Enercon")
 * @returns Array mit Informationen zu jedem gefundenen Standort
 */
export async function scanAllLocations(
  basePath: string,
): Promise<AllLocationsResult[]> {
  if (!(await directoryExists(basePath))) {
    throw new Error(`Basis-Verzeichnis nicht gefunden: ${basePath}`);
  }

  const entries = await fs.readdir(basePath);

  // Nur Loc_XXXX Ordner filtern (Enercon-Namenskonvention)
  const locationDirs = entries.filter((entry) =>
    /^Loc_\d+$/i.test(entry),
  );

  const results: AllLocationsResult[] = [];

  for (const locationCode of locationDirs) {
    try {
      const scanResults = await scanLocation(basePath, locationCode);

      if (scanResults.length === 0) {
        continue;
      }

      // Alle Anlagen-Nummern und Zeitraeume zusammenfassen
      const allPlantNumbers = new Set<number>();
      let globalMinDate: Date | null = null;
      let globalMaxDate: Date | null = null;
      let totalFiles = 0;
      const fileTypes: string[] = [];

      for (const scan of scanResults) {
        totalFiles += scan.files.length;
        fileTypes.push(scan.fileType);

        for (const pn of scan.plantNumbers) {
          allPlantNumbers.add(pn);
        }

        if (scan.dateRange.from) {
          if (!globalMinDate || scan.dateRange.from < globalMinDate) {
            globalMinDate = scan.dateRange.from;
          }
        }
        if (scan.dateRange.to) {
          if (!globalMaxDate || scan.dateRange.to > globalMaxDate) {
            globalMaxDate = scan.dateRange.to;
          }
        }
      }

      results.push({
        locationCode,
        plantNumbers: Array.from(allPlantNumbers).sort((a, b) => a - b),
        fileCount: totalFiles,
        dateRange: { from: globalMinDate, to: globalMaxDate },
        fileTypes,
      });
    } catch {
      // Standort konnte nicht gescannt werden - überspringen
      continue;
    }
  }

  return results;
}
