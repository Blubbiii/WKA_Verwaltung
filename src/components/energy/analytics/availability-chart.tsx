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
  LineChart,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, CheckCircle, AlertTriangle, Wrench } from "lucide-react";
import { AnalyticsKpiRow } from "./kpi-row";
import { HeatmapChart } from "./heatmap-chart";
import type {
  AvailabilityBreakdown,
  AvailabilityTrendPoint,
  HeatmapData,
  ParetoItem,
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
            <ResponsiveContainer width="100%" height={Math.max(250, stackedData.length * 40 + 60)}>
              <BarChart data={stackedData} layout="vertical" stackOffset="expand" margin={{ left: 10, right: 20 }}>
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
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Downtime Pareto */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ausfallzeiten-Pareto</CardTitle>
          </CardHeader>
          <CardContent>
            {pareto.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={pareto} margin={{ left: 0, right: 20 }}>
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
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#3b82f6" }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
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
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                  domain={[
                    (min: number) => Math.max(0, Math.floor(min - 5)),
                    100,
                  ]}
                />
                <Tooltip
                  formatter={(value: number) => [`${dec2Fmt.format(value)} %`, "Verfügbarkeit"]}
                  contentStyle={{ borderRadius: 8 }}
                />
                <Line
                  type="monotone"
                  dataKey="verfügbarkeit"
                  name="Verfügbarkeit"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#22c55e" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
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
    </div>
  );
}
