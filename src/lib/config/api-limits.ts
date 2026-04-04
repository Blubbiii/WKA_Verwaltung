/**
 * Centralized API limits — env-overridable with sensible defaults.
 *
 * Pattern: envInt("ENV_VAR", default) reads from process.env,
 * falls back to default if missing or non-numeric.
 */

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

export const API_LIMITS = {
  // -- Batch operations (invoices) --
  batchSize: envInt("BATCH_MAX_SIZE", 50),

  // -- Export limits --
  maxExportEntries: envInt("MAX_EXPORT_ENTRIES", 10000),

  // -- Document download / ZIP --
  zipMaxFiles: envInt("ZIP_MAX_FILES", 200),
  zipMaxSizeBytes: envInt("ZIP_MAX_SIZE_MB", 500) * 1024 * 1024,
  signedUrlMinExpires: 60,
  signedUrlMaxExpires: 604800,
  signedUrlDefaultExpires: envInt("SIGNED_URL_EXPIRES", 3600),

  // -- SCADA / GIS --
  scadaPreviewMaxRecords: envInt("SCADA_PREVIEW_MAX_RECORDS", 500),
  gisMaxFeaturesPerLayer: envInt("GIS_MAX_FEATURES_PER_LAYER", 5000),
  gisMaxFileSize: envInt("GIS_MAX_FILE_SIZE_MB", 50) * 1024 * 1024,
};
