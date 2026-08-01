/**
 * Standalone Worker Entrypoint
 *
 * Dieses Script startet alle BullMQ Worker als separaten Prozess.
 * Kann unabhängig von der Next.js-Anwendung ausgeführt werden.
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
import { closeConnections, isRedisHealthy, checkRedisMemoryConfig } from "@/lib/queue/connection";
import { jobLogger } from "@/lib/logger";

// =============================================================================
// Configuration
// =============================================================================

const SHUTDOWN_TIMEOUT = 30000; // 30 Sekunden für graceful shutdown
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

/**
 * Consecutive failed Redis health checks before the process gives up.
 *
 * F4: The Redis connection is a module singleton shared by every worker.
 * If it stays dead the process keeps running but processes nothing — and the
 * Docker healthcheck (which opens its OWN connection) still reports "healthy".
 * Exiting non-zero is the only way to get the container restarted.
 */
const MAX_CONSECUTIVE_REDIS_FAILURES = 3;
let consecutiveRedisFailures = 0;

async function performHealthCheck(): Promise<void> {
  try {
    const redisHealthy = await isRedisHealthy();
    const status = getWorkersStatus();

    if (!redisHealthy) {
      consecutiveRedisFailures++;
      log("error", "Redis connection unhealthy!", {
        consecutiveFailures: consecutiveRedisFailures,
        maxFailures: MAX_CONSECUTIVE_REDIS_FAILURES,
      });

      if (consecutiveRedisFailures >= MAX_CONSECUTIVE_REDIS_FAILURES) {
        log(
          "error",
          `Redis unreachable for ${consecutiveRedisFailures} consecutive health checks — exiting so the orchestrator restarts this container`,
        );
        stopHealthCheck();
        process.exit(1);
      }
    } else if (consecutiveRedisFailures > 0) {
      log("info", "Redis connection recovered", {
        afterFailures: consecutiveRedisFailures,
      });
      consecutiveRedisFailures = 0;
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

    // Prisma-Verbindungen schliessen (verhindert Connection-Pool-Leaks)
    log("info", "Disconnecting Prisma client...");
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.$disconnect();
      log("info", "Prisma client disconnected");
    } catch (err) {
      log("warn", "Error disconnecting Prisma", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

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

  // Redis-Verbindung prüfen
  log("info", "Checking Redis connection...");
  const redisHealthy = await isRedisHealthy();

  if (!redisHealthy) {
    log("error", "Cannot connect to Redis. Please check REDIS_URL environment variable.");
    log("error", `REDIS_URL: ${process.env.REDIS_URL || "redis://localhost:6379 (default)"}`);
    process.exit(1);
  }

  log("info", "Redis connection established");

  // Redis memory config sanity check (warns on unlimited maxmemory / noeviction)
  await checkRedisMemoryConfig();

  // Worker starten
  log("info", "Starting workers...");
  const startedWorkers = startAllWorkers();

  if (startedWorkers.length === 0) {
    log("error", "No workers started!");
    process.exit(1);
  }

  log("info", `Started ${startedWorkers.length} workers: ${startedWorkers.join(", ")}`);

  // Approvals-Expiry Cron registrieren (idempotent — kann wiederholt gerufen werden)
  try {
    const { scheduleApprovalsExpiryCheck } = await import(
      "@/lib/queue/queues/approvals-expiry.queue"
    );
    await scheduleApprovalsExpiryCheck();
    log("info", "Approvals-expiry cron scheduled (every 6h)");
  } catch (err) {
    log("warn", "Failed to schedule approvals-expiry cron", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Retention Cron registrieren (täglich 03:00 — DSGVO + GoBD)
  try {
    const { scheduleRetentionCron } = await import(
      "@/lib/queue/queues/retention-cron.queue"
    );
    await scheduleRetentionCron();
    const dryRun = process.env.RETENTION_DRY_RUN !== "false";
    log(
      "info",
      `Retention cron scheduled (daily 03:00, mode: ${dryRun ? "DRY-RUN" : "LIVE"})`,
    );
  } catch (err) {
    log("warn", "Failed to schedule retention cron", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // tus-GC Cron registrieren (alle 6h — Resumable-Upload-Cleanup)
  try {
    const { scheduleTusGc } = await import(
      "@/lib/queue/queues/tus-gc.queue"
    );
    await scheduleTusGc();
    log("info", "tus-GC cron scheduled (every 6h)");
  } catch (err) {
    log("warn", "Failed to schedule tus-GC cron", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Daily-Digest Cron registrieren (täglich 08:00 — Idee E)
  // F17: Der Worker selbst wird über die Registry (startAllWorkers) gestartet —
  // nur so erreicht ihn SIGTERM und nur so taucht er im Health-Status auf.
  try {
    const { scheduleDailyDigest } = await import(
      "@/lib/queue/queues/daily-digest.queue"
    );
    await scheduleDailyDigest();
    const dryRun = process.env.DIGEST_DRY_RUN !== "false";
    log(
      "info",
      `Daily-Digest cron scheduled (daily 08:00, mode: ${dryRun ? "DRY-RUN" : "LIVE"})`,
    );
  } catch (err) {
    log("warn", "Failed to schedule daily-digest cron", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // F5: Approvals-Reconcile Cron registrieren (stündlich).
  // Ohne diesen Cron bleiben APPROVED-Approvals, deren inline-Executor starb,
  // dauerhaft mit executedAt=null liegen — Ausfallpfad mit Geldbezug.
  try {
    const { scheduleApprovalsReconcileCheck } = await import(
      "@/lib/queue/queues/approvals-reconcile.queue"
    );
    await scheduleApprovalsReconcileCheck();
    log("info", "Approvals-reconcile cron scheduled (hourly)");
  } catch (err) {
    log("warn", "Failed to schedule approvals-reconcile cron", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // F7: Report-Scheduling registrieren (täglich 06:00) — ohne diesen Cron
  // werden geplante Berichte nie erzeugt und nie versendet.
  try {
    const { scheduleDailyReportProcessing } = await import(
      "@/lib/queue/queues/report.queue"
    );
    await scheduleDailyReportProcessing();
    log("info", "Scheduled-report cron scheduled (daily 06:00)");
  } catch (err) {
    log("warn", "Failed to schedule report cron", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // F7: Weather-Scheduling initialisieren (pro Tenant/Park).
  // Idempotent — BullMQ dedupliziert die Repeatables über stabile jobIds.
  try {
    const { initializeWeatherScheduling } = await import(
      "@/lib/weather/scheduler"
    );
    await initializeWeatherScheduling();
    log("info", "Weather scheduling initialized");
  } catch (err) {
    log("warn", "Failed to initialize weather scheduling", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Wartungsläufe registrieren (Fristen 07:00, Basiszinssatz Mo 04:00,
  // Bankverbindungen 06:00).
  //
  // Diese drei gab es bisher nur als Endpunkte unter /api/cron/*, mit dem
  // Hinweis "kann von einem externen Scheduler aufgerufen werden". Aufgerufen
  // hat sie nie jemand — es gab im ganzen Codebase keinen Aufrufer. Sie liefen
  // also seit jeher nicht, ohne dass irgendwo etwas fehlschlug.
  try {
    const { scheduleMaintenanceJobs } = await import(
      "@/lib/queue/queues/maintenance.queue"
    );
    const scheduled = await scheduleMaintenanceJobs();
    log("info", `Maintenance crons scheduled: ${scheduled.join(", ")}`, {
      count: scheduled.length,
    });
  } catch (err) {
    log("warn", "Failed to schedule maintenance crons", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // F8: SCADA-Auto-Import Cron registrieren (täglich 02:00).
  // Die UI bestätigt "Auto-Import aktiviert" — ohne diesen Cron passierte nichts.
  try {
    const { scheduleScadaAutoImport } = await import(
      "@/lib/queue/queues/scada-auto-import.queue"
    );
    await scheduleScadaAutoImport();
    log("info", "SCADA auto-import cron scheduled (daily 02:00)");
  } catch (err) {
    log("warn", "Failed to schedule SCADA auto-import cron", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

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
