import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { getMetrics } from "@/lib/monitoring";
import { registry } from "@/lib/metrics/prometheus";
import { apiLogger as logger } from "@/lib/logger";

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || "http://prometheus:9090";

interface PrometheusResult {
  status: string;
  data: {
    resultType: string;
    result: Array<{
      metric: Record<string, string>;
      values?: [number, string][];
      value?: [number, string];
    }>;
  };
}

async function queryPrometheus(query: string): Promise<PrometheusResult | null> {
  try {
    const url = `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function queryPrometheusRange(
  query: string,
  start: number,
  end: number,
  step: number
): Promise<Array<{ time: string; value: number }>> {
  try {
    const url = `${PROMETHEUS_URL}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${step}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data: PrometheusResult = await res.json();
    if (data.status !== "success" || !data.data.result[0]?.values) return [];
    return data.data.result[0].values.map(([ts, val]) => ({
      time: new Date(ts * 1000).toISOString(),
      value: parseFloat(val) || 0,
    }));
  } catch {
    return [];
  }
}

function extractValue(result: PrometheusResult | null): number {
  if (!result?.data?.result?.[0]?.value) return 0;
  return parseFloat(result.data.result[0].value[1]) || 0;
}

/**
 * GET /api/admin/monitoring
 * Aggregated monitoring data: realtime metrics + Prometheus history + system info.
 */
export async function GET() {
  const check = await requireSuperadmin();
  if (!check.authorized) return check.error!;

  try {
    // 1. In-memory realtime metrics
    const realtime = getMetrics();

    // 2. Prometheus historical data (last hour, 1-min steps)
    const now = Math.floor(Date.now() / 1000);
    const oneHourAgo = now - 3600;

    const [requestRate, latencyP95, memResult, heapResult, uptimeResult] =
      await Promise.all([
        queryPrometheusRange(
          'sum(rate(wpm_http_requests_total[5m]))',
          oneHourAgo, now, 60
        ),
        queryPrometheusRange(
          'histogram_quantile(0.95, sum(rate(wpm_http_duration_seconds_bucket[5m])) by (le))',
          oneHourAgo, now, 60
        ),
        queryPrometheus('process_resident_memory_bytes{job="windparkmanager"}'),
        queryPrometheus('nodejs_heap_used_bytes{job="windparkmanager"}'),
        queryPrometheus('process_start_time_seconds{job="windparkmanager"}'),
      ]);

    // 3. System info
    const memoryBytes = extractValue(memResult);
    const heapBytes = extractValue(heapResult);
    const startTime = extractValue(uptimeResult);
    const uptimeHours = startTime > 0 ? (Date.now() / 1000 - startTime) / 3600 : 0;

    // 4. Queue status from local registry
    const queueMetric = await registry.getSingleMetric("wpm_queue_jobs_active");
    const queueData = queueMetric ? await queueMetric.get() : { values: [] };
    const queues = (queueData.values || []).map((v) => ({
      name: (v.labels as Record<string, string>).queue || "unknown",
      active: typeof v.value === "number" ? v.value : 0,
    }));

    // 5. Top endpoints (sorted by count desc, top 10)
    const topEndpoints = Object.entries(realtime.byEndpoint)
      .map(([endpoint, stats]) => ({ endpoint, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({
      realtime: {
        totalRequests: realtime.totalRequests,
        avgResponseTime: realtime.avgResponseTime,
        p95ResponseTime: realtime.p95ResponseTime,
        p99ResponseTime: realtime.p99ResponseTime,
        errorRate: realtime.errorRate,
        slowRequests: realtime.slowRequests,
      },
      history: {
        requestRate: requestRate.map((p) => ({
          ...p,
          value: Math.round(p.value * 100) / 100,
        })),
        latencyP95: latencyP95.map((p) => ({
          ...p,
          value: Math.round(p.value * 1000), // seconds → ms
        })),
      },
      system: {
        memoryMb: Math.round(memoryBytes / 1024 / 1024),
        heapUsedMb: Math.round(heapBytes / 1024 / 1024),
        uptimeHours: Math.round(uptimeHours * 10) / 10,
      },
      queues,
      topEndpoints,
    });
  } catch (err) {
    logger.error({ err }, "Failed to collect monitoring data");
    return NextResponse.json(
      { error: "Monitoring data collection failed" },
      { status: 500 }
    );
  }
}
