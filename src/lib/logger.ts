import pino from "pino";
import { getRequestContext } from "./request-context";

const isProduction = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL || (isProduction ? "info" : "debug");

/**
 * Pino mixin — runs on every log call and merges the current request
 * context fields (requestId, tenantId, userId, jobId) into the event.
 * This means every log line automatically carries correlation IDs
 * without explicit wiring in each caller.
 */
function requestContextMixin() {
  const ctx = getRequestContext();
  if (!ctx) return {};
  return {
    ...(ctx.requestId && { requestId: ctx.requestId }),
    ...(ctx.tenantId && { tenantId: ctx.tenantId }),
    ...(ctx.userId && { userId: ctx.userId }),
    ...(ctx.jobId && { jobId: ctx.jobId }),
    ...(ctx.queueName && { queue: ctx.queueName }),
  };
}

export const logger = pino({
  level: logLevel,
  mixin: requestContextMixin,
  ...(isProduction
    ? {
        // Production: compact JSON for Docker/Portainer log aggregation.
        // base: null removes pid + hostname (redundant with Docker container metadata).
        // Shorter lines prevent Portainer's log viewer from wrapping JSON fields
        // across multiple visual rows (which causes repeated timestamps in the UI).
        base: null,
        formatters: {
          level: (label: string) => ({ level: label }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }
    : {
        // Development: Simple JSON output (no worker thread).
        // pino-pretty transport uses thread-stream which crashes under
        // Turbopack + Node v24 due to incorrect worker path resolution.
        formatters: {
          level: (label: string) => ({ level: label }),
        },
      }),
});

// Create child loggers for different modules
export const apiLogger = logger.child({ module: "api" });
export const authLogger = logger.child({ module: "auth" });
export const cacheLogger = logger.child({ module: "cache" });
export const dbLogger = logger.child({ module: "db" });
export const emailLogger = logger.child({ module: "email" });
export const jobLogger = logger.child({ module: "jobs" });
export const billingLogger = logger.child({ module: "billing" });

export default logger;
