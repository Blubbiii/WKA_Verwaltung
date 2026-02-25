/**
 * API utility functions for validated query parameter parsing and
 * standardised error/success responses.
 *
 * These helpers enforce whitelisting on sort fields and clamping on
 * pagination limits to prevent arbitrary field access and unbounded
 * result sets.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Standardised API Responses
// ---------------------------------------------------------------------------

/** 400 Bad Request */
export function badRequest(error: string, details?: unknown) {
  return NextResponse.json(
    { error, ...(details ? { details } : {}) },
    { status: 400 },
  );
}

/** 404 Not Found */
export function notFound(entity = "Ressource") {
  return NextResponse.json(
    { error: `${entity} nicht gefunden` },
    { status: 404 },
  );
}

/** 403 Forbidden */
export function forbidden(message = "Keine Berechtigung") {
  return NextResponse.json({ error: message }, { status: 403 });
}

/** 500 Internal Server Error */
export function serverError(message = "Interner Serverfehler") {
  return NextResponse.json({ error: message }, { status: 500 });
}

/**
 * Handle common catch-block patterns: Zod validation errors + generic errors.
 * Use at the end of a try/catch in API routes.
 *
 * @example
 * } catch (error) {
 *   return handleApiError(error, "Fehler beim Laden");
 * }
 */
export function handleApiError(error: unknown, fallbackMessage: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "Validierungsfehler", details: error.errors },
      { status: 400 },
    );
  }
  logger.error({ err: error }, fallbackMessage);
  return serverError(fallbackMessage);
}

/**
 * Build a paginated JSON response with consistent shape.
 */
export function paginatedResponse<T>(
  data: T[],
  pagination: { page: number; limit: number; total: number },
) {
  return NextResponse.json({
    data,
    pagination: {
      ...pagination,
      totalPages: Math.ceil(pagination.total / pagination.limit),
    },
  });
}

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
