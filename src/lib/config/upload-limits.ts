/**
 * Central file upload size limits.
 * Import from here instead of hardcoding per file.
 *
 * Audit 6E: env-überschreibbar via `UPLOAD_LIMIT_<NAME>_MB`, damit Operations
 * Limits anpassen können ohne Code-Deploy. Defaults entsprechen den bisher
 * hardcoded Werten — Verhalten unverändert.
 */

const MB = 1024 * 1024;

function envMB(key: string, fallbackMB: number): number {
  const v = process.env[key];
  if (!v) return fallbackMB * MB;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return fallbackMB * MB;
  return n * MB;
}

export const UPLOAD_LIMITS = {
  /** User avatar / profile picture */
  avatar: envMB("UPLOAD_LIMIT_AVATAR_MB", 2),
  /** Company logo */
  logo: envMB("UPLOAD_LIMIT_LOGO_MB", 2),
  /** Fund letterhead image */
  letterhead: envMB("UPLOAD_LIMIT_LETTERHEAD_MB", 5),
  /** Bank statement import (MT940, CAMT.054) */
  bankImport: envMB("UPLOAD_LIMIT_BANK_IMPORT_MB", 10),
  /** Proxy documents (PDF) */
  proxy: envMB("UPLOAD_LIMIT_PROXY_MB", 10),
  /** Energy data imports (CSV, Excel) */
  energyImport: envMB("UPLOAD_LIMIT_ENERGY_IMPORT_MB", 10),
  /** General document uploads */
  document: envMB("UPLOAD_LIMIT_DOCUMENT_MB", 10),
  /** Large files (shapefiles, bulk documents) */
  large: envMB("UPLOAD_LIMIT_LARGE_MB", 50),
  // Audit 6E: neue spezifische Limits, vorher in einzelnen Files hardcoded.
  /** Letterhead header-image (2 MB nach Letterhead-Settings) */
  headerImage: envMB("UPLOAD_LIMIT_HEADER_IMAGE_MB", 2),
  /** Letterhead background-PDF (5 MB) */
  letterheadPdf: envMB("UPLOAD_LIMIT_LETTERHEAD_PDF_MB", 5),
  /** Marketing-Video MP4/WebM (100 MB) */
  marketingVideo: envMB("UPLOAD_LIMIT_MARKETING_VIDEO_MB", 100),
  /** GIS-Import (Shapefile, KML, GeoJSON — 20 MB) */
  gisImport: envMB("UPLOAD_LIMIT_GIS_IMPORT_MB", 20),
  /** SCADA-Upload total (Sum-aller-Dateien, 500 MB) */
  scadaTotal: envMB("UPLOAD_LIMIT_SCADA_TOTAL_MB", 500),
  /** SCADA-Upload single-file (100 MB) */
  scadaSingleFile: envMB("UPLOAD_LIMIT_SCADA_SINGLE_MB", 100),
  /** Inbox-Email-Attachment (50 MB) */
  inboxAttachment: envMB("UPLOAD_LIMIT_INBOX_MB", 50),
  /** Journal-Entry-Attachment / Buchungsbeleg (25 MB) */
  journalAttachment: envMB("UPLOAD_LIMIT_JOURNAL_MB", 25),
} as const;

/** Format bytes as human-readable string (e.g. "10 MB") */
export function formatFileSize(bytes: number): string {
  if (bytes >= MB) return `${bytes / MB} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
