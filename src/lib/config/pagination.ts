/**
 * Standard pagination defaults for API routes.
 * Use these instead of hardcoding numbers in each route.
 */

/** Default page size for admin/audit tables (25 rows fits on screen nicely) */
export const PAGE_SIZE_ADMIN = 25;

/** Default page size for general lists (documents, CRM, etc.) */
export const PAGE_SIZE_DEFAULT = 20;

/** Default page size for large data sets (billing rules, energy rates) */
export const PAGE_SIZE_LARGE = 50;

/** Maximum allowed page size (prevents abuse) */
export const PAGE_SIZE_MAX = 100;

/** Default starting page */
export const PAGE_DEFAULT = 1;

/** Default limit for type-ahead/search suggestions */
export const SEARCH_LIMIT = 10;
