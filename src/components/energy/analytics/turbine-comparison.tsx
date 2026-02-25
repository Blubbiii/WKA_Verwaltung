"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { GitCompare, Trophy, TrendingDown, Gauge } from "lucide-react";
import { AnalyticsKpiRow } from "./kpi-row";
import type {
  TurbineComparisonEntry,
  PowerCurvePoint,
} from "@/types/analytics";

// =============================================================================
// Types
// =============================================================================

interface TurbineComparisonProps {
  comparison: TurbineComparisonEntry[];
  powerCurves: Array<{
    turbineId: string;
    designation: string;
    curve: PowerCurvePoint[];
  }>;
  isLoading?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const TURBINE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-6))",
  "hsl(var(--chart-7))",
  "hsl(var(--chart-11))",
  "hsl(var(--chart-9))",
  "hsl(var(--chart-10))",
  "hsl(var(--chart-8))",
  "hsl(var(--chart-12))",
];

// =============================================================================
// Formatters
// =============================================================================

const numFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const dec1Fmt = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dec2Fmt = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

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

function PowerCurveTooltip({
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
    <div className="rounded-lg border bg-background p-3 shadow-lg max-w-xs">
      <p className="font-medium mb-1">{dec1Fmt.format(Number(label))} m/s</p>
      {payload.map((e, i) => (
        <p key={i} className="text-sm flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: e.color }}
          />
          <span className="text-muted-foreground truncate">{e.name}:</span>
          <span className="font-medium">{dec1Fmt.format(e.value)} kW</span>
        </p>
      ))}
    </div>
  );
}

function DeviationTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      <p className="text-sm">
        Abweichung:{" "}
        <span className={val >= 0 ? "text-green-600" : "text-red-600"}>
          {val >= 0 ? "+" : ""}
          {dec2Fmt.format(val)} %
        </span>
      </p>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function TurbineComparison({
  comparison,
  powerCurves,
  isLoading,
}: TurbineComparisonProps) {
  // Sorted by rank (already sorted, but ensure)
  const ranked = useMemo(
    () => [...comparison].sort((a, b) => a.rank - b.rank),
    [comparison]
  );

  // Best and worst turbine
  const best = ranked[0] ?? null;
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;

  // Fleet average CF
  const avgCf = useMemo(() => {
    if (comparison.length === 0) return 0;
    return (
      comparison.reduce((s, e) => s + e.capacityFactor, 0) / comparison.length
    );
  }, [comparison]);

  // KPI card definitions
  const kpis = useMemo(
    () => [
      {
        title: "Turbinen-Anzahl",
        value: numFmt.format(comparison.length),
        icon: GitCompare,
        description: "Anlagen im Vergleich",
      },
      {
        title: "Beste Anlage",
        value: best
          ? `${best.designation} (${dec2Fmt.format(best.capacityFactor)}%)`
          : "--",
        icon: Trophy,
        description: "Hoechster Capacity Factor",
      },
      {
        title: "Schlechteste Anlage",
        value: worst
          ? `${worst.designation} (${dec2Fmt.format(worst.capacityFactor)}%)`
          : "--",
        icon: TrendingDown,
        description: "Niedrigster Capacity Factor",
      },
      {
        title: "Mittlerer CF",
        value: dec2Fmt.format(avgCf) + " %",
        icon: Gauge,
        description: "Durchschnitt aller Anlagen",
      },
    ],
    [comparison, best, worst, avgCf]
  );

  // Power curve chart data: merge all turbines by windSpeed into unified data points
  const powerCurveData = useMemo(() => {
    if (powerCurves.length === 0) return [];

    // Collect all unique wind speed bins
    const windBins = new Set<number>();
    for (const pc of powerCurves) {
      for (const point of pc.curve) {
        windBins.add(point.windSpeed);
      }
    }

    const sortedBins = Array.from(windBins).sort((a, b) => a - b);

    // Build lookup per turbine
    const turbineLookups = powerCurves.map((pc) => {
      const lookup = new Map<number, number>();
      for (const point of pc.curve) {
        lookup.set(point.windSpeed, point.avgPowerKw);
      }
      return { designation: pc.designation, lookup };
    });

    return sortedBins.map((ws) => {
      const point: Record<string, number | undefined> = { windSpeed: ws };
      for (const tl of turbineLookups) {
        point[tl.designation] = tl.lookup.get(ws);
      }
      return point;
    });
  }, [powerCurves]);

  // Deviation bar data (sorted by deviation for visual clarity)
  const deviationData = useMemo(
    () =>
      [...comparison]
        .sort((a, b) => a.deviationFromFleetPct - b.deviationFromFleetPct)
        .map((e) => ({
          name: e.designation,
          deviation: e.deviationFromFleetPct,
        })),
    [comparison]
  );

  // Empty state
  if (comparison.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <GitCompare className="h-8 w-8 mb-2" />
        <p>Keine Vergleichsdaten verfügbar</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <AnalyticsKpiRow kpis={kpis} isLoading={isLoading} />

      {/* Power Curve Overlay */}
      {powerCurveData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Leistungskurven-Overlay
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart
                data={powerCurveData}
                margin={{ left: 10, right: 30, top: 10, bottom: 10 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-muted"
                />
                <XAxis
                  dataKey="windSpeed"
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: "Windgeschwindigkeit (m/s)",
                    position: "insideBottomRight",
                    offset: -5,
                    fontSize: 11,
                  }}
                  domain={["auto", "auto"]}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${numFmt.format(v)} kW`}
                />
                <Tooltip content={<PowerCurveTooltip />} />
                <Legend />
                {powerCurves.map((pc, idx) => (
                  <Line
                    key={pc.turbineId}
                    type="monotone"
                    dataKey={pc.designation}
                    name={pc.designation}
                    stroke={TURBINE_COLORS[idx % TURBINE_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Deviation Bar Chart */}
      {deviationData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Abweichung vom Flottendurchschnitt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer
              width="100%"
              height={Math.max(200, deviationData.length * 40 + 40)}
            >
              <BarChart
                data={deviationData}
                layout="vertical"
                margin={{ left: 10, right: 30 }}
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
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip content={<DeviationTooltip />} />
                <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                <Bar dataKey="deviation" name="Abweichung" radius={[0, 4, 4, 0]}>
                  {deviationData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.deviation >= 0 ? "hsl(var(--chart-3))" : "hsl(var(--chart-5))"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Ranking Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Ranking-Tabelle
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Anlage</TableHead>
                <TableHead>Park</TableHead>
                <TableHead className="text-right">Produktion (MWh)</TableHead>
                <TableHead className="text-right">CF (%)</TableHead>
                <TableHead className="text-right">Specific Yield</TableHead>
                <TableHead className="text-right">Abweichung (%)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranked.map((t) => (
                <TableRow key={t.turbineId}>
                  <TableCell className="font-medium">{t.rank}</TableCell>
                  <TableCell className="font-medium">
                    {t.designation}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.parkName}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMwh(t.productionKwh)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={
                        t.capacityFactor >= 30
                          ? "default"
                          : t.capacityFactor >= 20
                            ? "secondary"
                            : "destructive"
                      }
                      className="font-mono"
                    >
                      {dec2Fmt.format(t.capacityFactor)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {dec1Fmt.format(t.specificYield)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={
                        t.deviationFromFleetPct >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }
                    >
                      {t.deviationFromFleetPct >= 0 ? "+" : ""}
                      {dec2Fmt.format(t.deviationFromFleetPct)}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
