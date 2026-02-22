/**
 * SCADA-Integration Module
 *
 * Zentrale Einstiegsdatei fuer alle SCADA-bezogenen Services.
 * Ermoeglicht den Import und die Verarbeitung von Enercon SCADA-Daten
 * (dBASE III / DBF-Dateien) in das WindparkManager-System.
 *
 * Architektur:
 *   dbf-reader      - Liest DBF-Dateien vom Dateisystem (alle Enercon-Dateitypen)
 *   aggregation     - Berechnet monatliche kWh aus 10-Min-Rohdaten
 *   import-service  - Orchestriert den Gesamtprozess (Lesen -> Mapping -> Schreiben -> Aggregieren)
 */

// DBF-Reader: Dateisystem-Zugriff auf Enercon SCADA-Dateien
export {
  scanLocation,
  scanAllLocations,
  // Reader functions for all Enercon file types
  readWsdFile,
  readUidFile,
  readAvrFile,
  readSsmFile,
  readSwmFile,
  readPesFile,
  readPewFile,
  readWsrFile,
  readPetFile,
} from './dbf-reader';

export type {
  LocationScanResult,
  AllLocationsResult,
  // Record types for all Enercon file types
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

// Aggregation: Monatliche Produktionsberechnung aus SCADA-Rohdaten
export {
  aggregateMonthlyProduction,
  writeToTurbineProduction,
} from './aggregation';

export type {
  MonthlyAggregationResult,
} from './aggregation';

// Import Service: Orchestrierung des Import-Prozesses
export {
  startImport,
  scanAllFileTypes,
  extractDateFromFilename,
  getFileTypeConfig,
  isValidFileType,
} from './import-service';

export type {
  ImportParams,
  ImportResult,
  ScadaFileType,
  ScadaPeriodType,
  FileTypeScanResult,
} from './import-service';

// Anomaly Detection: Statistische Erkennung von SCADA-Anomalien
export {
  runAnomalyDetection,
  checkPerformanceDrop,
  checkAvailability,
  checkCurveDeviation,
  checkDataQuality,
} from './anomaly-detection';

export type {
  AnomalyResult,
} from './anomaly-detection';
