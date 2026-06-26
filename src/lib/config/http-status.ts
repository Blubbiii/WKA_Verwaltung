/**
 * Zentrale HTTP-Status-Code-Konstanten.
 *
 * Audit-H-1 (2026-06-26): vorher waren Magic-Numbers (404, 409, 422, etc.) in
 * Pages und Components verstreut. Mit dieser Konstante können Status-Checks
 * lesbar bleiben — und ein einheitlicher Style-Guide-Pattern existiert.
 *
 * Nur in CLIENT- und Page-Code zu nutzen. In API-Routes nutzen wir weiterhin
 * direkt `apiError("CODE", 404, ...)` — der apiError-Helper kapselt das selbst.
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;
