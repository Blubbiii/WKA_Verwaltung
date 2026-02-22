/**
 * Standalone Worker Entrypoint
 *
 * Dieses Script startet alle BullMQ Worker als separaten Prozess.
 * Kann unabhaengig von der Next.js-Anwendung ausgefuehrt werden.
 *
 * Usage:
 *   npm run workers       # Production
 *   npx tsx src/workers   # Development
 *
 * Environment Variables:
 *   REDIS_URL     - Redis connection string (default: redis://localhost:6379)
 *   NODE_ENV      - Environment (development/production)
 *
 * Signals:
 *   SIGTERM/SIGINT - Graceful shutdown
 */

import {
  startAllWorkers,
  stopAllWorkers,
  getWorkersStatus,
} from "@/lib/queue/workers";
import { closeConnections, isRedisHealthy } from "@/lib/queue/connection";
import { jobLogger } from "@/lib/logger";

// =============================================================================
// Configuration
// =============================================================================

const SHUTDOWN_TIMEOUT = 30000; // 30 Sekunden fuer graceful shutdown
const HEALTH_CHECK_INTERVAL = 60000; // Health-Check alle 60 Sekunden

// =============================================================================
// Logger
// =============================================================================

const workerLogger = jobLogger.child({ component: "worker-main" });

function log(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>): void {
  if (level === "error") {
    workerLogger.error(meta || {}, message);
  } else if (level === "warn") {
    workerLogger.warn(meta || {}, message);
  } else {
    workerLogger.info(meta || {}, message);
  }
}

// =============================================================================
// Health Check
// =============================================================================

let healthCheckInterval: NodeJS.Timeout | null = null;

async function performHealthCheck(): Promise<void> {
  try {
    const redisHealthy = await isRedisHealthy();
    const status = getWorkersStatus();

    if (!redisHealthy) {
      log("error", "Redis connection unhealthy!");
    }

    if (!status.allRunning) {
      const stoppedWorkers = status.workers
        .filter((w) => !w.running)
        .map((w) => w.name);
      log("warn", `Some workers not running: ${stoppedWorkers.join(", ")}`);
    }

    log("info", "Health check completed", {
      redis: redisHealthy,
      allWorkersRunning: status.allRunning,
      uptime: status.startedAt
        ? `${Math.round((Date.now() - status.startedAt.getTime()) / 1000)}s`
        : "N/A",
    });
  } catch (error) {
    log("error", "Health check failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

function startHealthCheck(): void {
  healthCheckInterval = setInterval(performHealthCheck, HEALTH_CHECK_INTERVAL);
  log("info", `Health check scheduled every ${HEALTH_CHECK_INTERVAL / 1000}s`);
}

function stopHealthCheck(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

// =============================================================================
// Shutdown Handler
// =============================================================================

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    log("warn", "Shutdown already in progress, forcing exit...");
    process.exit(1);
  }

  isShuttingDown = true;
  log("info", `Received ${signal}, starting graceful shutdown...`);

  // Health-Check stoppen
  stopHealthCheck();

  try {
    // Worker stoppen
    log("info", "Stopping all workers...");
    const stoppedWorkers = await stopAllWorkers(SHUTDOWN_TIMEOUT);
    log("info", `Stopped ${stoppedWorkers.length} workers`);

    // Redis-Verbindungen schliessen
    log("info", "Closing Redis connections...");
    await closeConnections();
    log("info", "Redis connections closed");

    log("info", "Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    log("error", "Error during shutdown", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    process.exit(1);
  }
}

// =============================================================================
// Error Handlers
// =============================================================================

function setupErrorHandlers(): void {
  // Unhandled Promise Rejections
  process.on("unhandledRejection", (reason, promise) => {
    log("error", "Unhandled Promise Rejection", {
      reason: reason instanceof Error ? reason.message : String(reason),
      promise: String(promise),
    });

    // In Production: Nicht sofort beenden, aber loggen
    if (process.env.NODE_ENV === "production") {
      // Metrics/Alerting hier einbinden
    } else {
      // In Development: Beenden um Probleme sichtbar zu machen
      process.exit(1);
    }
  });

  // Uncaught Exceptions
  process.on("uncaughtException", (error) => {
    log("error", "Uncaught Exception", {
      error: error.message,
      stack: error.stack,
    });

    // Immer beenden bei uncaught exceptions
    process.exit(1);
  });

  // Graceful shutdown signals
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  // Windows-spezifisches Signal
  if (process.platform === "win32") {
    process.on("SIGHUP", () => gracefulShutdown("SIGHUP"));
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  log("info", "=".repeat(60));
  log("info", "WindparkManager - Worker Process Starting");
  log("info", "=".repeat(60));
  log("info", `Environment: ${process.env.NODE_ENV || "development"}`);
  log("info", `Process ID: ${process.pid}`);
  log("info", `Node Version: ${process.version}`);

  // Error-Handler einrichten
  setupErrorHandlers();

  // Redis-Verbindung pruefen
  log("info", "Checking Redis connection...");
  const redisHealthy = await isRedisHealthy();

  if (!redisHealthy) {
    log("error", "Cannot connect to Redis. Please check REDIS_URL environment variable.");
    log("error", `REDIS_URL: ${process.env.REDIS_URL || "redis://localhost:6379 (default)"}`);
    process.exit(1);
  }

  log("info", "Redis connection established");

  // Worker starten
  log("info", "Starting workers...");
  const startedWorkers = startAllWorkers();

  if (startedWorkers.length === 0) {
    log("error", "No workers started!");
    process.exit(1);
  }

  log("info", `Started ${startedWorkers.length} workers: ${startedWorkers.join(", ")}`);

  // Health-Check starten
  startHealthCheck();

  // Initial Health-Check
  await performHealthCheck();

  log("info", "=".repeat(60));
  log("info", "All workers running. Press Ctrl+C to stop.");
  log("info", "=".repeat(60));
}

// Start
main().catch((error) => {
  log("error", "Fatal error during startup", {
    error: error instanceof Error ? error.message : "Unknown error",
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
