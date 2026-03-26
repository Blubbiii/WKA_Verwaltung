/**
 * Prometheus Metrics
 *
 * Singleton registry with standard app metrics.
 * Exposed via GET /api/metrics (Bearer token protected).
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from "prom-client";

// =============================================================================
// Registry (singleton — safe across hot-reloads in Next.js dev mode)
// =============================================================================

declare global {
   
  var __promRegistry: Registry | undefined;
}

function createRegistry(): Registry {
  const registry = new Registry();

  // Default Node.js metrics (memory, CPU, event loop lag, etc.)
  collectDefaultMetrics({ register: registry, prefix: "wpm_" });

  return registry;
}

export const registry: Registry =
  globalThis.__promRegistry ?? (globalThis.__promRegistry = createRegistry());

// =============================================================================
// Application Metrics
// =============================================================================

function getOrCreate<T>(name: string, factory: () => T): T {
  try {
    return registry.getSingleMetric(name) as T ?? factory();
  } catch {
    return factory();
  }
}

/** Total HTTP requests */
export const httpRequestsTotal = getOrCreate(
  "wpm_http_requests_total",
  () =>
    new Counter({
      name: "wpm_http_requests_total",
      help: "Total number of HTTP requests",
      labelNames: ["method", "route", "status"],
      registers: [registry],
    })
);

/** HTTP request duration */
export const httpDurationSeconds = getOrCreate(
  "wpm_http_duration_seconds",
  () =>
    new Histogram({
      name: "wpm_http_duration_seconds",
      help: "HTTP request duration in seconds",
      labelNames: ["method", "route"],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    })
);

/** Active BullMQ jobs */
export const queueJobsActive = getOrCreate(
  "wpm_queue_jobs_active",
  () =>
    new Gauge({
      name: "wpm_queue_jobs_active",
      help: "Number of currently active queue jobs",
      labelNames: ["queue"],
      registers: [registry],
    })
);

/** Total weather sync operations */
export const weatherSyncsTotal = getOrCreate(
  "wpm_weather_syncs_total",
  () =>
    new Counter({
      name: "wpm_weather_syncs_total",
      help: "Total weather sync operations",
      labelNames: ["status"],
      registers: [registry],
    })
);

/** Documents uploaded */
export const documentsUploadedTotal = getOrCreate(
  "wpm_documents_uploaded_total",
  () =>
    new Counter({
      name: "wpm_documents_uploaded_total",
      help: "Total documents uploaded",
      registers: [registry],
    })
);
