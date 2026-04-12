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
  | "BAD_REQUEST";

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
 * @param opts - Optional message override + extra details
 *
 * @example
 *   return apiError("NOT_FOUND", 404);
 *   return apiError("FORBIDDEN");  // status defaults to 403
 *   return apiError("VALIDATION_FAILED", 400, {
 *     message: "Titel darf nicht leer sein",
 *     details: parsed.error.flatten(),
 *   });
 */
export function apiError(
  code: ApiErrorCode,
  status?: number,
  opts?: { message?: string; details?: unknown }
): NextResponse<ApiErrorBody> {
  const httpStatus = status ?? DEFAULT_STATUS[code];
  const body: ApiErrorBody = {
    code,
    error: opts?.message ?? DEFAULT_MESSAGES[code],
  };
  if (opts?.details !== undefined) {
    body.details = opts.details;
  }
  return NextResponse.json(body, { status: httpStatus });
}

/** Get the default German message for an error code (for logging etc.). */
export function defaultErrorMessage(code: ApiErrorCode): string {
  return DEFAULT_MESSAGES[code];
}
