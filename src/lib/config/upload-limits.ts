/**
 * Central file upload size limits.
 * Import from here instead of hardcoding per file.
 */

const MB = 1024 * 1024;

export const UPLOAD_LIMITS = {
  /** User avatar / profile picture */
  avatar: 2 * MB,
  /** Company logo */
  logo: 2 * MB,
  /** Fund letterhead image */
  letterhead: 5 * MB,
  /** Bank statement import (MT940, CAMT.054) */
  bankImport: 10 * MB,
  /** Proxy documents (PDF) */
  proxy: 10 * MB,
  /** Energy data imports (CSV, Excel) */
  energyImport: 10 * MB,
  /** General document uploads */
  document: 10 * MB,
  /** Large files (shapefiles, bulk documents) */
  large: 50 * MB,
} as const;

/** Format bytes as human-readable string (e.g. "10 MB") */
export function formatFileSize(bytes: number): string {
  if (bytes >= MB) return `${bytes / MB} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
