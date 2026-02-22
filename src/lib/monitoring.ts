import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

interface RequestMetrics {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  timestamp: string;
}

// In-memory metrics buffer (flushed periodically or on threshold)
const metricsBuffer: RequestMetrics[] = [];
const MAX_BUFFER_SIZE = 1000;

// Slow request threshold (ms)
const SLOW_REQUEST_THRESHOLD = parseInt(process.env.SLOW_REQUEST_THRESHOLD || "2000", 10);

/**
 * Wraps an API route handler with performance monitoring.
 * Adds Server-Timing header, records metrics, and logs slow requests.
 *
 * Accepts handlers that return NextResponse or NextResponse | undefined
 * (common when using requireAuth/requirePermission patterns).
 */
export function withMonitoring<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends (request: NextRequest, context?: any) => Promise<NextResponse | undefined>
>(handler: T) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (request: NextRequest, context?: any): Promise<NextResponse | undefined> => {
    const start = performance.now();
    let response: NextResponse | undefined;

    try {
      response = await handler(request, context);
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      recordMetric({
        method: request.method,
        path: request.nextUrl.pathname,
        statusCode: 500,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }

    const duration = Math.round(performance.now() - start);

    // If the handler returned undefined (should not normally happen), still record metric
    if (!response) {
      recordMetric({
        method: request.method,
        path: request.nextUrl.pathname,
        statusCode: 0,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      });
      return response;
    }

    // Add timing header
    response.headers.set("Server-Timing", `total;dur=${duration}`);

    // Record metric
    const metric: RequestMetrics = {
      method: request.method,
      path: request.nextUrl.pathname,
      statusCode: response.status,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    };
    recordMetric(metric);

    // Log slow requests
    if (duration > SLOW_REQUEST_THRESHOLD) {
      logger.warn(
        `[SLOW REQUEST] ${request.method} ${request.nextUrl.pathname} took ${duration}ms (threshold: ${SLOW_REQUEST_THRESHOLD}ms)`
      );
    }

    return response;
  };
}

function recordMetric(metric: RequestMetrics) {
  metricsBuffer.push(metric);

  // Prevent memory leak
  if (metricsBuffer.length > MAX_BUFFER_SIZE) {
    metricsBuffer.splice(0, metricsBuffer.length - MAX_BUFFER_SIZE);
  }
}

/**
 * Get current metrics snapshot (last 5 minutes).
 * Returns aggregate stats including averages, percentiles, and per-endpoint breakdowns.
 */
export function getMetrics() {
  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;

  // Filter to last 5 minutes
  const recentMetrics = metricsBuffer.filter(
    (m) => new Date(m.timestamp).getTime() > fiveMinutesAgo
  );

  if (recentMetrics.length === 0) {
    return {
      totalRequests: 0,
      avgResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      slowRequests: 0,
      errorRate: 0,
      byEndpoint: {},
    };
  }

  // Calculate stats
  const durations = recentMetrics.map((m) => m.durationMs).sort((a, b) => a - b);
  const errors = recentMetrics.filter((m) => m.statusCode >= 500);
  const slow = recentMetrics.filter((m) => m.durationMs > SLOW_REQUEST_THRESHOLD);

  // Per-endpoint stats
  const byEndpoint: Record<string, { count: number; avgMs: number; maxMs: number }> = {};
  for (const m of recentMetrics) {
    const key = `${m.method} ${m.path}`;
    if (!byEndpoint[key]) {
      byEndpoint[key] = { count: 0, avgMs: 0, maxMs: 0 };
    }
    byEndpoint[key].count++;
    byEndpoint[key].avgMs += m.durationMs;
    byEndpoint[key].maxMs = Math.max(byEndpoint[key].maxMs, m.durationMs);
  }
  for (const key of Object.keys(byEndpoint)) {
    byEndpoint[key].avgMs = Math.round(byEndpoint[key].avgMs / byEndpoint[key].count);
  }

  return {
    totalRequests: recentMetrics.length,
    avgResponseTime: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
    p95ResponseTime: durations[Math.floor(durations.length * 0.95)] || 0,
    p99ResponseTime: durations[Math.floor(durations.length * 0.99)] || 0,
    slowRequests: slow.length,
    errorRate: Math.round((errors.length / recentMetrics.length) * 100 * 100) / 100,
    byEndpoint,
  };
}
