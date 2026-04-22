/**
 * Request-Context via AsyncLocalStorage
 *
 * Ermöglicht Request-Correlation in Logs über die gesamte Request-Kette
 * (API-Handler → Business-Logik → DB-Queries → Cache-Calls → Notifications),
 * ohne dass jede Funktion requestId/tenantId/userId als Parameter durchreichen
 * muss.
 *
 * Die ID wird am Eingang eines Requests gesetzt (über `withRequestContext`)
 * und bleibt für alle darin gestarteten async Operationen verfügbar. Logger
 * ziehen die Werte via `getRequestContext()` und mixen sie in jedes Log-Event.
 *
 * Usage:
 *   // In API-Route-Wrapper (oder manuell am Eingang eines Handlers):
 *   await withRequestContext({ requestId, tenantId, userId }, async () => {
 *     // ... normal request handling
 *   });
 *
 *   // Im Logger-Child (automatisch via mixin):
 *   logger.info("Doing something"); // → gets requestId/tenantId/userId
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  /** Unique ID per request — helps correlate logs across async boundaries */
  requestId: string;
  /** Tenant that owns this request (if authenticated) */
  tenantId?: string;
  /** User that initiated this request (if authenticated) */
  userId?: string;
  /** Optional — set by specific workers for job-correlation */
  jobId?: string;
  /** Optional — name of the queue processing this request */
  queueName?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Read the current request context. Returns undefined if called outside
 * of a withRequestContext() boundary (e.g., in top-level startup code).
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Run a callback within a fresh request context. All async operations
 * started from inside this callback will see the same context via
 * getRequestContext(), even across await boundaries.
 */
export function withRequestContext<T>(
  ctx: RequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(ctx, fn);
}

/**
 * Update fields on the current request context in place.
 * Useful when you learn the tenantId/userId after initial context creation
 * (e.g., after auth() resolves). No-op if called outside a context boundary.
 */
export function enrichRequestContext(patch: Partial<RequestContext>): void {
  const current = storage.getStore();
  if (!current) return;
  Object.assign(current, patch);
}

/**
 * Generate a short correlation ID (12 hex chars).
 * Not cryptographically secure — just enough uniqueness for log correlation.
 */
export function generateRequestId(): string {
  return (
    Math.random().toString(16).slice(2, 8) + Date.now().toString(16).slice(-6)
  );
}
