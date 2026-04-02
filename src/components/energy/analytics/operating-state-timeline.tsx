"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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
import { Loader2, Activity, Clock, Layers } from "lucide-react";
import { AnalyticsKpiRow } from "./kpi-row";

// =============================================================================
// Types
// =============================================================================

interface OperatingStateTimelineProps {
  turbineId: string;
  turbineDesignation: string;
}

interface OperatingStateParetoItem {
  stateCode: string;
  totalDurationSeconds: number;
  totalFrequency: number;
  percentage: number;
  cumulative: number;
}

interface OperatingStatePerTurbine {
  turbineId: string;
  designation: string;
  totalFaultDuration: number;
  totalFaultCount: number;
  productionLossEstimateKwh: number;
}

interface OperatingStateTimelineEntry {
  date: string;
  dominantState: string;
  durationSeconds: number;
}

interface OperatingStatesResponse {
  statePareto: OperatingStateParetoItem[];
  perTurbine: OperatingStatePerTurbine[];
  timeline: OperatingStateTimelineEntry[];
  meta: { year: number; parkId: string; turbineId: string };
}

// =============================================================================
// State color mapping
// =============================================================================

const STATE_COLORS: Record<string, string> = {
  A0: "#22c55e", // Production (green)
  A1: "#60a5fa", // Standby (blue)
  A2: "#f59e0b", // Manual stop (amber)
  A3: "#ef4444", // Error (red)
  A5: "#a855f7", // Maintenance (purple)
};

const getStateColor = (code: string) => STATE_COLORS[code] || "#6b7280";

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

function formatHours(seconds: number): string {
  return dec1Fmt.format(seconds / 3600);
}

function formatDateLabel(dateStr: string): string {
  // dateStr is ISO "YYYY-MM-DD" → format as dd.MM
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}`;
  return dateStr;
}

// =============================================================================
// Custom Tooltips
// =============================================================================

interface TPayload {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

function ParetoTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const bar = payload.find((p) => p.dataKey === "durationHours");
  const line = payload.find((p) => p.dataKey === "cumulative");
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {bar && <p className="text-sm">Dauer: {dec1Fmt.format(bar.value)} h</p>}
      {line && (
        <p className="text-sm text-muted-foreground">
          Kumulativ: {dec2Fmt.format(line.value)} %
        </p>
      )}
    </div>
  );
}

function TimelineTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const bar = payload.find((p) => p.dataKey === "durationHours");
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {bar && <p className="text-sm">Dauer: {dec1Fmt.format(bar.value)} h</p>}
    </div>
  );
}

// =============================================================================
// Fetcher
// =============================================================================

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// =============================================================================
// Year selector range
// =============================================================================

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from(
  { length: CURRENT_YEAR - 2020 + 1 },
  (_, i) => 2020 + i
).reverse();

// =============================================================================
// Component
// =============================================================================

export function OperatingStateTimeline({
  turbineId,
  turbineDesignation,
}: OperatingStateTimelineProps) {
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);

  const url = `/api/energy/analytics/operating-states?turbineId=${turbineId}&year=${selectedYear}`;
  const { data, isLoading } = useQuery<OperatingStatesResponse>({
    queryKey: [url],
    queryFn: () => fetcher(url),
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const statePareto = data?.statePareto ?? [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const timeline = data?.timeline ?? [];

  // ---------------------------------------------------------------------------
  // KPI values
  // ---------------------------------------------------------------------------

  const kpis = useMemo(() => {
    const topState = statePareto[0];
    const totalSeconds = statePareto.reduce(
      (s, item) => s + item.totalDurationSeconds,
      0
    );
    return [
      {
        title: "Top Zustand",
        value: topState
          ? `${topState.stateCode} (${dec1Fmt.format(topState.percentage)} %)`
          : "-",
        icon: Activity,
        description: "Haeufigster Betriebszustand",
      },
      {
        title: "Gesamte Zustandszeit",
        value: `${numFmt.format(Math.round(totalSeconds / 3600))} h`,
        icon: Clock,
        description: "Summe aller erfassten Zustaende",
      },
      {
        title: "Verschiedene Zustaende",
        value: numFmt.format(statePareto.length),
        icon: Layers,
        description: "Anzahl unterschiedlicher Codes",
      },
    ];
  }, [statePareto]);

  // ---------------------------------------------------------------------------
  // Pareto chart data (top 10)
  // ---------------------------------------------------------------------------

  const paretoChartData = useMemo(
    () =>
      statePareto.slice(0, 10).map((item) => ({
        stateCode: item.stateCode,
        durationHours: item.totalDurationSeconds / 3600,
        cumulative: item.cumulative,
      })),
    [statePareto]
  );

  // ---------------------------------------------------------------------------
  // Top 10 table data
  // ---------------------------------------------------------------------------

  const top10Table = useMemo(() => statePareto.slice(0, 10), [statePareto]);

  // ---------------------------------------------------------------------------
  // Timeline chart data
  // ---------------------------------------------------------------------------

  const timelineChartData = useMemo(
    () =>
      timeline.map((entry) => ({
        date: formatDateLabel(entry.date),
        rawDate: entry.date,
        durationHours: entry.durationSeconds / 3600,
        dominantState: entry.dominantState,
        fill: getStateColor(entry.dominantState),
      })),
    [timeline]
  );

  // Unique states appearing in timeline (for legend)
  const timelineStates = useMemo(() => {
    const unique = new Set(timeline.map((e) => e.dominantState));
    return Array.from(unique).sort();
  }, [timeline]);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  if (statePareto.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
          <Activity className="h-8 w-8 mb-2" />
          <p>
            Keine Betriebszustands-Daten fuer {turbineDesignation} im Jahr{" "}
            {selectedYear} vorhanden.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Year selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Betriebszustaende &ndash; {turbineDesignation}
        </h3>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="rounded-md border bg-background px-3 py-1.5 text-sm"
        >
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* KPI Row */}
      <AnalyticsKpiRow kpis={kpis} />

      {/* Row 1: Pareto Chart + Table */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pareto Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Zustands-Pareto (Top 10)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paretoChartData.length > 0 ? (
                <ComposedChart
                  width="100%"
                  height={350}
                  data={paretoChartData}
                  margin={{ left: 0, right: 20, bottom: 40 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="stateCode"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                    height={60}
                  />
                  <YAxis
                    yAxisId="hours"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${numFmt.format(v)} h`}
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
                    yAxisId="hours"
                    dataKey="durationHours"
                    name="Dauer (h)"
                    radius={[4, 4, 0, 0]}
                  >
                    {paretoChartData.map((entry, index) => (
                      <Cell
                        key={`pareto-${index}`}
                        fill={getStateColor(entry.stateCode)}
                      />
                    ))}
                  </Bar>
                  <Line
                    yAxisId="cum"
                    type="monotone"
                    dataKey="cumulative"
                    name="Kumulativ (%)"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "hsl(var(--chart-1))" }}
                  />
                </ComposedChart>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Keine Zustandsdaten
              </p>
            )}
          </CardContent>
        </Card>

        {/* Top 10 Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Top-10 Zustaende (Tabelle)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {top10Table.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zustand</TableHead>
                    <TableHead className="text-right">Haeufigkeit</TableHead>
                    <TableHead className="text-right">Dauer (h)</TableHead>
                    <TableHead className="text-right">Anteil (%)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top10Table.map((item) => (
                    <TableRow key={item.stateCode}>
                      <TableCell>
                        <Badge
                          variant="outline"
                          style={{
                            borderColor: getStateColor(item.stateCode),
                            color: getStateColor(item.stateCode),
                          }}
                        >
                          {item.stateCode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {numFmt.format(item.totalFrequency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatHours(item.totalDurationSeconds)}
                      </TableCell>
                      <TableCell className="text-right">
                        {dec1Fmt.format(item.percentage)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Keine Zustandsdaten
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Daily Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Tagesverlauf (dominanter Zustand pro Tag)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timelineChartData.length > 0 ? (
            <>
              {/* Legend for state colors */}
              <div className="flex flex-wrap gap-3 mb-4">
                {timelineStates.map((code) => (
                  <div key={code} className="flex items-center gap-1.5 text-xs">
                    <span
                      className="inline-block w-3 h-3 rounded-sm"
                      style={{ backgroundColor: getStateColor(code) }}
                    />
                    <span>{code}</span>
                  </div>
                ))}
              </div>
                <BarChart
                  width="100%"
                  height={300}
                  data={timelineChartData}
                  margin={{ left: 0, right: 10, bottom: 40 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    angle={-45}
                    textAnchor="end"
                    interval="preserveStartEnd"
                    height={60}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${dec1Fmt.format(v)} h`}
                  />
                  <Tooltip content={<TimelineTooltip />} />
                  <Bar dataKey="durationHours" name="Dauer" radius={[2, 2, 0, 0]}>
                    {timelineChartData.map((entry, index) => (
                      <Cell key={`timeline-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Keine Tagesverlaufs-Daten vorhanden
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
