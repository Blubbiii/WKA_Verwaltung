"use client";

import { useMemo } from "react";
import {
  LineChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Loader2, Zap, Database, Wind } from "lucide-react";
import { AnalyticsKpiRow } from "./kpi-row";
import type {
  PhaseSymmetryTrendPoint,
  PhaseSymmetryPerTurbine,
  PhasePowersMonthly,
  PhaseSymmetrySummary,
} from "@/types/analytics";

// =============================================================================
// Types
// =============================================================================

interface PhaseSymmetryChartProps {
  symmetryTrend: PhaseSymmetryTrendPoint[];
  perTurbine: PhaseSymmetryPerTurbine[];
  phasePowers: PhasePowersMonthly[];
  summary: PhaseSymmetrySummary;
  isLoading?: boolean;
}

// =============================================================================
// Formatters
// =============================================================================

const dec1Fmt = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const dec2Fmt = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numFmt = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 0,
});

// =============================================================================
// Custom Tooltips
// =============================================================================

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-lg border bg-background p-2 shadow-md">
      <p className="font-medium mb-1">{label}</p>
      <p className="text-sm">
        <span className="text-muted-foreground">Unsymmetrie: </span>
        <span className="font-medium">{dec2Fmt.format(entry.value)} %</span>
      </p>
    </div>
  );
}

function PhasePowerTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-2 shadow-md">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((e, i) => (
        <p key={i} className="text-sm flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: e.color }}
          />
          <span className="text-muted-foreground">{e.name}:</span>
          <span className="font-medium">{numFmt.format(e.value)} kW</span>
        </p>
      ))}
    </div>
  );
}

function TurbineBarTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-lg border bg-background p-2 shadow-md">
      <p className="font-medium mb-1">{label}</p>
      <p className="text-sm">
        <span className="text-muted-foreground">Unsymmetrie: </span>
        <span className="font-medium">{dec2Fmt.format(entry.value)} %</span>
      </p>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function PhaseSymmetryChart({
  symmetryTrend,
  perTurbine,
  phasePowers,
  summary,
  isLoading,
}: PhaseSymmetryChartProps) {
  // KPI cards
  const kpis = useMemo(
    () => [
      {
        title: "Ø Unsymmetrie",
        value: dec1Fmt.format(summary.fleetAvgImbalancePct) + " %",
        icon: Activity,
        description:
          summary.fleetAvgImbalancePct > 5
            ? "Kritisch (> 5 %)"
            : summary.fleetAvgImbalancePct >= 3
              ? "Erhöht (3–5 %)"
              : "Normal (< 3 %)",
      },
      {
        title: "Kritischste Anlage",
        value: summary.worstTurbineDesignation ?? "---",
        icon: Zap,
        description:
          summary.worstTurbineDesignation
            ? dec1Fmt.format(summary.worstTurbineImbalancePct) + " %"
            : "Keine Daten",
      },
      {
        title: "Datenpunkte",
        value: numFmt.format(summary.totalDataPoints),
        icon: Database,
        description: "10-Minuten-Intervalle",
      },
      {
        title: "Anlagen",
        value: String(perTurbine.length),
        icon: Wind,
        description: "Mit Phasendaten",
      },
    ],
    [summary, perTurbine.length],
  );

  // Trend chart data
  const trendData = useMemo(
    () =>
      symmetryTrend.map((t) => ({
        label: t.label,
        avgImbalancePct: t.avgImbalancePct,
      })),
    [symmetryTrend],
  );

  // Phase powers chart data
  const phaseData = useMemo(
    () =>
      phasePowers.map((p) => ({
        label: p.label,
        P1: p.avgP1,
        P2: p.avgP2,
        P3: p.avgP3,
      })),
    [phasePowers],
  );

  // Per-turbine bar data (sorted descending by imbalance)
  const turbineData = useMemo(
    () =>
      [...perTurbine]
        .sort((a, b) => b.avgImbalancePct - a.avgImbalancePct)
        .map((t) => ({
          designation: t.designation,
          avgImbalancePct: t.avgImbalancePct,
        })),
    [perTurbine],
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Empty state
  if (
    symmetryTrend.length === 0 &&
    perTurbine.length === 0 &&
    phasePowers.length === 0
  ) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <Activity className="h-8 w-8 mb-2" />
        <p>Keine Phasen-Daten vorhanden</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <AnalyticsKpiRow kpis={kpis} isLoading={false} />

      {/* Row 1: Trend + Phase Powers */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Unsymmetrie-Trend */}
        {trendData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Unsymmetrie-Trend (monatlich)
              </CardTitle>
            </CardHeader>
            <CardContent>
                <LineChart width="100%" height={300} data={trendData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    className="stroke-muted"
                  />
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
                    domain={[0, "auto"]}
                  />
                  <Tooltip content={<TrendTooltip />} />
                  <ReferenceLine
                    y={5}
                    stroke="#ef4444"
                    strokeDasharray="6 4"
                    label={{
                      value: "5% Grenzwert",
                      position: "insideTopRight",
                      fontSize: 11,
                      fill: "#ef4444",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgImbalancePct"
                    name="Unsymmetrie"
                    stroke="#f43f5e"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "#f43f5e" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
            </CardContent>
          </Card>
        )}

        {/* Phasenleistung */}
        {phaseData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Phasenleistung (monatlich)
              </CardTitle>
            </CardHeader>
            <CardContent>
                <LineChart width="100%" height={300} data={phaseData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    className="stroke-muted"
                  />
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
                    tickFormatter={(v) => `${numFmt.format(v)} kW`}
                  />
                  <Tooltip content={<PhasePowerTooltip />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="P1"
                    name="Phase 1"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#3b82f6" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="P2"
                    name="Phase 2"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#22c55e" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="P3"
                    name="Phase 3"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#f59e0b" }}
                  />
                </LineChart>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Row 2: Per-Turbine horizontal bar chart */}
      {turbineData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Unsymmetrie pro Anlage
            </CardTitle>
          </CardHeader>
          <CardContent>
              <BarChart
                width="100%"
                height={Math.max(250, turbineData.length * 40 + 60)}
                data={turbineData}
                layout="vertical"
                margin={{ left: 10, right: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  className="stroke-muted"
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="designation"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip content={<TurbineBarTooltip />} />
                <ReferenceLine
                  x={5}
                  stroke="#ef4444"
                  strokeDasharray="6 4"
                  label={{
                    value: "5%",
                    position: "insideTopRight",
                    fontSize: 11,
                    fill: "#ef4444",
                  }}
                />
                <Bar
                  dataKey="avgImbalancePct"
                  name="Unsymmetrie"
                  fill="#f43f5e"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
