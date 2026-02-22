"use client";

import { useMemo } from "react";
import useSWR from "swr";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Area,
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
import { Skeleton } from "@/components/ui/skeleton";
import { AnalyticsKpiRow } from "./kpi-row";
import { Zap, Wind, Clock, Gauge } from "lucide-react";

// =============================================================================
// Daily Drill-Down View
// Shows 10-min interval data for a given day
// =============================================================================

interface DrillDownDailyProps {
  year: number;
  month: number;
  day: number;
  parkId?: string;
  turbineId?: string;
}

interface MeasurementPoint {
  turbineId: string;
  turbineDesignation: string;
  parkName: string;
  periodStart: string;
  productionKwh: number;
  avgPowerKw: number;
  avgWindSpeed: number;
  dataPoints: number;
}

interface ProductionsResponse {
  data: MeasurementPoint[];
  aggregations: {
    totalProductionKwh: number;
    avgPowerKw: number;
    avgWindSpeed: number;
    totalDataPoints: number;
  };
}

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

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Fehler beim Laden");
  return res.json();
};

interface ChartPoint {
  time: string;
  powerKw: number;
  windSpeed: number;
  productionKwh: number;
}

interface DetailTooltipPayload {
  name: string;
  value: number;
  color: string;
  dataKey: string;
  unit?: string;
}

function DetailTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: DetailTooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">
            {entry.dataKey === "powerKw"
              ? `${dec1Fmt.format(entry.value)} kW`
              : entry.dataKey === "windSpeed"
                ? `${dec1Fmt.format(entry.value)} m/s`
                : `${dec2Fmt.format(entry.value)} kWh`}
          </span>
        </p>
      ))}
    </div>
  );
}

export function DrillDownDaily({
  year,
  month,
  day,
  parkId,
  turbineId,
}: DrillDownDailyProps) {
  // Build API URL for 10-min intervals
  const monthStr = String(month).padStart(2, "0");
  const dayStr = String(day).padStart(2, "0");
  const nextDay = new Date(year, month - 1, day + 1);
  const nextDStr = String(nextDay.getDate()).padStart(2, "0");
  const nextMStr = String(nextDay.getMonth() + 1).padStart(2, "0");
  const nextYStr = nextDay.getFullYear();

  const params = new URLSearchParams({
    interval: "10min",
    from: `${year}-${monthStr}-${dayStr}`,
    to: `${nextYStr}-${nextMStr}-${nextDStr}`,
    limit: "500",
  });
  if (parkId && parkId !== "all") params.set("parkId", parkId);
  if (turbineId) params.set("turbineId", turbineId);

  const { data: response, isLoading } = useSWR<ProductionsResponse>(
    `/api/energy/scada/productions?${params.toString()}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  // Transform data for chart (aggregate across turbines if no turbineId selected)
  const chartData = useMemo<ChartPoint[]>(() => {
    if (!response?.data?.length) return [];

    // Group by timestamp
    const timeMap = new Map<
      string,
      { power: number; wind: number; kwh: number; count: number; windCount: number }
    >();

    for (const row of response.data) {
      const date = new Date(row.periodStart);
      const timeKey = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      const existing = timeMap.get(timeKey) ?? {
        power: 0,
        wind: 0,
        kwh: 0,
        count: 0,
        windCount: 0,
      };
      existing.power += row.avgPowerKw;
      if (row.avgWindSpeed > 0) {
        existing.wind += row.avgWindSpeed;
        existing.windCount += 1;
      }
      existing.kwh += row.productionKwh;
      existing.count += 1;
      timeMap.set(timeKey, existing);
    }

    // Sort by time and build chart array
    return Array.from(timeMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, data]) => ({
        time,
        powerKw: data.count > 0 ? Math.round(data.power * 10) / 10 : 0,
        windSpeed:
          data.windCount > 0
            ? Math.round((data.wind / data.windCount) * 100) / 100
            : 0,
        productionKwh: Math.round(data.kwh * 1000) / 1000,
      }));
  }, [response]);

  // Table data (raw points, limited)
  const tableData = useMemo(() => {
    if (!response?.data?.length) return [];
    return response.data.slice(0, 144).map((row) => {
      const date = new Date(row.periodStart);
      return {
        ...row,
        time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
      };
    });
  }, [response]);

  // KPI calculations
  const kpis = useMemo(() => {
    const agg = response?.aggregations;
    const totalKwh = agg?.totalProductionKwh ?? 0;
    const avgWind = agg?.avgWindSpeed ?? 0;
    const avgPower = agg?.avgPowerKw ?? 0;
    const points = agg?.totalDataPoints ?? 0;

    // Peak power from chart data
    const peakPower = chartData.reduce(
      (max, p) => Math.max(max, p.powerKw),
      0,
    );

    return [
      {
        title: "Tagesproduktion",
        value: totalKwh >= 1000 ? formatMwh(totalKwh) : `${dec1Fmt.format(totalKwh)} kWh`,
        icon: Zap,
        description: `${dayStr}.${monthStr}.${year}`,
      },
      {
        title: "Mittlere Leistung",
        value: `${dec1Fmt.format(avgPower)} kW`,
        icon: Gauge,
        description: `Spitze: ${dec1Fmt.format(peakPower)} kW`,
      },
      {
        title: "Mittlerer Wind",
        value: `${dec1Fmt.format(avgWind)} m/s`,
        icon: Wind,
        description: "Tagesdurchschnitt",
      },
      {
        title: "Messpunkte",
        value: numFmt.format(points),
        icon: Clock,
        description: "10-Min Intervalle",
      },
    ];
  }, [response, chartData, dayStr, monthStr, year]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-[350px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <Zap className="h-8 w-8 mb-2" />
        <p>Keine 10-Min-Daten fuer diesen Tag verfuegbar</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <AnalyticsKpiRow kpis={kpis} />

      {/* Power + Wind Speed Time Series */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Leistung & Windgeschwindigkeit (10-Min-Intervalle)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart
              data={chartData}
              margin={{ left: 10, right: 10, top: 5, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="stroke-muted"
              />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={30}
              />
              <YAxis
                yAxisId="power"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${numFmt.format(v)} kW`}
              />
              <YAxis
                yAxisId="wind"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${dec1Fmt.format(v)} m/s`}
              />
              <Tooltip content={<DetailTooltip />} />
              <Legend />
              <Area
                yAxisId="power"
                type="monotone"
                dataKey="powerKw"
                name="Leistung (kW)"
                fill="#22c55e"
                fillOpacity={0.15}
                stroke="#22c55e"
                strokeWidth={2}
              />
              <Line
                yAxisId="wind"
                type="monotone"
                dataKey="windSpeed"
                name="Wind (m/s)"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Data Table */}
      {tableData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Messdaten-Tabelle
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zeit</TableHead>
                  {!turbineId && <TableHead>Anlage</TableHead>}
                  <TableHead className="text-right">Leistung (kW)</TableHead>
                  <TableHead className="text-right">Wind (m/s)</TableHead>
                  <TableHead className="text-right">Produktion (kWh)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableData.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-sm">
                      {row.time}
                    </TableCell>
                    {!turbineId && (
                      <TableCell className="text-sm">
                        {row.turbineDesignation}
                      </TableCell>
                    )}
                    <TableCell className="text-right font-mono text-sm">
                      {dec1Fmt.format(row.avgPowerKw)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {dec1Fmt.format(row.avgWindSpeed)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {dec2Fmt.format(row.productionKwh)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {response && response.data.length > 144 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Zeige 144 von {response.data.length} Messpunkten
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
