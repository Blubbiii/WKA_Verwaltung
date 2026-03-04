import { format } from "date-fns";
import { de } from "date-fns/locale";

// Shared types for SCADA components

export interface ScadaMapping {
  id: string;
  locationCode: string;
  plantNo: number;
  parkId: string;
  turbineId: string;
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
  park?: { id: string; name: string };
  turbine?: { id: string; designation: string; deviceType?: string };
  createdAt: string;
}

export interface ScanResult {
  locationCode: string;
  plantNumbers: number[];
  fileCount: number;
  dateRange: { from: string; to: string } | null;
  fileTypes: string[];
}

export interface PreviewResult {
  locationCode: string;
  fileCount: number;
  fileTypes: string[];
  dateRange: { from: string; to: string } | null;
  plants: PlantPreview[];
  allMapped: boolean;
  unmappedCount: number;
  totalPlants: number;
}

export interface PlantPreview {
  plantNo: number;
  sampleCount: number;
  sampleWindSpeed: number | null;
  samplePower: number | null;
  mapping: {
    id: string;
    turbineId: string;
    turbineDesignation: string;
    parkId: string;
    parkName: string;
  } | null;
}

export interface ImportJob {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "PARTIAL";
  locationCode: string;
  fileType: string;
  filesTotal: number;
  filesProcessed: number;
  recordsImported: number;
  recordsSkipped: number;
  recordsFailed: number;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  error: string | null;
}

export interface Turbine {
  id: string;
  designation: string;
}

/** A file with its relative path (for Loc_ detection from folder structure) */
export interface UploadEntry {
  file: File;
  relativePath: string;
  locCode: string | null; // detected Loc_XXXX or null
  fileType: string; // extension uppercase, e.g. "WSD"
}

/** Grouped summary of upload entries by location */
export interface UploadLocGroup {
  locCode: string;
  entries: UploadEntry[];
  fileTypes: string[];
  fileCount: number;
}

export interface AutoImportStatusItem {
  mappingId: string;
  locationCode: string;
  autoImportEnabled: boolean;
  autoImportInterval: string;
  autoImportPath: string | null;
  lastAutoImport: string | null;
  lastDataTimestamp: string | null;
  parkName: string;
}

export interface AutoImportLogEntry {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  locationId: string | null;
  filesFound: number;
  filesImported: number;
  filesSkipped: number;
  errors: string[] | null;
  summary: string | null;
}

// =============================================================================
// Constants
// =============================================================================

export const STATUS_BADGE_COLORS: Record<string, string> = {
  RUNNING: "bg-blue-100 text-blue-800 border-blue-200",
  SUCCESS: "bg-green-100 text-green-800 border-green-200",
  FAILED: "bg-red-100 text-red-800 border-red-200",
  PARTIAL: "bg-amber-100 text-amber-800 border-amber-200",
  PENDING: "bg-gray-100 text-gray-800 border-gray-200",
  ACTIVE: "bg-green-100 text-green-800 border-green-200",
  INACTIVE: "bg-gray-100 text-gray-800 border-gray-200",
};

export const STATUS_LABELS: Record<string, string> = {
  RUNNING: "Laufend",
  SUCCESS: "Erfolgreich",
  FAILED: "Fehlgeschlagen",
  PARTIAL: "Teilweise",
  PENDING: "Wartend",
  ACTIVE: "Aktiv",
  INACTIVE: "Inaktiv",
};

export const DEFAULT_SCAN_PATH_FALLBACK = process.env.NEXT_PUBLIC_SCADA_BASE_PATH || "";

// =============================================================================
// Helper Functions
// =============================================================================

export function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "-";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd.MM.yyyy HH:mm", { locale: de });
  } catch {
    return "-";
  }
}
