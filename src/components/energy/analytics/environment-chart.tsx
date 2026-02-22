"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wind, CloudRain, Thermometer, Gauge } from "lucide-react";
import { AnalyticsKpiRow } from "./kpi-row";
import type {
  WindDistributionBin,
  SeasonalPatternPoint,
  DirectionEfficiency,
} from "@/types/analytics";

// =============================================================================
// Types
// =============================================================================

interface EnvironmentChartProps {
  windDistribution: WindDistributionBin[];
  seasonalPatterns: SeasonalPatternPoint[];
  directionEfficiency: DirectionEfficiency[];
  summary: {
    avgWindSpeed: number;
    avgAirPressure: number | null;
    avgHumidity: number | null;
    totalRain: number | null;
  };
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

function WindDistTooltip({
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
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label} m/s</p>
      <p className="text-sm">
        <span className="text-muted-foreground">Anteil: </span>
        <span className="font-medium">{dec2Fmt.format(entry.value)} %</span>
      </p>
      {payload.length > 1 && (
        <p className="text-sm">
          <span className="text-muted-foreground">Anzahl: </span>
          <span className="font-medium">{numFmt.format(payload[1].value)}</span>
        </p>
      )}
    </div>
  );
}

function SeasonalTooltip({
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
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((e, i) => (
        <p key={i} className="text-sm flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: e.color }}
          />
          <span className="text-muted-foreground">{e.name}:</span>
          <span className="font-medium">
            {e.dataKey === "avgWindSpeed"
              ? dec1Fmt.format(e.value) + " m/s"
              : numFmt.format(e.value) + " kW"}
          </span>
        </p>
      ))}
    </div>
  );
}

function RadarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="text-sm">
        <span className="text-muted-foreground">Leistung: </span>
        <span className="font-medium">{dec1Fmt.format(entry.value)} kW</span>
      </p>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function EnvironmentChart({
  windDistribution,
  seasonalPatterns,
  directionEfficiency,
  summary,
  isLoading,
}: EnvironmentChartProps) {
  // KPI cards
  const kpis = useMemo(() => {
    return [
      {
        title: "Mittlere Windgeschwindigkeit",
        value: dec1Fmt.format(summary.avgWindSpeed) + " m/s",
        icon: Wind,
        description: "Jahresdurchschnitt",
      },
      {
        title: "Mittlerer Luftdruck",
        value:
          summary.avgAirPressure != null
            ? dec1Fmt.format(summary.avgAirPressure) + " hPa"
            : "---",
        icon: Gauge,
        description: "Jahresdurchschnitt",
      },
      {
        title: "Mittlere Luftfeuchtigkeit",
        value:
          summary.avgHumidity != null
            ? dec1Fmt.format(summary.avgHumidity) + " %"
            : "---",
        icon: Thermometer,
        description: "Jahresdurchschnitt",
      },
      {
        title: "Niederschlag gesamt",
        value:
          summary.totalRain != null
            ? dec1Fmt.format(summary.totalRain) + " mm"
            : "---",
        icon: CloudRain,
        description: "Jahressumme",
      },
    ];
  }, [summary]);

  // Histogram data (add a hidden count for tooltip)
  const histogramData = useMemo(() => {
    return windDistribution.map((bin) => ({
      windSpeedBin: bin.windSpeedBin,
      percentage: bin.percentage,
      count: bin.count,
    }));
  }, [windDistribution]);

  // Seasonal data for ComposedChart
  const seasonalData = useMemo(() => {
    return seasonalPatterns.map((p) => ({
      label: p.label,
      avgPowerKw: p.avgPowerKw,
      avgWindSpeed: p.avgWindSpeed,
    }));
  }, [seasonalPatterns]);

  // Radar data
  const radarData = useMemo(() => {
    return directionEfficiency.map((d) => ({
      direction: d.direction,
      avgPowerKw: d.avgPowerKw,
      avgWindSpeed: d.avgWindSpeed,
      count: d.count,
    }));
  }, [directionEfficiency]);

  // Empty state
  if (windDistribution.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <Wind className="h-8 w-8 mb-2" />
        <p>Keine Umweltdaten verfuegbar</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <AnalyticsKpiRow kpis={kpis} isLoading={isLoading} />

      {/* Wind Speed Histogram */}
      {histogramData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Windgeschwindigkeits-Verteilung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart
                data={histogramData}
                margin={{ left: 10, right: 10, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  className="stroke-muted"
                />
                <XAxis
                  dataKey="windSpeedBin"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: "Windgeschwindigkeit (m/s)",
                    position: "insideBottom",
                    offset: -2,
                    fontSize: 12,
                  }}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip content={<WindDistTooltip />} />
                <Bar
                  dataKey="percentage"
                  name="Anteil"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
                {/* Hidden bar for tooltip count display */}
                <Bar dataKey="count" name="Anzahl" fill="transparent" hide />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Row: Seasonal Patterns + Radar */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Seasonal Patterns (ComposedChart with dual Y-axis) */}
        {seasonalData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Saisonale Muster
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={seasonalData}>
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
                    yAxisId="left"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${numFmt.format(v)} kW`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${dec1Fmt.format(v)} m/s`}
                  />
                  <Tooltip content={<SeasonalTooltip />} />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="avgPowerKw"
                    name="Leistung (kW)"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="avgWindSpeed"
                    name="Windgeschwindigkeit (m/s)"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ fill: "#22c55e", r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Wind Direction vs. Efficiency (Radar Chart) */}
        {radarData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Windrichtung vs. Leistung
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                  <PolarGrid className="stroke-muted" />
                  <PolarAngleAxis
                    dataKey="direction"
                    tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }}
                  />
                  <PolarRadiusAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `${numFmt.format(v)}`}
                    angle={90}
                  />
                  <Tooltip content={<RadarTooltip />} />
                  <Radar
                    name="Leistung (kW)"
                    dataKey="avgPowerKw"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.3}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
