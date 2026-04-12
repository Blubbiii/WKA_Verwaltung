/**
 * Centralized pagination defaults for API routes and UI lists.
 * Env-overridable so ops can tune page sizes without a code change.
 *
 * Pattern: import { PAGE_SIZE_DEFAULT } from "@/lib/config/pagination"
 * Don't hardcode `limit: 20` or `limit: 100` in routes/components.
 */

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

/** Default page size for admin/audit tables (25 rows fits on screen nicely) */
export const PAGE_SIZE_ADMIN = envInt("PAGE_SIZE_ADMIN", 25);

/** Default page size for general lists (documents, CRM, etc.) */
export const PAGE_SIZE_DEFAULT = envInt("PAGE_SIZE_DEFAULT", 20);

/** Default page size for large data sets (billing rules, energy rates) */
export const PAGE_SIZE_LARGE = envInt("PAGE_SIZE_LARGE", 50);

/** Default page size for dropdown/autocomplete fetches */
export const PAGE_SIZE_DROPDOWN = envInt("PAGE_SIZE_DROPDOWN", 100);

/** Default page size for CSV export bulk fetches */
export const PAGE_SIZE_CSV_EXPORT = envInt("PAGE_SIZE_CSV_EXPORT", 500);

/** Maximum allowed page size (prevents abuse) */
export const PAGE_SIZE_MAX = envInt("PAGE_SIZE_MAX", 100);

/** Default starting page */
export const PAGE_DEFAULT = 1;

/** Default limit for type-ahead/search suggestions */
export const SEARCH_LIMIT = envInt("SEARCH_LIMIT", 10);
