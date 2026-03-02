/**
 * Import Service für SCADA-Daten
 *
 * Orchestriert den vollstaendigen Import-Prozess:
 * 1. DBF-Dateien lesen (via dbf-reader)
 * 2. PlantNo -> Turbine-ID aufloesen (via ScadaTurbineMapping)
 * 3. Messdaten in das passende Prisma-Modell schreiben (Batch-Upsert)
 * 4. Import-Fortschritt in ScadaImportLog protokollieren
 * 5. Monatliche Aggregation anstossen (nur für WSD)
 *
 * Unterstuetzte Dateitypen:
 *   WSD          - Wind Speed Daily (10-Min Leistungsdaten) -> ScadaMeasurement
 *   UID          - Electrical Data (Zaehlerstaende) -> ScadaMeasurement
 *   AVR/AVW/AVM/AVY - Availability (daily/weekly/monthly/yearly) -> ScadaAvailability
 *   SSM          - State Summary Monthly -> ScadaStateSummary
 *   SWM          - Warning Summary Monthly -> ScadaWarningSummary
 *   PES          - State Events -> ScadaStateEvent
 *   PEW          - Warning Events -> ScadaWarningEvent
 *   WSR/WSW/WSM/WSY - Wind Summaries (daily/weekly/monthly/yearly) -> ScadaWindSummary
 *   PET          - Text Events -> ScadaTextEvent
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import type { Prisma } from '@prisma/client';
import {
  readWsdFile,
  readUidFile,
  readAvrFile,
  readSsmFile,
  readSwmFile,
  readPesFile,
  readPewFile,
  readWsrFile,
  readPetFile,
  scanLocation,
} from './dbf-reader';
import { aggregateMonthlyProduction, writeToTurbineProduction } from './aggregation';
import type {
  WsdRecord,
  UidRecord,
  AvailabilityRecord,
  StateSummaryRecord,
  WarningSummaryRecord,
  StateEventRecord,
  WarningEventRecord,
  WindSummaryRecord,
  TextEventRecord,
} from './dbf-reader';

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

/** All supported SCADA file types */
export type ScadaFileType =
  | 'WSD' | 'UID'
  | 'AVR' | 'AVW' | 'AVM' | 'AVY'
  | 'SSM' | 'SWM'
  | 'PES' | 'PEW' | 'PET'
  | 'WSR' | 'WSW' | 'WSM' | 'WSY';

/** Period type for summary/availability files */
export type ScadaPeriodType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

/** Parameter für den Import-Start */
export interface ImportParams {
  /** Mandanten-ID (Multi-Tenancy) */
  tenantId: string;
  /** Enercon Standort-Code (z.B. "Loc_5842") */
  locationCode: string;
  /** Dateityp */
  fileType: ScadaFileType;
  /** Basis-Pfad zum Enercon-Datenverzeichnis (z.B. "C:\\Enercon") */
  basePath: string;
  /** UUID des ScadaImportLog-Eintrags (muss vorab erstellt werden) */
  importLogId: string;
  /** Optional: explicit file paths (skip discovery, e.g. from browser upload) */
  filePaths?: string[];
  /** Optional: directory to delete after import completes */
  cleanupDir?: string;
}

/** Ergebnis eines abgeschlossenen Imports */
export interface ImportResult {
  /** Status: SUCCESS, PARTIAL (einige Fehler), FAILED */
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  /** Anzahl verarbeiteter Dateien */
  filesProcessed: number;
  /** Anzahl importierter Messwerte */
  recordsImported: number;
  /** Anzahl übersprungener Duplikate */
  recordsSkipped: number;
  /** Anzahl fehlgeschlagener Records */
  recordsFailed: number;
  /** Fehlerbeschreibungen (falls aufgetreten) */
  errors: string[];
  /** Betroffene Monate (für Aggregation, nur WSD) */
  affectedMonths: Array<{ year: number; month: number }>;
}

/** File discovery location (daily vs monthly vs yearly) */
type FileLocation = 'daily' | 'monthly' | 'yearly' | 'alltime';

/** Configuration for a single file type */
interface FileTypeConfig {
  /** File extension (lowercase) */
  extension: string;
  /** Where files are stored in the directory hierarchy */
  fileLocation: FileLocation;
  /** Period type for summary/availability files (null for event/measurement files) */
  periodType: ScadaPeriodType | null;
  /** Prisma model name (for logging/debugging) */
  modelName: string;
  /** Reader function name identifier */
  readerKey: string;
}

/** Result of scanning all file types for a location */
export interface FileTypeScanResult {
  /** File type code */
  fileType: ScadaFileType;
  /** Number of files found */
  fileCount: number;
  /** File extension */
  extension: string;
  /** Whether daily, monthly, or yearly files */
  fileLocation: FileLocation;
}

/** Generic batch write result */
interface BatchWriteResult {
  imported: number;
  skipped: number;
  failed: number;
  unmappedPlants: Set<number>;
}

// ---------------------------------------------------------------
// Constants
// ---------------------------------------------------------------

/**
 * Batch-Größe für createMany.
 * Haelt den Memory-Verbrauch unter Kontrolle bei grossen Dateien.
 */
const BATCH_SIZE = 1000;

/**
 * FILE_TYPE_CONFIG: Central configuration map for all supported Enercon SCADA file types.
 *
 * Each entry defines:
 * - extension: The file extension used by Enercon (e.g., "wsd", "avr")
 * - fileLocation: Where in the directory hierarchy files are stored
 *     daily:   {basePath}/{year}/{month}/{YYYYMMDD}.{ext}
 *     monthly: {basePath}/{year}/{YYYYMM}00.{ext}
 *     yearly:  {basePath}/{YYYY}0000.{ext}
 *     alltime: {basePath}/00000000.{ext}
 * - periodType: For summary files, which period the data covers
 * - modelName: The Prisma model that stores this data
 * - readerKey: Which reader function to use from dbf-reader
 */
const FILE_TYPE_CONFIG: Record<ScadaFileType, FileTypeConfig> = {
  // Measurement data (10-minute intervals)
  WSD: { extension: 'wsd', fileLocation: 'daily', periodType: null, modelName: 'ScadaMeasurement', readerKey: 'wsd' },
  UID: { extension: 'uid', fileLocation: 'daily', periodType: null, modelName: 'ScadaMeasurement', readerKey: 'uid' },

  // Availability time budgets
  AVR: { extension: 'avr', fileLocation: 'daily', periodType: 'DAILY', modelName: 'ScadaAvailability', readerKey: 'avr' },
  AVW: { extension: 'avw', fileLocation: 'monthly', periodType: 'WEEKLY', modelName: 'ScadaAvailability', readerKey: 'avr' },
  AVM: { extension: 'avm', fileLocation: 'monthly', periodType: 'MONTHLY', modelName: 'ScadaAvailability', readerKey: 'avr' },
  AVY: { extension: 'avy', fileLocation: 'yearly', periodType: 'YEARLY', modelName: 'ScadaAvailability', readerKey: 'avr' },

  // State and warning summaries (monthly)
  SSM: { extension: 'ssm', fileLocation: 'monthly', periodType: null, modelName: 'ScadaStateSummary', readerKey: 'ssm' },
  SWM: { extension: 'swm', fileLocation: 'monthly', periodType: null, modelName: 'ScadaWarningSummary', readerKey: 'swm' },

  // Event logs
  PES: { extension: 'pes', fileLocation: 'daily', periodType: null, modelName: 'ScadaStateEvent', readerKey: 'pes' },
  PEW: { extension: 'pew', fileLocation: 'daily', periodType: null, modelName: 'ScadaWarningEvent', readerKey: 'pew' },
  PET: { extension: 'pet', fileLocation: 'daily', periodType: null, modelName: 'ScadaTextEvent', readerKey: 'pet' },

  // Wind summaries (aggregated)
  WSR: { extension: 'wsr', fileLocation: 'monthly', periodType: 'DAILY', modelName: 'ScadaWindSummary', readerKey: 'wsr' },
  WSW: { extension: 'wsw', fileLocation: 'monthly', periodType: 'WEEKLY', modelName: 'ScadaWindSummary', readerKey: 'wsr' },
  WSM: { extension: 'wsm', fileLocation: 'monthly', periodType: 'MONTHLY', modelName: 'ScadaWindSummary', readerKey: 'wsr' },
  WSY: { extension: 'wsy', fileLocation: 'yearly', periodType: 'YEARLY', modelName: 'ScadaWindSummary', readerKey: 'wsr' },
};

// ---------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------

/**
 * Laedt die PlantNo -> TurbineId Zuordnung für einen Standort.
 * Nur aktive Mappings werden beruecksichtigt.
 */
async function loadTurbineMappings(
  tenantId: string,
  locationCode: string,
): Promise<Map<number, string>> {
  const mappings = await prisma.scadaTurbineMapping.findMany({
    where: {
      tenantId,
      locationCode,
      status: 'ACTIVE',
    },
    select: {
      plantNo: true,
      turbineId: true,
    },
  });

  const map = new Map<number, string>();
  for (const m of mappings) {
    map.set(m.plantNo, m.turbineId);
  }

  return map;
}

/**
 * Aktualisiert den ScadaImportLog mit dem aktuellen Fortschritt.
 */
async function updateImportLog(
  importLogId: string,
  data: {
    filesProcessed?: number;
    recordsImported?: number;
    recordsSkipped?: number;
    recordsFailed?: number;
    status?: string;
    completedAt?: Date;
    errorDetails?: Prisma.InputJsonValue;
    lastProcessedDate?: Date;
  },
) {
  const updateData: Prisma.ScadaImportLogUpdateInput = {
    updatedAt: new Date(),
  };

  if (data.filesProcessed !== undefined) updateData.filesProcessed = data.filesProcessed;
  if (data.recordsImported !== undefined) updateData.recordsImported = data.recordsImported;
  if (data.recordsSkipped !== undefined) updateData.recordsSkipped = data.recordsSkipped;
  if (data.recordsFailed !== undefined) updateData.recordsFailed = data.recordsFailed;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.completedAt !== undefined) updateData.completedAt = data.completedAt;
  if (data.errorDetails !== undefined) updateData.errorDetails = data.errorDetails;
  if (data.lastProcessedDate !== undefined) updateData.lastProcessedDate = data.lastProcessedDate;

  await prisma.scadaImportLog.update({
    where: { id: importLogId },
    data: updateData,
  });
}

/**
 * Converts a number to a Decimal or null.
 * Utility for mapping nullable numeric fields to Prisma Decimal types.
 */
function toDecimalOrNull(val: number | null | undefined): Decimal | null {
  if (val == null || !isFinite(val)) return null;
  return new Decimal(val);
}

// ---------------------------------------------------------------
// WSD Write Logic (existing, kept intact)
// ---------------------------------------------------------------

/**
 * Konvertiert WSD-Records in ScadaMeasurement-Einträge und schreibt sie batchweise.
 * Nutzt createMany mit skipDuplicates für Performance und Idempotenz.
 *
 * @returns Anzahl erfolgreich geschriebener und übersprungener Records
 */
async function writeWsdMeasurements(
  records: WsdRecord[],
  turbineMappings: Map<number, string>,
  tenantId: string,
): Promise<BatchWriteResult> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const unmappedPlants = new Set<number>();

  // Records nach Batches verarbeiten
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    // Records in DB-Format konvertieren, nur wenn Mapping vorhanden
    const dbRecords: Array<{
      turbineId: string;
      tenantId: string;
      timestamp: Date;
      windSpeedMs: Decimal | null;
      powerW: Decimal | null;
      rotorRpm: Decimal | null;
      operatingHours: Decimal | null;
      windDirection: Decimal | null;
      sourceFile: string;
    }> = [];

    for (const rec of batch) {
      const turbineId = turbineMappings.get(rec.plantNo);

      if (!turbineId) {
        // Keine Zuordnung für diese PlantNo -> überspringen
        unmappedPlants.add(rec.plantNo);
        skipped++;
        continue;
      }

      dbRecords.push({
        turbineId,
        tenantId,
        timestamp: rec.timestamp,
        windSpeedMs: rec.windSpeedMs != null ? new Decimal(rec.windSpeedMs) : null,
        powerW: rec.powerW != null ? new Decimal(rec.powerW) : null,
        rotorRpm: rec.rotorRpm != null ? new Decimal(rec.rotorRpm) : null,
        operatingHours: rec.operatingHours != null ? new Decimal(rec.operatingHours) : null,
        windDirection: rec.windDirection != null ? new Decimal(rec.windDirection) : null,
        sourceFile: 'WSD',
      });
    }

    if (dbRecords.length === 0) {
      continue;
    }

    try {
      // createMany mit skipDuplicates: unique constraint (turbineId, timestamp, sourceFile)
      // Duplikate werden stillschweigend übersprungen
      const result = await prisma.scadaMeasurement.createMany({
        data: dbRecords,
        skipDuplicates: true,
      });

      imported += result.count;
      // Die Differenz sind Duplikate die übersprungen wurden
      skipped += dbRecords.length - result.count;
    } catch (_err) {
      // Batch-Fehler: alle Records dieses Batches als fehlgeschlagen zaehlen
      failed += dbRecords.length;
    }
  }

  return { imported, skipped, failed, unmappedPlants };
}

// ---------------------------------------------------------------
// UID Write Logic
// ---------------------------------------------------------------

/**
 * Writes UID (Electrical Data) records to ScadaMeasurement.
 *
 * Maps the rich UidRecord fields to the ScadaMeasurement columns:
 * - voltageV: Average of mean phase voltages (U1, U2, U3)
 * - currentA: Average of mean phase currents (I1, I2, I3)
 * - powerFactor: mean cos(phi)
 * - frequencyHz: mean grid frequency
 * - meterReadingKwh: cumulative active energy produced
 */
async function writeUidMeasurements(
  records: UidRecord[],
  turbineMappings: Map<number, string>,
  tenantId: string,
): Promise<BatchWriteResult> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const unmappedPlants = new Set<number>();

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const dbRecords: Array<{
      turbineId: string;
      tenantId: string;
      timestamp: Date;
      voltageV: Decimal | null;
      currentA: Decimal | null;
      powerFactor: Decimal | null;
      frequencyHz: Decimal | null;
      meterReadingKwh: Decimal | null;
      sourceFile: string;
    }> = [];

    for (const rec of batch) {
      const turbineId = turbineMappings.get(rec.plantNo);

      if (!turbineId) {
        unmappedPlants.add(rec.plantNo);
        skipped++;
        continue;
      }

      // Calculate average voltage from phase voltages (U1, U2, U3)
      const voltages = rec.meanVoltagesV.filter((v): v is number => v != null);
      const avgVoltageV = voltages.length > 0
        ? voltages.reduce((a, b) => a + b, 0) / voltages.length
        : null;

      // Calculate average current from phase currents (I1, I2, I3)
      const currents = rec.meanCurrentsA.filter((v): v is number => v != null);
      const avgCurrentA = currents.length > 0
        ? currents.reduce((a, b) => a + b, 0) / currents.length
        : null;

      dbRecords.push({
        turbineId,
        tenantId,
        timestamp: rec.timestamp,
        voltageV: toDecimalOrNull(avgVoltageV),
        currentA: toDecimalOrNull(avgCurrentA),
        powerFactor: toDecimalOrNull(rec.meanCosPhi),
        frequencyHz: toDecimalOrNull(rec.meanFrequencyHz),
        meterReadingKwh: toDecimalOrNull(rec.cumulativeActiveEnergyProduced),
        sourceFile: 'UID',
      });
    }

    if (dbRecords.length === 0) continue;

    try {
      const result = await prisma.scadaMeasurement.createMany({
        data: dbRecords,
        skipDuplicates: true,
      });

      imported += result.count;
      skipped += dbRecords.length - result.count;
    } catch (_err) {
      failed += dbRecords.length;
    }
  }

  return { imported, skipped, failed, unmappedPlants };
}

// ---------------------------------------------------------------
// Availability Write Logic (AVR/AVW/AVM/AVY)
// ---------------------------------------------------------------

/**
 * Writes availability time budget records to ScadaAvailability.
 * Calculates availabilityPct = (t1 / t2 * 100) before writing.
 *
 * AvailabilityRecord fields (t1-t6, t5_1-t5_3) are nullable from the reader,
 * but the Prisma model expects non-nullable ints. We default to 0 for null values.
 */
async function writeAvailabilityRecords(
  records: AvailabilityRecord[],
  turbineMappings: Map<number, string>,
  tenantId: string,
  periodType: ScadaPeriodType,
  sourceFileType: string,
): Promise<BatchWriteResult> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const unmappedPlants = new Set<number>();

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const dbRecords: Array<{
      turbineId: string;
      tenantId: string;
      date: Date;
      periodType: string;
      plantNo: number;
      t1: number;
      t2: number;
      t3: number;
      t4: number;
      t5: number;
      t6: number;
      t5_1: number;
      t5_2: number;
      t5_3: number;
      availabilityPct: Decimal | null;
      sourceFile: string;
    }> = [];

    for (const rec of batch) {
      const turbineId = turbineMappings.get(rec.plantNo);

      if (!turbineId) {
        unmappedPlants.add(rec.plantNo);
        skipped++;
        continue;
      }

      // Default null values to 0 (Prisma model expects non-nullable ints)
      const t1 = rec.t1 ?? 0;
      const t2 = rec.t2 ?? 0;
      const t3 = rec.t3 ?? 0;
      const t4 = rec.t4 ?? 0;
      const t5 = rec.t5 ?? 0;
      const t6 = rec.t6 ?? 0;
      const t5_1 = rec.t5_1 ?? 0;
      const t5_2 = rec.t5_2 ?? 0;
      const t5_3 = rec.t5_3 ?? 0;

      // Calculate availability percentage: t1 (producing) / total_time * 100
      // Total time = T1 + T2 + T3 + T4 + T5 + T6 (all categories sum to total period)
      let availabilityPct: Decimal | null = null;
      const totalTime = t1 + t2 + t3 + t4 + t5 + t6;
      if (totalTime > 0) {
        availabilityPct = new Decimal((t1 / totalTime) * 100).toDecimalPlaces(3);
      }

      dbRecords.push({
        turbineId,
        tenantId,
        date: rec.date,
        periodType,
        plantNo: rec.plantNo,
        t1,
        t2,
        t3,
        t4,
        t5,
        t6,
        t5_1,
        t5_2,
        t5_3,
        availabilityPct,
        sourceFile: sourceFileType,
      });
    }

    if (dbRecords.length === 0) continue;

    try {
      const result = await prisma.scadaAvailability.createMany({
        data: dbRecords,
        skipDuplicates: true,
      });

      imported += result.count;
      skipped += dbRecords.length - result.count;
    } catch (_err) {
      failed += dbRecords.length;
    }
  }

  return { imported, skipped, failed, unmappedPlants };
}

// ---------------------------------------------------------------
// State Summary Write Logic (SSM)
// ---------------------------------------------------------------

/**
 * Writes state summary records to ScadaStateSummary.
 * StateSummaryRecord fields (state, subState, frequency, duration) are nullable from reader,
 * but Prisma model expects non-nullable ints. We default to 0 for null values.
 */
async function writeStateSummaryRecords(
  records: StateSummaryRecord[],
  turbineMappings: Map<number, string>,
  tenantId: string,
  sourceFileType: string,
): Promise<BatchWriteResult> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const unmappedPlants = new Set<number>();

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const dbRecords: Array<{
      turbineId: string;
      tenantId: string;
      date: Date;
      plantNo: number;
      state: number;
      subState: number;
      isFault: boolean;
      frequency: number;
      duration: number;
      sourceFile: string;
    }> = [];

    for (const rec of batch) {
      const turbineId = turbineMappings.get(rec.plantNo);

      if (!turbineId) {
        unmappedPlants.add(rec.plantNo);
        skipped++;
        continue;
      }

      dbRecords.push({
        turbineId,
        tenantId,
        date: rec.date,
        plantNo: rec.plantNo,
        state: rec.state ?? 0,
        subState: rec.subState ?? 0,
        isFault: rec.isFault,
        frequency: rec.frequency ?? 0,
        duration: rec.duration ?? 0,
        sourceFile: sourceFileType,
      });
    }

    if (dbRecords.length === 0) continue;

    try {
      const result = await prisma.scadaStateSummary.createMany({
        data: dbRecords,
        skipDuplicates: true,
      });

      imported += result.count;
      skipped += dbRecords.length - result.count;
    } catch (_err) {
      failed += dbRecords.length;
    }
  }

  return { imported, skipped, failed, unmappedPlants };
}

// ---------------------------------------------------------------
// Warning Summary Write Logic (SWM)
// ---------------------------------------------------------------

/**
 * Writes warning summary records to ScadaWarningSummary.
 * WarningSummaryRecord fields (warn, subWarn, frequency, duration) are nullable from reader,
 * but Prisma model expects non-nullable ints. We default to 0 for null values.
 */
async function writeWarningSummaryRecords(
  records: WarningSummaryRecord[],
  turbineMappings: Map<number, string>,
  tenantId: string,
  sourceFileType: string,
): Promise<BatchWriteResult> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const unmappedPlants = new Set<number>();

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const dbRecords: Array<{
      turbineId: string;
      tenantId: string;
      date: Date;
      plantNo: number;
      warn: number;
      subWarn: number;
      isWarnMsg: boolean;
      frequency: number;
      duration: number;
      sourceFile: string;
    }> = [];

    for (const rec of batch) {
      const turbineId = turbineMappings.get(rec.plantNo);

      if (!turbineId) {
        unmappedPlants.add(rec.plantNo);
        skipped++;
        continue;
      }

      dbRecords.push({
        turbineId,
        tenantId,
        date: rec.date,
        plantNo: rec.plantNo,
        warn: rec.warn ?? 0,
        subWarn: rec.subWarn ?? 0,
        isWarnMsg: rec.isWarnMsg,
        frequency: rec.frequency ?? 0,
        duration: rec.duration ?? 0,
        sourceFile: sourceFileType,
      });
    }

    if (dbRecords.length === 0) continue;

    try {
      const result = await prisma.scadaWarningSummary.createMany({
        data: dbRecords,
        skipDuplicates: true,
      });

      imported += result.count;
      skipped += dbRecords.length - result.count;
    } catch (_err) {
      failed += dbRecords.length;
    }
  }

  return { imported, skipped, failed, unmappedPlants };
}

// ---------------------------------------------------------------
// State Event Write Logic (PES)
// ---------------------------------------------------------------

/**
 * Writes state event records to ScadaStateEvent.
 * StateEventRecord fields (state, subState) are nullable from reader,
 * but Prisma model expects non-nullable ints. We default to 0 for null values.
 */
async function writeStateEventRecords(
  records: StateEventRecord[],
  turbineMappings: Map<number, string>,
  tenantId: string,
  sourceFileType: string,
): Promise<BatchWriteResult> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const unmappedPlants = new Set<number>();

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const dbRecords: Array<{
      turbineId: string;
      tenantId: string;
      timestamp: Date;
      plantNo: number;
      state: number;
      subState: number;
      isService: boolean;
      isFault: boolean;
      windSpeedAtEvent: Decimal | null;
      sourceFile: string;
    }> = [];

    for (const rec of batch) {
      const turbineId = turbineMappings.get(rec.plantNo);

      if (!turbineId) {
        unmappedPlants.add(rec.plantNo);
        skipped++;
        continue;
      }

      dbRecords.push({
        turbineId,
        tenantId,
        timestamp: rec.timestamp,
        plantNo: rec.plantNo,
        state: rec.state ?? 0,
        subState: rec.subState ?? 0,
        isService: rec.isService,
        isFault: rec.isFault,
        windSpeedAtEvent: toDecimalOrNull(rec.windSpeedAtEvent),
        sourceFile: sourceFileType,
      });
    }

    if (dbRecords.length === 0) continue;

    try {
      const result = await prisma.scadaStateEvent.createMany({
        data: dbRecords,
        skipDuplicates: true,
      });

      imported += result.count;
      skipped += dbRecords.length - result.count;
    } catch (_err) {
      failed += dbRecords.length;
    }
  }

  return { imported, skipped, failed, unmappedPlants };
}

// ---------------------------------------------------------------
// Warning Event Write Logic (PEW)
// ---------------------------------------------------------------

/**
 * Writes warning event records to ScadaWarningEvent.
 * WarningEventRecord fields (warn, subWarn) are nullable from reader,
 * but Prisma model expects non-nullable ints. We default to 0 for null values.
 */
async function writeWarningEventRecords(
  records: WarningEventRecord[],
  turbineMappings: Map<number, string>,
  tenantId: string,
  sourceFileType: string,
): Promise<BatchWriteResult> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const unmappedPlants = new Set<number>();

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const dbRecords: Array<{
      turbineId: string;
      tenantId: string;
      timestamp: Date;
      plantNo: number;
      warn: number;
      subWarn: number;
      isWarnMsg: boolean;
      sourceFile: string;
    }> = [];

    for (const rec of batch) {
      const turbineId = turbineMappings.get(rec.plantNo);

      if (!turbineId) {
        unmappedPlants.add(rec.plantNo);
        skipped++;
        continue;
      }

      dbRecords.push({
        turbineId,
        tenantId,
        timestamp: rec.timestamp,
        plantNo: rec.plantNo,
        warn: rec.warn ?? 0,
        subWarn: rec.subWarn ?? 0,
        isWarnMsg: rec.isWarnMsg,
        sourceFile: sourceFileType,
      });
    }

    if (dbRecords.length === 0) continue;

    try {
      const result = await prisma.scadaWarningEvent.createMany({
        data: dbRecords,
        skipDuplicates: true,
      });

      imported += result.count;
      skipped += dbRecords.length - result.count;
    } catch (_err) {
      failed += dbRecords.length;
    }
  }

  return { imported, skipped, failed, unmappedPlants };
}

// ---------------------------------------------------------------
// Wind Summary Write Logic (WSR/WSW/WSM/WSY)
// ---------------------------------------------------------------

/**
 * Writes wind summary records to ScadaWindSummary.
 * These contain aggregated wind speed, power, rotor RPM, energy, and environmental data.
 *
 * Maps WindSummaryRecord field names (from dbf-reader) to ScadaWindSummary Prisma columns.
 */
async function writeWindSummaryRecords(
  records: WindSummaryRecord[],
  turbineMappings: Map<number, string>,
  tenantId: string,
  periodType: ScadaPeriodType,
  sourceFileType: string,
): Promise<BatchWriteResult> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const unmappedPlants = new Set<number>();

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    // Build DB records dynamically to keep the code manageable
    const dbRecords: Array<Prisma.ScadaWindSummaryCreateManyInput> = [];

    for (const rec of batch) {
      const turbineId = turbineMappings.get(rec.plantNo);

      if (!turbineId) {
        unmappedPlants.add(rec.plantNo);
        skipped++;
        continue;
      }

      // Convert peakTimestamps to JSON-safe format (Date objects must be serialized)
      let peakTimestampsJson: Prisma.InputJsonValue | undefined = undefined;
      if (rec.peakTimestamps && Object.keys(rec.peakTimestamps).length > 0) {
        const serialized: Record<string, Record<string, string | number>> = {};
        for (const [key, val] of Object.entries(rec.peakTimestamps)) {
          serialized[key] = {
            ...(val.hour != null ? { hour: val.hour } : {}),
            ...(val.minute != null ? { minute: val.minute } : {}),
            ...(val.second != null ? { second: val.second } : {}),
            ...(val.date != null ? { date: val.date.toISOString() } : {}),
          };
        }
        peakTimestampsJson = serialized as Prisma.InputJsonValue;
      }

      dbRecords.push({
        turbineId,
        tenantId,
        date: rec.date,
        periodType,
        plantNo: rec.plantNo,
        sampleCount: rec.sampleCount ?? null,

        // Wind speed (m/s) - reader: meanWindSpeedMs -> DB: meanWindSpeed
        meanWindSpeed: toDecimalOrNull(rec.meanWindSpeedMs),
        peakWindSpeed: toDecimalOrNull(rec.peakWindSpeedMs),
        lowWindSpeed: toDecimalOrNull(rec.lowWindSpeedMs),

        // Rotor RPM
        meanRotorRpm: toDecimalOrNull(rec.meanRotorRpm),
        peakRotorRpm: toDecimalOrNull(rec.peakRotorRpm),
        lowRotorRpm: toDecimalOrNull(rec.lowRotorRpm),

        // Power (kW)
        meanPowerKw: toDecimalOrNull(rec.meanPowerKw),
        peakPowerKw: toDecimalOrNull(rec.peakPowerKw),
        lowPowerKw: toDecimalOrNull(rec.lowPowerKw),

        // Reactive power (kVAr) - reader: meanReactivePowerKvar -> DB: meanReactivePower
        meanReactivePower: toDecimalOrNull(rec.meanReactivePowerKvar),
        peakReactivePower: toDecimalOrNull(rec.peakReactivePowerKvar),
        lowReactivePower: toDecimalOrNull(rec.lowReactivePowerKvar),

        // Wind direction
        meanWindDirection: toDecimalOrNull(rec.meanWindDirection),

        // Cumulative values
        cumulativeOperatingHours: toDecimalOrNull(rec.cumulativeOperatingHours),
        cumulativeEnergyKwh: toDecimalOrNull(rec.cumulativeEnergyKwh),
        workMinutes: rec.cumulativeWorkMinutes ?? null,

        // Additional power measurements - reader names -> DB column names
        meanWindPower: toDecimalOrNull(rec.meanPowerWindKw),
        meanTechPower: toDecimalOrNull(rec.meanPowerTechnicalKw),
        meanFeedMgmtPower: toDecimalOrNull(rec.meanPowerForcedKw),
        meanExternalPower: toDecimalOrNull(rec.meanPowerExternalKw),

        // Blade pitch angle
        meanBladeAngle: toDecimalOrNull(rec.meanBladeAngle),

        // Environmental sensors - reader names -> DB column names
        meanRain: toDecimalOrNull(rec.meanRainfall),
        peakRain: toDecimalOrNull(rec.peakRainfall),
        lowRain: toDecimalOrNull(rec.lowRainfall),
        meanVisibility: toDecimalOrNull(rec.meanVisibilityRange),
        peakVisibility: toDecimalOrNull(rec.peakVisibilityRange),
        lowVisibility: toDecimalOrNull(rec.lowVisibilityRange),
        meanBrightness: toDecimalOrNull(rec.meanBrightness),
        meanLightningIce: toDecimalOrNull(rec.meanLightningCurrent),
        meanIceDetection: toDecimalOrNull(rec.meanIceDetection),
        meanAirPressure: toDecimalOrNull(rec.meanAirPressure),
        meanAirHumidity: toDecimalOrNull(rec.meanAirHumidity),

        // Peak timestamps (serialized as JSON)
        peakTimestamps: peakTimestampsJson,

        sourceFile: sourceFileType,
      });
    }

    if (dbRecords.length === 0) continue;

    try {
      const result = await prisma.scadaWindSummary.createMany({
        data: dbRecords,
        skipDuplicates: true,
      });

      imported += result.count;
      skipped += dbRecords.length - result.count;
    } catch (_err) {
      failed += dbRecords.length;
    }
  }

  return { imported, skipped, failed, unmappedPlants };
}

// ---------------------------------------------------------------
// Text Event Write Logic (PET)
// ---------------------------------------------------------------

/**
 * Writes text event records to ScadaTextEvent.
 */
async function writeTextEventRecords(
  records: TextEventRecord[],
  turbineMappings: Map<number, string>,
  tenantId: string,
  sourceFileType: string,
): Promise<BatchWriteResult> {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const unmappedPlants = new Set<number>();

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);

    const dbRecords: Array<{
      turbineId: string;
      tenantId: string;
      timestamp: Date;
      plantNo: number;
      info: string;
      sourceFile: string;
    }> = [];

    for (const rec of batch) {
      const turbineId = turbineMappings.get(rec.plantNo);

      if (!turbineId) {
        unmappedPlants.add(rec.plantNo);
        skipped++;
        continue;
      }

      dbRecords.push({
        turbineId,
        tenantId,
        timestamp: rec.timestamp,
        plantNo: rec.plantNo,
        info: rec.info,
        sourceFile: sourceFileType,
      });
    }

    if (dbRecords.length === 0) continue;

    try {
      const result = await prisma.scadaTextEvent.createMany({
        data: dbRecords,
        skipDuplicates: true,
      });

      imported += result.count;
      skipped += dbRecords.length - result.count;
    } catch (_err) {
      failed += dbRecords.length;
    }
  }

  return { imported, skipped, failed, unmappedPlants };
}

// ---------------------------------------------------------------
// Generic File Type Dispatcher
// ---------------------------------------------------------------

/**
 * Reads a single file and writes the records to the appropriate DB table.
 * Dispatches to the correct reader and writer based on fileType.
 *
 * @returns BatchWriteResult with import statistics
 */
async function readAndWriteFile(
  filePath: string,
  fileType: ScadaFileType,
  turbineMappings: Map<number, string>,
  tenantId: string,
): Promise<BatchWriteResult> {
  const config = FILE_TYPE_CONFIG[fileType];

  switch (config.readerKey) {
    case 'wsd': {
      const records = await readWsdFile(filePath);
      return writeWsdMeasurements(records, turbineMappings, tenantId);
    }

    case 'uid': {
      const records = await readUidFile(filePath);
      return writeUidMeasurements(records, turbineMappings, tenantId);
    }

    case 'avr': {
      const records = await readAvrFile(filePath);
      return writeAvailabilityRecords(
        records, turbineMappings, tenantId,
        config.periodType!, fileType,
      );
    }

    case 'ssm': {
      const records = await readSsmFile(filePath);
      return writeStateSummaryRecords(records, turbineMappings, tenantId, fileType);
    }

    case 'swm': {
      const records = await readSwmFile(filePath);
      return writeWarningSummaryRecords(records, turbineMappings, tenantId, fileType);
    }

    case 'pes': {
      const records = await readPesFile(filePath);
      return writeStateEventRecords(records, turbineMappings, tenantId, fileType);
    }

    case 'pew': {
      const records = await readPewFile(filePath);
      return writeWarningEventRecords(records, turbineMappings, tenantId, fileType);
    }

    case 'wsr': {
      const records = await readWsrFile(filePath);
      return writeWindSummaryRecords(
        records, turbineMappings, tenantId,
        config.periodType!, fileType,
      );
    }

    case 'pet': {
      const records = await readPetFile(filePath);
      return writeTextEventRecords(records, turbineMappings, tenantId, fileType);
    }

    default:
      throw new Error(`Unbekannter Reader-Key: ${config.readerKey} für Dateityp ${fileType}`);
  }
}

// ---------------------------------------------------------------
// Affected Months Extraction (WSD only, for aggregation)
// ---------------------------------------------------------------

/**
 * Ermittelt alle eindeutigen Monate aus den Messwerten.
 * Wird benötigt um die Aggregation gezielt nur für betroffene Monate auszufuehren.
 */
function extractAffectedMonths(records: WsdRecord[]): Array<{ year: number; month: number }> {
  const monthSet = new Set<string>();

  for (const rec of records) {
    const key = `${rec.timestamp.getUTCFullYear()}-${rec.timestamp.getUTCMonth() + 1}`;
    monthSet.add(key);
  }

  return Array.from(monthSet)
    .map((key) => {
      const [year, month] = key.split('-').map(Number);
      return { year, month };
    })
    .sort((a, b) => a.year - b.year || a.month - b.month);
}

// ---------------------------------------------------------------
// File Discovery
// ---------------------------------------------------------------

/**
 * Extracts the date from an Enercon SCADA filename.
 *
 * Enercon files are named YYYYMMDD.ext (e.g. 20240601.wsd):
 *   Daily:   {basePath}/{year}/{month}/{YYYYMMDD}.{ext}  -> e.g. 20240615.wsd
 *   Monthly: {basePath}/{year}/{YYYYMM}00.{ext}          -> e.g. 20240600.avr
 *   Yearly:  {basePath}/{YYYY}0000.{ext}                 -> e.g. 20240000.wsy
 *   Alltime: {basePath}/00000000.{ext}
 *
 * @param filePath - Full path to the SCADA file
 * @returns Date at UTC midnight for the file's day, or null if the name does not match
 */
export function extractDateFromFilename(filePath: string): Date | null {
  const basename = path.basename(filePath, path.extname(filePath));

  // Expect exactly 8 digits: YYYYMMDD
  if (!/^\d{8}$/.test(basename)) {
    return null;
  }

  const year = parseInt(basename.substring(0, 4), 10);
  const month = parseInt(basename.substring(4, 6), 10); // 1-based
  const day = parseInt(basename.substring(6, 8), 10);

  // Handle special filenames:
  // YYYY0000 = yearly file, use Jan 1
  if (month === 0 && day === 0) {
    return new Date(Date.UTC(year, 0, 1));
  }

  // YYYYMM00 = monthly file, use first of month
  if (day === 0 && month >= 1 && month <= 12) {
    return new Date(Date.UTC(year, month - 1, 1));
  }

  // 00000000 = alltime file
  if (year === 0 && month === 0 && day === 0) {
    return null; // Cannot determine date from alltime files
  }

  // Basic sanity check for daily files
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Checks if a directory exists.
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Discovers files for a specific file type within a location directory.
 *
 * Scans the correct directory structure based on fileLocation:
 * - daily:   {locationPath}/{YYYY}/{MM}/{YYYYMMDD}.{ext}
 * - monthly: {locationPath}/{YYYY}/{YYYYMM}00.{ext}
 * - yearly:  {locationPath}/{YYYY}0000.{ext}
 * - alltime: {locationPath}/00000000.{ext}
 *
 * @returns Sorted array of absolute file paths
 */
async function discoverFiles(
  locationPath: string,
  fileType: ScadaFileType,
): Promise<string[]> {
  const config = FILE_TYPE_CONFIG[fileType];
  const ext = config.extension;
  const files: string[] = [];

  if (!(await directoryExists(locationPath))) {
    return files;
  }

  // Get all year directories
  const locationEntries = await fs.readdir(locationPath);
  const yearDirs = locationEntries.filter((e) => /^\d{4}$/.test(e)).sort();

  switch (config.fileLocation) {
    case 'daily': {
      // Daily files: {locationPath}/{YYYY}/{MM}/{YYYYMMDD}.{ext}
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
      }
      break;
    }

    case 'monthly': {
      // Monthly files: {locationPath}/{YYYY}/{YYYYMM}00.{ext}
      // Also check in month subdirectories for some file types
      for (const yearDir of yearDirs) {
        const yearPath = path.join(locationPath, yearDir);
        if (!(await directoryExists(yearPath))) continue;

        // Check year directory itself for monthly summary files
        const yearEntries = await fs.readdir(yearPath);
        const matchingInYear = yearEntries
          .filter((f) => f.toLowerCase().endsWith(`.${ext}`))
          .sort()
          .map((f) => path.join(yearPath, f));
        files.push(...matchingInYear);

        // Also check month subdirectories (some monthly files may be stored there)
        const monthDirs = yearEntries.filter((e) => /^\d{2}$/.test(e)).sort();
        for (const monthDir of monthDirs) {
          const monthPath = path.join(yearPath, monthDir);
          if (!(await directoryExists(monthPath))) continue;

          const monthEntries = await fs.readdir(monthPath);
          const matchingInMonth = monthEntries
            .filter((f) => f.toLowerCase().endsWith(`.${ext}`))
            .sort()
            .map((f) => path.join(monthPath, f));
          files.push(...matchingInMonth);
        }
      }
      break;
    }

    case 'yearly': {
      // Yearly files: {locationPath}/{YYYY}0000.{ext} or {locationPath}/{YYYY}/{YYYY}0000.{ext}
      // Check root of location for yearly files
      const rootEntries = locationEntries
        .filter((f) => f.toLowerCase().endsWith(`.${ext}`))
        .sort()
        .map((f) => path.join(locationPath, f));
      files.push(...rootEntries);

      // Also check year directories
      for (const yearDir of yearDirs) {
        const yearPath = path.join(locationPath, yearDir);
        if (!(await directoryExists(yearPath))) continue;

        const yearEntries = await fs.readdir(yearPath);
        const matchingFiles = yearEntries
          .filter((f) => f.toLowerCase().endsWith(`.${ext}`))
          .sort()
          .map((f) => path.join(yearPath, f));
        files.push(...matchingFiles);
      }
      break;
    }

    case 'alltime': {
      // Alltime files: {locationPath}/00000000.{ext}
      const rootEntries = locationEntries
        .filter((f) => f.toLowerCase().endsWith(`.${ext}`))
        .sort()
        .map((f) => path.join(locationPath, f));
      files.push(...rootEntries);
      break;
    }
  }

  // Deduplicate (in case a file is found in multiple scan passes)
  return [...new Set(files)].sort();
}

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

/**
 * Scans all supported SCADA file types for a given location and returns
 * the number of files found per type.
 *
 * Useful for the UI to show which data is available before starting an import.
 *
 * @param basePath - Base path to the Enercon data directory
 * @param locationCode - Location code (e.g., "Loc_5842")
 * @returns Array of scan results, one per file type that has files
 */
export async function scanAllFileTypes(
  basePath: string,
  locationCode: string,
): Promise<FileTypeScanResult[]> {
  const locationPath = path.join(basePath, locationCode);

  if (!(await directoryExists(locationPath))) {
    throw new Error(`Standort-Verzeichnis nicht gefunden: ${locationPath}`);
  }

  const results: FileTypeScanResult[] = [];

  for (const [fileType, config] of Object.entries(FILE_TYPE_CONFIG) as Array<[ScadaFileType, FileTypeConfig]>) {
    const files = await discoverFiles(locationPath, fileType);

    if (files.length > 0) {
      results.push({
        fileType,
        fileCount: files.length,
        extension: config.extension,
        fileLocation: config.fileLocation,
      });
    }
  }

  return results;
}

/**
 * Startet den Import von SCADA-Dateien für einen Standort.
 *
 * Ablauf:
 * 1. Standort scannen -> Dateien des gewuenschten Typs finden
 * 2. PlantNo -> TurbineId Mapping laden
 * 3. Jede Datei lesen und Daten in das passende DB-Modell schreiben
 * 4. ImportLog nach jeder Datei aktualisieren
 * 5. Monatliche Aggregation für alle betroffenen Monate ausfuehren (nur WSD)
 *
 * WICHTIG: Der importLogId-Eintrag muss VOR dem Aufruf erstellt worden sein,
 * z.B. durch den API-Handler. Dadurch kann der Fortschritt sofort abgefragt werden.
 *
 * @param params - Import-Parameter
 * @returns Import-Ergebnis mit Statistiken
 */
export async function startImport(params: ImportParams): Promise<ImportResult> {
  const { tenantId, locationCode, fileType, basePath, importLogId, filePaths, cleanupDir } = params;

  const errors: string[] = [];
  let filesProcessed = 0;
  let totalImported = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  const allAffectedMonths: Array<{ year: number; month: number }> = [];
  const affectedMonthSet = new Set<string>();

  try {
    // 1. Dateien finden
    let filesToScan: string[];

    if (filePaths && filePaths.length > 0) {
      // Explicit file paths provided (e.g. from browser upload) — skip discovery
      filesToScan = filePaths;
    } else if (fileType === 'WSD' || fileType === 'UID') {
      // Use existing scan logic for WSD/UID (they are in the daily directory structure)
      const scanResults = await scanLocation(basePath, locationCode);
      const targetScan = scanResults.find((s) => s.fileType === fileType);

      if (!targetScan || targetScan.files.length === 0) {
        await updateImportLog(importLogId, {
          status: 'FAILED',
          completedAt: new Date(),
          errorDetails: { message: `Keine ${fileType}-Dateien für ${locationCode} gefunden` },
        });

        return {
          status: 'FAILED',
          filesProcessed: 0,
          recordsImported: 0,
          recordsSkipped: 0,
          recordsFailed: 0,
          errors: [`Keine ${fileType}-Dateien für ${locationCode} gefunden`],
          affectedMonths: [],
        };
      }

      filesToScan = targetScan.files;
    } else {
      // Use new discovery for all extended file types
      const locationPath = path.join(basePath, locationCode);
      filesToScan = await discoverFiles(locationPath, fileType);

      if (filesToScan.length === 0) {
        await updateImportLog(importLogId, {
          status: 'FAILED',
          completedAt: new Date(),
          errorDetails: { message: `Keine ${fileType}-Dateien für ${locationCode} gefunden` },
        });

        return {
          status: 'FAILED',
          filesProcessed: 0,
          recordsImported: 0,
          recordsSkipped: 0,
          recordsFailed: 0,
          errors: [`Keine ${fileType}-Dateien für ${locationCode} gefunden`],
          affectedMonths: [],
        };
      }
    }

    // -- Incremental Import: skip files that have already been imported --
    // Query the most recent successful or partial import for this location+fileType+tenant
    const lastSuccessfulImport = await prisma.scadaImportLog.findFirst({
      where: {
        tenantId,
        locationCode,
        fileType,
        status: { in: ['SUCCESS', 'PARTIAL'] },
        lastProcessedDate: { not: null },
        // Exclude the current import log entry
        id: { not: importLogId },
      },
      orderBy: { lastProcessedDate: 'desc' },
      select: { lastProcessedDate: true },
    });

    let filesToProcess = filesToScan;

    if (lastSuccessfulImport?.lastProcessedDate) {
      // Normalize lastProcessedDate to start-of-day UTC so we skip the entire
      // day that was already fully processed (files are per-day granularity).
      const lpd = lastSuccessfulImport.lastProcessedDate;
      const lastDayStart = new Date(Date.UTC(
        lpd.getUTCFullYear(),
        lpd.getUTCMonth(),
        lpd.getUTCDate(),
      ));

      filesToProcess = filesToScan.filter((fp) => {
        const fileDate = extractDateFromFilename(fp);
        if (!fileDate) {
          // Cannot determine date from filename -> include to be safe
          return true;
        }
        // Only include files whose date is strictly after the last processed day
        return fileDate.getTime() > lastDayStart.getTime();
      });
    }

    // If all files are already imported, complete immediately
    if (filesToProcess.length === 0) {
      await updateImportLog(importLogId, {
        status: 'SUCCESS',
        completedAt: new Date(),
        filesProcessed: 0,
        recordsImported: 0,
        recordsSkipped: 0,
        recordsFailed: 0,
        errorDetails: {
          message: `Alle ${filesToScan.length} Dateien für ${locationCode} wurden bereits importiert. Keine neuen Daten.`,
        },
      });

      await prisma.scadaImportLog.update({
        where: { id: importLogId },
        data: { filesTotal: 0 },
      });

      return {
        status: 'SUCCESS',
        filesProcessed: 0,
        recordsImported: 0,
        recordsSkipped: 0,
        recordsFailed: 0,
        errors: [],
        affectedMonths: [],
      };
    }

    // Set filesTotal to the filtered count (only new files)
    await updateImportLog(importLogId, {
      filesProcessed: 0,
      status: 'RUNNING',
    });

    await prisma.scadaImportLog.update({
      where: { id: importLogId },
      data: { filesTotal: filesToProcess.length },
    });

    // 2. Turbine-Mappings laden (PlantNo -> TurbineId)
    const turbineMappings = await loadTurbineMappings(tenantId, locationCode);

    if (turbineMappings.size === 0) {
      console.warn(
        `[SCADA] Keine aktiven Turbine-Mappings für ${locationCode} — Import läuft weiter, ` +
        'nicht zugeordnete Anlagen werden als Warnung geloggt.',
      );
      errors.push(
        `Keine Turbine-Mappings für ${locationCode} vorhanden. ` +
        'Records ohne Mapping werden übersprungen.',
      );
    }

    // 3. Jede (neue) Datei verarbeiten
    for (const filePath of filesToProcess) {
      try {
        // For WSD: need to collect affected months for aggregation
        if (fileType === 'WSD') {
          const records = await readWsdFile(filePath);

          if (records.length === 0) {
            filesProcessed++;
            await updateImportLog(importLogId, { filesProcessed });
            continue;
          }

          // Betroffene Monate sammeln
          const months = extractAffectedMonths(records);
          for (const m of months) {
            const key = `${m.year}-${m.month}`;
            if (!affectedMonthSet.has(key)) {
              affectedMonthSet.add(key);
              allAffectedMonths.push(m);
            }
          }

          // Messwerte batchweise in die DB schreiben
          const writeResult = await writeWsdMeasurements(
            records,
            turbineMappings,
            tenantId,
          );

          totalImported += writeResult.imported;
          totalSkipped += writeResult.skipped;
          totalFailed += writeResult.failed;

          // Warnung für nicht zugeordnete Anlagen
          if (writeResult.unmappedPlants.size > 0) {
            const plantList = Array.from(writeResult.unmappedPlants).join(', ');
            errors.push(
              `Datei ${filePath}: PlantNo ${plantList} ohne Turbine-Mapping - Records übersprungen`,
            );
          }

          // Letztes Datum für inkrementellen Import merken
          const lastRecord = records[records.length - 1];
          if (lastRecord) {
            await updateImportLog(importLogId, {
              lastProcessedDate: lastRecord.timestamp,
            });
          }
        } else {
          // All other file types: use the generic dispatcher
          const writeResult = await readAndWriteFile(
            filePath,
            fileType,
            turbineMappings,
            tenantId,
          );

          totalImported += writeResult.imported;
          totalSkipped += writeResult.skipped;
          totalFailed += writeResult.failed;

          // Warnung für nicht zugeordnete Anlagen
          if (writeResult.unmappedPlants.size > 0) {
            const plantList = Array.from(writeResult.unmappedPlants).join(', ');
            errors.push(
              `Datei ${filePath}: PlantNo ${plantList} ohne Turbine-Mapping - Records übersprungen`,
            );
          }

          // Update lastProcessedDate from filename
          const fileDate = extractDateFromFilename(filePath);
          if (fileDate) {
            await updateImportLog(importLogId, {
              lastProcessedDate: fileDate,
            });
          }
        }

        filesProcessed++;

        // Fortschritt nach jeder Datei aktualisieren
        await updateImportLog(importLogId, {
          filesProcessed,
          recordsImported: totalImported,
          recordsSkipped: totalSkipped,
          recordsFailed: totalFailed,
        });
      } catch (err) {
        filesProcessed++;
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Fehler beim Verarbeiten von ${filePath}: ${errorMsg}`);

        await updateImportLog(importLogId, {
          filesProcessed,
          recordsFailed: totalFailed,
          errorDetails: { errors },
        });
      }
    }

    // 4. Monatliche Aggregation für alle betroffenen Monate (nur WSD)
    if (fileType === 'WSD' && allAffectedMonths.length > 0) {
      // Aggregation pro Turbine und Monat
      const turbineIds = Array.from(turbineMappings.values());

      for (const { year, month } of allAffectedMonths) {
        for (const turbineId of turbineIds) {
          try {
            const aggregation = await aggregateMonthlyProduction(
              turbineId,
              year,
              month,
            );

            // Nur schreiben wenn es Datenpunkte gibt
            if (aggregation.dataPoints > 0) {
              await writeToTurbineProduction(
                turbineId,
                tenantId,
                year,
                month,
                aggregation.totalKwh,
              );
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            errors.push(
              `Aggregationsfehler für Turbine ${turbineId}, ${year}-${String(month).padStart(2, '0')}: ${errorMsg}`,
            );
          }
        }
      }
    }

    // 5. Import abschliessen
    // PARTIAL when files were processed but records were skipped (e.g. missing mappings)
    const finalStatus =
      errors.length === 0
        ? 'SUCCESS'
        : (totalImported > 0 || totalSkipped > 0)
          ? 'PARTIAL'
          : 'FAILED';

    await updateImportLog(importLogId, {
      status: finalStatus,
      completedAt: new Date(),
      filesProcessed,
      recordsImported: totalImported,
      recordsSkipped: totalSkipped,
      recordsFailed: totalFailed,
      errorDetails: errors.length > 0 ? { errors } : undefined,
    });

    return {
      status: finalStatus as ImportResult['status'],
      filesProcessed,
      recordsImported: totalImported,
      recordsSkipped: totalSkipped,
      recordsFailed: totalFailed,
      errors,
      affectedMonths: allAffectedMonths,
    };
  } catch (err) {
    // Unerwarteter Top-Level-Fehler
    const errorMsg = err instanceof Error ? err.message : String(err);
    errors.push(`Kritischer Fehler: ${errorMsg}`);

    await updateImportLog(importLogId, {
      status: 'FAILED',
      completedAt: new Date(),
      filesProcessed,
      recordsImported: totalImported,
      recordsSkipped: totalSkipped,
      recordsFailed: totalFailed,
      errorDetails: { errors },
    });

    return {
      status: 'FAILED',
      filesProcessed,
      recordsImported: totalImported,
      recordsSkipped: totalSkipped,
      recordsFailed: totalFailed,
      errors,
      affectedMonths: allAffectedMonths,
    };
  } finally {
    // Cleanup temp upload directory if specified
    if (cleanupDir) {
      try {
        await fs.rm(cleanupDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Returns the FILE_TYPE_CONFIG for external use (e.g., API validation).
 */
export function getFileTypeConfig(): Record<ScadaFileType, FileTypeConfig> {
  return { ...FILE_TYPE_CONFIG };
}

/**
 * Checks if a given string is a valid ScadaFileType.
 */
export function isValidFileType(value: string): value is ScadaFileType {
  return value in FILE_TYPE_CONFIG;
}
