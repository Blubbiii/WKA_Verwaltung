/**
 * API utility functions for validated query parameter parsing.
 *
 * These helpers enforce whitelisting on sort fields and clamping on
 * pagination limits to prevent arbitrary field access and unbounded
 * result sets.
 */

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

interface PaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
  defaultPage?: number;
}

interface PaginationResult {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Parse and validate pagination parameters from a URLSearchParams object.
 *
 * - `page` is clamped to a minimum of 1.
 * - `limit` is clamped between 1 and `maxLimit` (default 100).
 * - `skip` is derived from `page` and `limit`.
 */
export function parsePaginationParams(
  searchParams: URLSearchParams,
  options?: PaginationOptions,
): PaginationResult {
  const defaultLimit = options?.defaultLimit ?? 20;
  const maxLimit = options?.maxLimit ?? 100;
  const defaultPage = options?.defaultPage ?? 1;

  const rawPage = parseInt(searchParams.get("page") || String(defaultPage), 10);
  const rawLimit = parseInt(searchParams.get("limit") || String(defaultLimit), 10);

  const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : defaultPage);
  const limit = Math.min(maxLimit, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : defaultLimit));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

interface SortOptions {
  defaultField?: string;
  defaultOrder?: "asc" | "desc";
}

interface SortResult {
  sortBy: string;
  sortOrder: "asc" | "desc";
}

/**
 * Parse and validate sort parameters from a URLSearchParams object.
 *
 * - `sortBy` is validated against the provided `allowedFields` whitelist.
 *   If the requested field is not in the whitelist, the default field is
 *   used instead.
 * - `sortOrder` must be "asc" or "desc"; anything else falls back to the
 *   default order.
 */
export function parseSortParams(
  searchParams: URLSearchParams,
  allowedFields: string[],
  options?: SortOptions,
): SortResult {
  const defaultField = options?.defaultField ?? allowedFields[0];
  const defaultOrder = options?.defaultOrder ?? "asc";

  const rawSortBy = searchParams.get("sortBy") || "";
  const rawSortOrder = searchParams.get("sortOrder") || "";

  const sortBy = allowedFields.includes(rawSortBy) ? rawSortBy : defaultField;
  const sortOrder: "asc" | "desc" =
    rawSortOrder === "asc" || rawSortOrder === "desc" ? rawSortOrder : defaultOrder;

  return { sortBy, sortOrder };
}

// ---------------------------------------------------------------------------
// Client IP
// ---------------------------------------------------------------------------

/**
 * Extract the client IP address from common proxy headers.
 *
 * Checks `x-forwarded-for` (first entry) and `x-real-ip` before falling
 * back to "unknown".
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list; take the first one.
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}
