"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Clock,
  AlertTriangle,
  Zap,
  Server,
  HardDrive,
  Timer,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KPICard } from "@/components/dashboard/kpi-card";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

// =============================================================================
// Types
// =============================================================================

interface MonitoringData {
  realtime: {
    totalRequests: number;
    avgResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    errorRate: number;
    slowRequests: number;
  };
  history: {
    requestRate: Array<{ time: string; value: number }>;
    latencyP95: Array<{ time: string; value: number }>;
  };
  system: {
    memoryMb: number;
    heapUsedMb: number;
    uptimeHours: number;
  };
  queues: Array<{ name: string; active: number }>;
  topEndpoints: Array<{
    endpoint: string;
    count: number;
    avgMs: number;
    maxMs: number;
  }>;
}

// =============================================================================
// Helpers
// =============================================================================

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatUptime(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} Min`;
  if (hours < 24) return `${Math.round(hours)} Std`;
  const days = Math.floor(hours / 24);
  const h = Math.round(hours % 24);
  return `${days}d ${h}h`;
}

const QUEUE_LABELS: Record<string, string> = {
  email: "E-Mail",
  pdf: "PDF",
  billing: "Abrechnung",
  weather: "Wetter",
  report: "Berichte",
  reminder: "Erinnerungen",
  "scada-auto-import": "SCADA Import",
  paperless: "Paperless",
  "inbox-ocr": "Inbox OCR",
  webhook: "Webhooks",
};

// =============================================================================
// Component
// =============================================================================

export function MonitoringDashboard() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/monitoring");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" />
        Lade Monitoring-Daten...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p>{error}</p>
        <Button variant="outline" size="sm" onClick={fetchData}>
          Erneut versuchen
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const chartData = data.history.requestRate.map((point, i) => ({
    time: formatTime(point.time),
    requestRate: point.value,
    latencyP95: data.history.latencyP95[i]?.value ?? 0,
  }));

  return (
    <div className="space-y-6">
      {/* Status Bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {lastUpdate && `Aktualisiert: ${lastUpdate.toLocaleTimeString("de-DE")}`}
          {error && <span className="text-destructive ml-2">({error})</span>}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchData}
          className="h-7 text-xs"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Aktualisieren
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Requests (5 Min)"
          value={data.realtime.totalRequests}
          icon={Activity}
          description={`${data.realtime.slowRequests} langsame Anfragen`}
          accentColor="text-blue-600 dark:text-blue-400"
          iconColor="text-blue-500/40 dark:text-blue-400/30"
        />
        <KPICard
          title="Ø Antwortzeit"
          value={`${data.realtime.avgResponseTime} ms`}
          icon={Clock}
          description={`P99: ${data.realtime.p99ResponseTime} ms`}
          accentColor="text-emerald-600 dark:text-emerald-400"
          iconColor="text-emerald-500/40 dark:text-emerald-400/30"
          isAlert={data.realtime.avgResponseTime > 1000}
        />
        <KPICard
          title="P95 Latenz"
          value={`${data.realtime.p95ResponseTime} ms`}
          icon={Zap}
          accentColor="text-amber-600 dark:text-amber-400"
          iconColor="text-amber-500/40 dark:text-amber-400/30"
          isAlert={data.realtime.p95ResponseTime > 2000}
        />
        <KPICard
          title="Fehlerrate"
          value={`${data.realtime.errorRate} %`}
          icon={AlertTriangle}
          accentColor={
            data.realtime.errorRate > 5
              ? "text-red-600 dark:text-red-400"
              : "text-green-600 dark:text-green-400"
          }
          iconColor={
            data.realtime.errorRate > 5
              ? "text-red-500/40 dark:text-red-400/30"
              : "text-green-500/40 dark:text-green-400/30"
          }
          isAlert={data.realtime.errorRate > 5}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Request Rate Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Request-Rate (letzte Stunde)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
                <AreaChart width="100%" height={250} data={chartData}>
                  <defs>
                    <linearGradient id="reqGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    opacity={0.5}
                  />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(value) => {
                      const num = typeof value === "number" ? value : 0;
                      return [`${num.toFixed(2)} req/s`, "Rate"];
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="requestRate"
                    stroke="hsl(var(--chart-1))"
                    fill="url(#reqGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
            </div>
          </CardContent>
        </Card>

        {/* P95 Latency Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              P95 Latenz (letzte Stunde)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
                <LineChart width="100%" height={250} data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    opacity={0.5}
                  />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    width={45}
                    unit=" ms"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(value) => {
                      const num = typeof value === "number" ? value : 0;
                      return [`${num} ms`, "P95"];
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="latencyP95"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System + Queues Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* System Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="h-4 w-4" />
              System
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5" />
                Memory (RSS)
              </span>
              <span className="text-sm font-mono font-medium">
                {data.system.memoryMb} MB
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5" />
                Heap Used
              </span>
              <span className="text-sm font-mono font-medium">
                {data.system.heapUsedMb} MB
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5" />
                Uptime
              </span>
              <span className="text-sm font-mono font-medium">
                {formatUptime(data.system.uptimeHours)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Queue Status */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Queue Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.queues.length > 0 ? (
                data.queues.map((q) => (
                  <Badge
                    key={q.name}
                    variant={q.active > 0 ? "default" : "secondary"}
                    className="text-xs py-1 px-2.5"
                  >
                    {QUEUE_LABELS[q.name] || q.name}
                    {q.active > 0 && (
                      <span className="ml-1.5 bg-background/20 px-1 rounded">
                        {q.active}
                      </span>
                    )}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  Keine aktiven Queues
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Endpoints Table */}
      {data.topEndpoints.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Top Endpoints (letzte 5 Min)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Endpoint</th>
                    <th className="pb-2 font-medium text-right">Requests</th>
                    <th className="pb-2 font-medium text-right">Ø Latenz</th>
                    <th className="pb-2 font-medium text-right">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topEndpoints.map((ep) => (
                    <tr key={ep.endpoint} className="border-b border-border/50">
                      <td className="py-2 font-mono text-xs">{ep.endpoint}</td>
                      <td className="py-2 text-right font-mono">{ep.count}</td>
                      <td className="py-2 text-right font-mono">
                        <span
                          className={
                            ep.avgMs > 1000
                              ? "text-amber-600 dark:text-amber-400"
                              : ""
                          }
                        >
                          {ep.avgMs} ms
                        </span>
                      </td>
                      <td className="py-2 text-right font-mono">
                        <span
                          className={
                            ep.maxMs > 2000
                              ? "text-red-600 dark:text-red-400"
                              : ""
                          }
                        >
                          {ep.maxMs} ms
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
