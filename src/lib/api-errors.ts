/**
 * Structured API error responses.
 *
 * Instead of returning `NextResponse.json({ error: "Deutsche Nachricht" })`,
 * API routes should return structured errors with a stable error code:
 *
 *   return apiError("NOT_FOUND", 404);
 *   return apiError("VALIDATION_FAILED", 400, { details: parsed.error });
 *
 * The client i18n layer translates the `code` field. A fallback German
 * message is also returned so clients without translation support
 * (curl, Postman) still see something useful.
 */

import { NextResponse } from "next/server";

/**
 * Stable error codes returned by the API.
 * Keep this list in sync with `src/lib/api-error-messages.ts` (fallbacks)
 * and with the `apiErrors.*` namespace in `src/messages/*.json` (translations).
 */
export type ApiErrorCode =
  // Auth & permissions
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "TENANT_MISMATCH"
  // Resource lookup
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "CONFLICT"
  // Validation
  | "VALIDATION_FAILED"
  | "INVALID_INPUT"
  | "MISSING_FIELD"
  // Operation failures
  | "CREATE_FAILED"
  | "UPDATE_FAILED"
  | "DELETE_FAILED"
  | "FETCH_FAILED"
  | "SAVE_FAILED"
  | "PROCESS_FAILED"
  // External services
  | "EMAIL_SEND_FAILED"
  | "STORAGE_FAILED"
  | "EXTERNAL_SERVICE_FAILED"
  // Business logic
  | "OPERATION_NOT_ALLOWED"
  | "DEPENDENCY_EXISTS"
  | "QUOTA_EXCEEDED"
  | "FEATURE_DISABLED"
  // Generic
  | "INTERNAL_ERROR"
  | "RATE_LIMITED"
  | "BAD_REQUEST"
  // Auth-specific (reset-password flow)
  | "INVALID_TOKEN"
  | "USER_INACTIVE"
  // Accounting period lock (P9)
  | "PERIOD_LOCKED"
  | "ALREADY_REVERSED"
  // Kreditoren-Härtung (P13)
  | "DUPLICATE_INVOICE"
  | "APPROVAL_REQUIRED"
  | "SELF_APPROVAL_FORBIDDEN"
  | "VAT_DEDUCTION_FAILED";

/** German fallback messages for error codes (used when client has no translation). */
const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  UNAUTHORIZED: "Nicht authentifiziert",
  FORBIDDEN: "Keine Berechtigung",
  TENANT_MISMATCH: "Ressource gehört nicht zu diesem Mandanten",
  NOT_FOUND: "Ressource nicht gefunden",
  ALREADY_EXISTS: "Ressource existiert bereits",
  CONFLICT: "Konflikt",
  VALIDATION_FAILED: "Eingabe ungültig",
  INVALID_INPUT: "Ungültige Eingabe",
  MISSING_FIELD: "Pflichtfeld fehlt",
  CREATE_FAILED: "Fehler beim Erstellen",
  UPDATE_FAILED: "Fehler beim Aktualisieren",
  DELETE_FAILED: "Fehler beim Löschen",
  FETCH_FAILED: "Fehler beim Laden",
  SAVE_FAILED: "Fehler beim Speichern",
  PROCESS_FAILED: "Fehler bei der Verarbeitung",
  EMAIL_SEND_FAILED: "E-Mail konnte nicht versendet werden",
  STORAGE_FAILED: "Datei-Speicher-Fehler",
  EXTERNAL_SERVICE_FAILED: "Externer Dienst nicht erreichbar",
  OPERATION_NOT_ALLOWED: "Aktion nicht erlaubt",
  DEPENDENCY_EXISTS: "Abhängige Einträge vorhanden",
  QUOTA_EXCEEDED: "Kontingent überschritten",
  FEATURE_DISABLED: "Funktion deaktiviert",
  INTERNAL_ERROR: "Interner Server-Fehler",
  RATE_LIMITED: "Zu viele Anfragen",
  BAD_REQUEST: "Ungültige Anfrage",
  INVALID_TOKEN: "Ungültiger oder abgelaufener Token",
  USER_INACTIVE: "Benutzerkonto nicht aktiv",
  PERIOD_LOCKED: "Buchungsperiode ist gesperrt",
  ALREADY_REVERSED: "Buchung wurde bereits storniert",
  DUPLICATE_INVOICE: "Doppelte Rechnung (gleicher Lieferant + Rechnungsnummer existiert bereits)",
  APPROVAL_REQUIRED: "Rechnung muss vor Zahlung freigegeben werden",
  SELF_APPROVAL_FORBIDDEN: "Eigene Rechnungen können nicht selbst freigegeben werden (4-Augen-Prinzip)",
  VAT_DEDUCTION_FAILED: "§14 UStG Pflichtangaben fehlen — Vorsteuerabzug nicht möglich",
};

/** Default HTTP status per error code. */
const DEFAULT_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  TENANT_MISMATCH: 403,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  CONFLICT: 409,
  VALIDATION_FAILED: 400,
  INVALID_INPUT: 400,
  MISSING_FIELD: 400,
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
  DELETE_FAILED: 500,
  FETCH_FAILED: 500,
  SAVE_FAILED: 500,
  PROCESS_FAILED: 500,
  EMAIL_SEND_FAILED: 502,
  STORAGE_FAILED: 500,
  EXTERNAL_SERVICE_FAILED: 502,
  OPERATION_NOT_ALLOWED: 409,
  DEPENDENCY_EXISTS: 409,
  QUOTA_EXCEEDED: 429,
  FEATURE_DISABLED: 403,
  INTERNAL_ERROR: 500,
  RATE_LIMITED: 429,
  BAD_REQUEST: 400,
  INVALID_TOKEN: 400,
  USER_INACTIVE: 400,
  PERIOD_LOCKED: 409,
  ALREADY_REVERSED: 409,
  DUPLICATE_INVOICE: 409,
  APPROVAL_REQUIRED: 409,
  SELF_APPROVAL_FORBIDDEN: 403,
  VAT_DEDUCTION_FAILED: 422,
};

export interface ApiErrorBody {
  /** Stable error code for client-side translation. */
  code: ApiErrorCode;
  /** Human-readable fallback message (German). */
  error: string;
  /** Optional context data (validation details, field name, etc.). */
  details?: unknown;
}

/**
 * Build a structured API error response.
 *
 * @param code - Stable error code
 * @param status - HTTP status (defaults from DEFAULT_STATUS table)
 * @param opts - Optional message override + extra details + custom headers
 *
 * @example
 *   return apiError("NOT_FOUND", 404);
 *   return apiError("FORBIDDEN");  // status defaults to 403
 *   return apiError("VALIDATION_FAILED", 400, {
 *     message: "Titel darf nicht leer sein",
 *     details: parsed.error.flatten(),
 *   });
 *   return apiError("RATE_LIMITED", 429, {
 *     headers: { "Retry-After": "60" },
 *   });
 */
export function apiError(
  code: ApiErrorCode,
  status?: number,
  opts?: {
    message?: string;
    details?: unknown;
    headers?: Record<string, string>;
  }
): NextResponse<ApiErrorBody> {
  const httpStatus = status ?? DEFAULT_STATUS[code];
  const body: ApiErrorBody = {
    code,
    error: opts?.message ?? DEFAULT_MESSAGES[code],
  };
  if (opts?.details !== undefined) {
    body.details = opts.details;
  }
  return NextResponse.json(body, {
    status: httpStatus,
    ...(opts?.headers ? { headers: opts.headers } : {}),
  });
}

/** Get the default German message for an error code (for logging etc.). */
export function defaultErrorMessage(code: ApiErrorCode): string {
  return DEFAULT_MESSAGES[code];
}
