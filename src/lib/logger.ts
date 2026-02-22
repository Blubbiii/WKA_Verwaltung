import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const logLevel = process.env.LOG_LEVEL || (isProduction ? "info" : "debug");

export const logger = pino({
  level: logLevel,
  ...(isProduction
    ? {
        // Production: JSON format for log aggregation
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
