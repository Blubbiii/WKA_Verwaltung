"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ScatterChart,
  Scatter,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Clock, Bell, Zap } from "lucide-react";
import { AnalyticsKpiRow } from "./kpi-row";
import type { FaultParetoItem, WarningTrendPoint } from "@/types/analytics";

// =============================================================================
// Types
// =============================================================================

interface FaultAnalysisProps {
  statePareto: FaultParetoItem[];
  warningTrend: WarningTrendPoint[];
  perTurbine: Array<{
    turbineId: string;
    designation: string;
    totalFaultDuration: number;
    totalFaultCount: number;
    productionLossEstimateKwh: number;
  }>;
  isLoading?: boolean;
}

// =============================================================================
// Formatters
// =============================================================================

const numFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const dec1Fmt = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dec2Fmt = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// =============================================================================
// Tooltips
// =============================================================================

interface TPayload { name: string; value: number; color: string; dataKey: string }

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

function WarningTrendTooltip({ active, payload, label }: { active?: boolean; payload?: TPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const freq = payload.find((p) => p.dataKey === "totalFrequency");
  const dur = payload.find((p) => p.dataKey === "durationHours");
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {freq && <p className="text-sm">Warnungen: {numFmt.format(freq.value)}</p>}
      {dur && <p className="text-sm text-muted-foreground">Dauer: {dec1Fmt.format(dur.value)} h</p>}
    </div>
  );
}

function TurbineFaultTooltip({ active, payload, label }: { active?: boolean; payload?: TPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const bar = payload.find((p) => p.dataKey === "faultHours");
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {bar && <p className="text-sm">Stoerungszeit: {dec1Fmt.format(bar.value)} h</p>}
    </div>
  );
}

interface ScatterPayloadItem {
  payload: {
    designation: string;
    totalFaultCount: number;
    lossMwh: number;
  };
}

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: ScatterPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{d.designation}</p>
      <p className="text-sm">Stoerungen: {numFmt.format(d.totalFaultCount)}</p>
      <p className="text-sm text-muted-foreground">Produktionsverlust: {dec1Fmt.format(d.lossMwh)} MWh</p>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function FaultAnalysis({
  statePareto,
  warningTrend,
  perTurbine,
  isLoading,
}: FaultAnalysisProps) {
  // Compute KPI values
  const kpiData = useMemo(() => {
    const uniqueStates = statePareto.length;
    const totalFaultDurationSec = perTurbine.reduce((s, t) => s + t.totalFaultDuration, 0);
    const totalFaultHours = totalFaultDurationSec / 3600;

    const totalWarningFrequency = warningTrend.reduce((s, w) => s + w.totalFrequency, 0);
    const monthCount = warningTrend.length || 1;
    const avgWarningsPerMonth = totalWarningFrequency / monthCount;

    const totalLossKwh = perTurbine.reduce((s, t) => s + t.productionLossEstimateKwh, 0);
    const totalLossMwh = totalLossKwh / 1000;

    return { uniqueStates, totalFaultHours, avgWarningsPerMonth, totalLossMwh };
  }, [statePareto, warningTrend, perTurbine]);

  const kpis = useMemo(() => [
    {
      title: "Stoerungscodes",
      value: numFmt.format(kpiData.uniqueStates),
      icon: AlertTriangle,
      description: "Verschiedene Zustaende",
    },
    {
      title: "Gesamte Stoerungszeit",
      value: numFmt.format(Math.round(kpiData.totalFaultHours)) + " h",
      icon: Clock,
      description: "Alle Anlagen",
    },
    {
      title: "Warnungen/Monat",
      value: dec1Fmt.format(kpiData.avgWarningsPerMonth),
      icon: Bell,
      description: "Durchschnittliche Haeufigkeit",
    },
    {
      title: "Geschaetzter Produktionsverlust",
      value: dec1Fmt.format(kpiData.totalLossMwh) + " MWh",
      icon: Zap,
      description: "Durch Stoerungen",
    },
  ], [kpiData]);

  // Warning trend data with duration in hours
  const warningTrendData = useMemo(
    () => warningTrend.map((w) => ({
      label: w.label,
      totalFrequency: w.totalFrequency,
      durationHours: w.totalDurationSeconds / 3600,
    })),
    [warningTrend]
  );

  // Per-turbine data sorted by fault duration desc
  const turbineFaultData = useMemo(
    () => [...perTurbine]
      .sort((a, b) => b.totalFaultDuration - a.totalFaultDuration)
      .map((t) => ({
        designation: t.designation,
        faultHours: t.totalFaultDuration / 3600,
      })),
    [perTurbine]
  );

  // Scatter data: fault count vs production loss (MWh)
  const scatterData = useMemo(
    () => perTurbine.map((t) => ({
      designation: t.designation,
      totalFaultCount: t.totalFaultCount,
      lossMwh: t.productionLossEstimateKwh / 1000,
    })),
    [perTurbine]
  );

  if (statePareto.length === 0 && perTurbine.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mb-2" />
        <p>Keine Stoerungsdaten vorhanden</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <AnalyticsKpiRow kpis={kpis} isLoading={isLoading} />

      {/* Row: Pareto + Warning Trend */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Stoerungen-Pareto */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Stoerungen-Pareto (Top 20 Zustaende)</CardTitle>
          </CardHeader>
          <CardContent>
            {statePareto.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={statePareto} margin={{ left: 0, right: 20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                    height={60}
                  />
                  <YAxis
                    yAxisId="pct"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, (max: number) => Math.ceil(max * 1.1)]}
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
                  <Legend />
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
              <p className="text-sm text-muted-foreground text-center py-8">Keine Stoerungen erfasst</p>
            )}
          </CardContent>
        </Card>

        {/* Warnungs-Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Warnungs-Trend (monatlich)</CardTitle>
          </CardHeader>
          <CardContent>
            {warningTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={warningTrendData} margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="freq"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => numFmt.format(v)}
                  />
                  <YAxis
                    yAxisId="dur"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${numFmt.format(v)} h`}
                  />
                  <Tooltip content={<WarningTrendTooltip />} />
                  <Legend />
                  <Bar
                    yAxisId="freq"
                    dataKey="totalFrequency"
                    name="Warnungen (Anzahl)"
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="dur"
                    type="monotone"
                    dataKey="durationHours"
                    name="Dauer (Stunden)"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#8b5cf6" }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Keine Warnungsdaten vorhanden</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row: Turbine Fault Duration + Scatter */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Stoerungen pro Turbine (horizontal bar) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Stoerungszeit pro Anlage</CardTitle>
          </CardHeader>
          <CardContent>
            {turbineFaultData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(250, turbineFaultData.length * 35 + 60)}>
                <BarChart data={turbineFaultData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${numFmt.format(v)} h`}
                  />
                  <YAxis
                    type="category"
                    dataKey="designation"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={90}
                  />
                  <Tooltip content={<TurbineFaultTooltip />} />
                  <Bar
                    dataKey="faultHours"
                    name="Stoerungszeit"
                    fill="#ef4444"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Keine Stoerungsdaten pro Anlage</p>
            )}
          </CardContent>
        </Card>

        {/* Scatter: Fault Count vs Production Loss */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Stoerungen vs. Produktionsverlust</CardTitle>
          </CardHeader>
          <CardContent>
            {scatterData.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <ScatterChart margin={{ left: 10, right: 20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    type="number"
                    dataKey="totalFaultCount"
                    name="Stoerungen"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    label={{ value: "Stoerungen (Anzahl)", position: "insideBottom", offset: -5, fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="lossMwh"
                    name="Produktionsverlust"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${dec1Fmt.format(v)}`}
                    label={{ value: "Verlust (MWh)", angle: -90, position: "insideLeft", offset: 0, fontSize: 11 }}
                  />
                  <Tooltip content={<ScatterTooltip />} />
                  <Scatter name="Anlagen" data={scatterData}>
                    {scatterData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill="#ef4444" fillOpacity={0.7} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Keine Daten fuer Scatter-Chart</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
