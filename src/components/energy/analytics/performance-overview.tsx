"use client";

import { useMemo } from "react";
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Line,
  ComposedChart,
  BarChart,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Zap, Wind, Gauge, TrendingUp } from "lucide-react";
import { AnalyticsKpiRow } from "./kpi-row";
import { HeatmapChart } from "./heatmap-chart";
import type {
  TurbinePerformanceKpi,
  FleetPerformanceSummary,
  HeatmapData,
  YearOverYearData,
} from "@/types/analytics";

// =============================================================================
// Types
// =============================================================================

interface PerformanceOverviewProps {
  turbines: TurbinePerformanceKpi[];
  fleet: FleetPerformanceSummary;
  heatmap: HeatmapData[];
  yearOverYear: YearOverYearData[];
  year: number;
  compareYear: number;
  isLoading?: boolean;
  /** Callback when a heatmap cell is clicked for drill-down */
  onHeatmapCellClick?: (turbineId: string, turbineDesignation: string, month: number) => void;
}

// =============================================================================
// Formatters
// =============================================================================

const numFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const dec1Fmt = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dec2Fmt = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatMwh(kwh: number): string {
  return dec1Fmt.format(kwh / 1000) + " MWh";
}

// =============================================================================
// Custom Tooltips
// =============================================================================

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

function CfTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((e, i) => (
        <p key={i} className="text-sm">
          <span className="inline-block w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: e.color }} />
          {dec2Fmt.format(e.value)} %
        </p>
      ))}
    </div>
  );
}

function YoyTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((e, i) => (
        <p key={i} className="text-sm flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: e.color }} />
          <span className="text-muted-foreground">{e.name}:</span>
          <span className="font-medium">{formatMwh(e.value)}</span>
        </p>
      ))}
    </div>
  );
}

// =============================================================================
// Capacity Factor color
// =============================================================================

function cfColor(cf: number): string {
  if (cf >= 30) return "#22c55e";
  if (cf >= 20) return "#f59e0b";
  return "#ef4444";
}

// =============================================================================
// Component
// =============================================================================

export function PerformanceOverview({
  turbines,
  fleet,
  heatmap,
  yearOverYear,
  year,
  compareYear,
  isLoading,
  onHeatmapCellClick,
}: PerformanceOverviewProps) {
  // Sort turbines by capacity factor descending for ranking
  const ranked = useMemo(
    () => [...turbines].sort((a, b) => b.capacityFactor - a.capacityFactor),
    [turbines]
  );

  // Capacity factor bar data (sorted ascending for horizontal bars)
  const cfData = useMemo(
    () => [...turbines].sort((a, b) => a.capacityFactor - b.capacityFactor).map((t) => ({
      name: t.designation,
      cf: t.capacityFactor,
    })),
    [turbines]
  );

  // YoY comparison data with kWh converted to MWh
  const yoyData = useMemo(
    () => yearOverYear.map((d) => ({
      label: d.label,
      [String(year)]: d.currentYear / 1000,
      [String(compareYear)]: d.previousYear / 1000,
    })),
    [yearOverYear, year, compareYear]
  );

  // KPI cards
  const kpis = useMemo(() => {
    const yoyCurrentTotal = yearOverYear.reduce((s, d) => s + d.currentYear, 0);
    const yoyPrevTotal = yearOverYear.reduce((s, d) => s + d.previousYear, 0);
    const prodTrend = yoyPrevTotal > 0
      ? ((yoyCurrentTotal - yoyPrevTotal) / yoyPrevTotal) * 100
      : undefined;

    return [
      {
        title: "Gesamtproduktion",
        value: formatMwh(fleet.totalProductionKwh),
        icon: Zap,
        trend: prodTrend,
        description: `${numFmt.format(fleet.totalInstalledKw)} kW installiert`,
      },
      {
        title: "Capacity Factor",
        value: dec2Fmt.format(fleet.avgCapacityFactor) + " %",
        icon: Gauge,
        description: "Durchschnitt aller Anlagen",
      },
      {
        title: "Specific Yield",
        value: dec1Fmt.format(fleet.avgSpecificYield) + " kWh/kW",
        icon: TrendingUp,
        description: "Jahresertrag pro kW installiert",
      },
      {
        title: "Mittlere Windgeschwindigkeit",
        value: fleet.avgWindSpeed != null ? dec1Fmt.format(fleet.avgWindSpeed) + " m/s" : "–",
        icon: Wind,
        description: "Durchschnitt im Berichtszeitraum",
      },
    ];
  }, [fleet, yearOverYear]);

  if (turbines.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <Zap className="h-8 w-8 mb-2" />
        <p>Keine Performance-Daten verfuegbar</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <AnalyticsKpiRow kpis={kpis} isLoading={isLoading} />

      {/* Row: Capacity Factor Chart + Ranking Table */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Capacity Factor Horizontal Bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Capacity Factor pro Anlage</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, cfData.length * 40 + 40)}>
              <BarChart data={cfData} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, "auto"]}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip content={<CfTooltip />} />
                <Bar dataKey="cf" name="Capacity Factor" radius={[0, 4, 4, 0]}>
                  {cfData.map((entry, idx) => (
                    <Cell key={idx} fill={cfColor(entry.cf)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Ranking Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Turbinen-Ranking</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Anlage</TableHead>
                  <TableHead className="text-right">Produktion</TableHead>
                  <TableHead className="text-right">CF</TableHead>
                  <TableHead className="text-right">Specific Yield</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranked.map((t, i) => (
                  <TableRow key={t.turbineId}>
                    <TableCell className="font-medium">{i + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{t.designation}</div>
                      <div className="text-xs text-muted-foreground">{t.parkName}</div>
                    </TableCell>
                    <TableCell className="text-right">{formatMwh(t.productionKwh)}</TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={t.capacityFactor >= 30 ? "default" : t.capacityFactor >= 20 ? "secondary" : "destructive"}
                        className="font-mono"
                      >
                        {dec2Fmt.format(t.capacityFactor)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {dec1Fmt.format(t.specificYield)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Production Heatmap */}
      <HeatmapChart
        data={heatmap}
        title="Monatliche Produktion (kWh)"
        colorScale="green"
        valueFormatter={(v) => formatMwh(v)}
        onCellClick={onHeatmapCellClick}
      />

      {/* Year over Year Comparison */}
      {yoyData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Jahresvergleich: {year} vs. {compareYear}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={yoyData}>
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
                  tickFormatter={(v) => `${numFmt.format(v)} MWh`}
                />
                <Tooltip content={<YoyTooltip />} />
                <Legend />
                <Bar
                  dataKey={String(year)}
                  name={String(year)}
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey={String(compareYear)}
                  name={String(compareYear)}
                  fill="#94a3b8"
                  radius={[4, 4, 0, 0]}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
