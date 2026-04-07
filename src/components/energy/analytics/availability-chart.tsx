"use client";

import { useMemo } from "react";
import {
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ComposedChart,
  BarChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SwitchableChart } from "@/components/ui/switchable-chart";
import { Clock, CheckCircle, AlertTriangle, Wrench } from "lucide-react";
import { AnalyticsKpiRow } from "./kpi-row";
import { HeatmapChart } from "./heatmap-chart";
import type {
  AvailabilityBreakdown,
  AvailabilityTrendPoint,
  HeatmapData,
  ParetoItem,
  AvailabilityTarget,
} from "@/types/analytics";
import { T_CATEGORIES } from "@/types/analytics";

// =============================================================================
// Types
// =============================================================================

interface AvailabilityChartProps {
  breakdown: AvailabilityBreakdown[];
  trend: AvailabilityTrendPoint[];
  heatmap: HeatmapData[];
  pareto: ParetoItem[];
  fleet: {
    avgAvailability: number;
    totalProductionHours: number;
    totalDowntimeHours: number;
    totalMaintenanceHours: number;
  };
  targets?: AvailabilityTarget[];
  isLoading?: boolean;
}

// =============================================================================
// Formatters
// =============================================================================

const numFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const dec2Fmt = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatHours(seconds: number): string {
  return numFmt.format(Math.round(seconds / 3600)) + " h";
}

// =============================================================================
// Tooltips
// =============================================================================

interface TPayload { name: string; value: number; color: string; dataKey: string }

function StackedTooltip({ active, payload, label }: { active?: boolean; payload?: TPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg max-w-xs">
      <p className="font-medium mb-2">{label}</p>
      {payload.map((e, i) => (
        <p key={i} className="text-sm flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: e.color }} />
          <span className="text-muted-foreground">{e.name}:</span>
          <span className="font-medium">{dec2Fmt.format(e.value)} %</span>
        </p>
      ))}
    </div>
  );
}

function ParetoTooltip({ active, payload, label }: { active?: boolean; payload?: TPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const bar = payload.find((p) => p.dataKey === "percentage");
  const line = payload.find((p) => p.dataKey === "cumulative");
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {bar && <p className="text-sm">Anteil: {dec2Fmt.format(bar.value)} %</p>}
      {line && <p className="text-sm text-muted-foreground">Kumulativ: {dec2Fmt.format(line.value)} %</p>}
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function AvailabilityChart({
  breakdown,
  trend,
  heatmap,
  pareto,
  fleet,
  targets,
  isLoading,
}: AvailabilityChartProps) {
  // Convert breakdown to percentage-based stacked data
  const stackedData = useMemo(
    () =>
      breakdown.map((b) => {
        const total = b.totalSeconds || 1;
        return {
          name: b.designation,
          [T_CATEGORIES.t1.label]: (b.t1 / total) * 100,
          [T_CATEGORIES.t2.label]: (b.t2 / total) * 100,
          [T_CATEGORIES.t3.label]: (b.t3 / total) * 100,
          [T_CATEGORIES.t4.label]: (b.t4 / total) * 100,
          [T_CATEGORIES.t5.label]: (b.t5 / total) * 100,
          [T_CATEGORIES.t6.label]: (b.t6 / total) * 100,
        };
      }),
    [breakdown]
  );

  // Trend data
  const trendData = useMemo(
    () => trend.map((t) => ({ label: t.label, verfügbarkeit: t.avgAvailability })),
    [trend]
  );

  // External stop breakdown
  const externalStops = useMemo(() => {
    const t5_1 = breakdown.reduce((s, b) => s + b.t5_1, 0);
    const t5_2 = breakdown.reduce((s, b) => s + b.t5_2, 0);
    const t5_3 = breakdown.reduce((s, b) => s + b.t5_3, 0);
    return { t5_1, t5_2, t5_3, total: t5_1 + t5_2 + t5_3 };
  }, [breakdown]);

  // KPI cards
  const kpis = useMemo(() => [
    {
      title: "Mittlere Verfügbarkeit",
      value: dec2Fmt.format(fleet.avgAvailability) + " %",
      icon: CheckCircle,
      description: `${breakdown.length} Anlagen`,
    },
    {
      title: "Produktionszeit",
      value: numFmt.format(fleet.totalProductionHours) + " h",
      icon: Clock,
      description: "Summe aller Anlagen (T1)",
    },
    {
      title: "Störungszeit",
      value: numFmt.format(fleet.totalDowntimeHours) + " h",
      icon: AlertTriangle,
      description: "Ungeplante Ausfaelle (T5)",
    },
    {
      title: "Wartungszeit",
      value: numFmt.format(fleet.totalMaintenanceHours) + " h",
      icon: Wrench,
      description: "Geplante Wartung (T4)",
    },
  ], [fleet, breakdown.length]);

  if (breakdown.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <Clock className="h-8 w-8 mb-2" />
        <p>Keine Verfügbarkeitsdaten vorhanden</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <AnalyticsKpiRow kpis={kpis} isLoading={isLoading} />

      {/* Row: Stacked Bar + Pareto */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* T1-T6 Stacked Bar per Turbine */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Zeitbudget pro Anlage (IEC 61400-26)</CardTitle>
          </CardHeader>
          <CardContent>
              <BarChart width="100%" height={Math.max(250, stackedData.length * 40 + 60)} data={stackedData} layout="vertical" stackOffset="expand" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `${Math.round(v * 100)}%`}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip content={<StackedTooltip />} />
                <Legend />
                {Object.entries(T_CATEGORIES).map(([, cat]) => (
                  <Bar
                    key={cat.label}
                    dataKey={cat.label}
                    stackId="t"
                    fill={cat.color}
                    name={cat.label}
                  />
                ))}
              </BarChart>
          </CardContent>
        </Card>

        {/* Downtime Pareto */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ausfallzeiten-Pareto</CardTitle>
          </CardHeader>
          <CardContent>
            {pareto.length > 0 ? (
                <ComposedChart width="100%" height={300} data={pareto} margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="pct"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 100]}
                  />
                  <YAxis
                    yAxisId="cum"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip content={<ParetoTooltip />} />
                  <Bar
                    yAxisId="pct"
                    dataKey="percentage"
                    name="Anteil"
                    fill="#ef4444"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="cum"
                    type="monotone"
                    dataKey="cumulative"
                    name="Kumulativ"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "hsl(var(--chart-1))" }}
                  />
                </ComposedChart>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Keine Ausfallzeiten erfasst</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Availability Trend */}
      {trendData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Verfügbarkeits-Trend (monatlich)</CardTitle>
          </CardHeader>
          <CardContent>
            <SwitchableChart
              chartId="analytics-availability-trend"
              data={trendData}
              dataKeys={[
                { key: "verfügbarkeit", label: "Verfügbarkeit", color: "#22c55e" },
              ]}
              xAxisKey="label"
              defaultType="line"
              allowedTypes={["line", "area"]}
              height={300}
              showLegend={false}
              tooltipFormatter={(value) => [`${dec2Fmt.format(value)} %`, "Verfügbarkeit"]}
            />
          </CardContent>
        </Card>
      )}

      {/* Availability Heatmap */}
      <HeatmapChart
        data={heatmap}
        title="Verfügbarkeit pro Anlage und Monat (%)"
        colorScale="green"
        valueFormatter={(v) => dec2Fmt.format(v) + " %"}
      />

      {/* External Stop Breakdown */}
      {externalStops.total > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Externe Abschaltungen (T5-Unterkategorien)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Netzausfall (T5.1)</p>
                <p className="text-xl font-bold mt-1">{formatHours(externalStops.t5_1)}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Fernabschaltung (T5.2)</p>
                <p className="text-xl font-bold mt-1">{formatHours(externalStops.t5_2)}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Sonstige externe (T5.3)</p>
                <p className="text-xl font-bold mt-1">{formatHours(externalStops.t5_3)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Availability Targets (Soll/Ist) */}
      {targets && targets.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Verfügbarkeitsziele (Soll/Ist)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {targets.map((t) => (
                <div
                  key={t.parkId}
                  className={`rounded-lg border p-4 ${
                    t.status === "green"
                      ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
                      : t.status === "yellow"
                        ? "border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30"
                        : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium truncate">{t.parkName}</p>
                    <span className={`inline-flex h-2.5 w-2.5 rounded-full ${
                      t.status === "green" ? "bg-green-500" : t.status === "yellow" ? "bg-yellow-500" : "bg-red-500"
                    }`} />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{dec2Fmt.format(t.actualPct)} %</span>
                    <span className="text-sm text-muted-foreground">
                      / {dec2Fmt.format(t.targetPct)} % Ziel
                    </span>
                  </div>
                  <p className={`text-xs mt-1 ${
                    t.delta >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                  }`}>
                    {t.delta >= 0 ? "+" : ""}{dec2Fmt.format(t.delta)} Pp
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
