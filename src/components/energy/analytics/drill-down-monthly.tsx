"use client";

import { useMemo } from "react";
import useSWR from "swr";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalyticsKpiRow } from "./kpi-row";
import { Zap, Wind, Clock, Gauge } from "lucide-react";

// =============================================================================
// Monthly Drill-Down View
// Shows daily production bars for a given month + turbine (optional)
// =============================================================================

interface DrillDownMonthlyProps {
  year: number;
  month: number;
  parkId?: string;
  turbineId?: string;
  onDayClick?: (day: number) => void;
}

interface DailyDataPoint {
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
  data: DailyDataPoint[];
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
function formatMwh(kwh: number): string {
  return dec1Fmt.format(kwh / 1000) + " MWh";
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Fehler beim Laden");
  return res.json();
};

interface ChartDay {
  day: number;
  label: string;
  productionKwh: number;
  avgWindSpeed: number;
  avgPowerKw: number;
  dataPoints: number;
}

interface DayTooltipPayload {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

function DayTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: DayTooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0];
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      <p className="text-sm">
        Produktion: <strong>{formatMwh(data.value)}</strong>
      </p>
    </div>
  );
}

export function DrillDownMonthly({
  year,
  month,
  parkId,
  turbineId,
  onDayClick,
}: DrillDownMonthlyProps) {
  // Build API URL
  const monthStr = String(month).padStart(2, "0");
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonthStr = String(nextMonth).padStart(2, "0");

  const params = new URLSearchParams({
    interval: "day",
    from: `${year}-${monthStr}-01`,
    to: `${nextYear}-${nextMonthStr}-01`,
    limit: "500",
  });
  if (parkId && parkId !== "all") params.set("parkId", parkId);
  if (turbineId) params.set("turbineId", turbineId);

  const { data: response, isLoading } = useSWR<ProductionsResponse>(
    `/api/energy/scada/productions?${params.toString()}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  // Aggregate by day (may have multiple turbines)
  const chartData = useMemo<ChartDay[]>(() => {
    if (!response?.data?.length) return [];

    const dayMap = new Map<
      number,
      { kwh: number; wind: number; power: number; points: number; windCount: number }
    >();

    for (const row of response.data) {
      const date = new Date(row.periodStart);
      const day = date.getDate();
      const existing = dayMap.get(day) ?? {
        kwh: 0,
        wind: 0,
        power: 0,
        points: 0,
        windCount: 0,
      };
      existing.kwh += row.productionKwh;
      if (row.avgWindSpeed > 0) {
        existing.wind += row.avgWindSpeed;
        existing.windCount += 1;
      }
      existing.power += row.avgPowerKw;
      existing.points += row.dataPoints;
      dayMap.set(day, existing);
    }

    // Get days in month
    const daysInMonth = new Date(year, month, 0).getDate();
    const result: ChartDay[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dayData = dayMap.get(d);
      result.push({
        day: d,
        label: `${d}.`,
        productionKwh: dayData?.kwh ?? 0,
        avgWindSpeed: dayData && dayData.windCount > 0
          ? dayData.wind / dayData.windCount
          : 0,
        avgPowerKw: dayData?.power ?? 0,
        dataPoints: dayData?.points ?? 0,
      });
    }
    return result;
  }, [response, year, month]);

  // KPI calculations
  const kpis = useMemo(() => {
    const agg = response?.aggregations;
    const totalKwh = agg?.totalProductionKwh ?? 0;
    const avgWind = agg?.avgWindSpeed ?? 0;
    const avgPower = agg?.avgPowerKw ?? 0;
    const points = agg?.totalDataPoints ?? 0;
    const daysWithData = chartData.filter((d) => d.dataPoints > 0).length;

    return [
      {
        title: "Monatsproduktion",
        value: formatMwh(totalKwh),
        icon: Zap,
        description: `${daysWithData} Tage mit Daten`,
      },
      {
        title: "Mittlere Leistung",
        value: `${dec1Fmt.format(avgPower)} kW`,
        icon: Gauge,
        description: "Durchschnitt im Monat",
      },
      {
        title: "Mittlerer Wind",
        value: `${dec1Fmt.format(avgWind)} m/s`,
        icon: Wind,
        description: "Durchschnittliche Windgeschwindigkeit",
      },
      {
        title: "Datenpunkte",
        value: numFmt.format(points),
        icon: Clock,
        description: "10-Min Intervalle",
      },
    ];
  }, [response, chartData]);

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

  if (chartData.length === 0 || chartData.every((d) => d.dataPoints === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <Zap className="h-8 w-8 mb-2" />
        <p>Keine SCADA-Daten fuer diesen Monat verfuegbar</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <AnalyticsKpiRow kpis={kpis} />

      {/* Daily Production Bar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Tagesproduktion (kWh)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={chartData}
              margin={{ left: 10, right: 10, top: 5, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="stroke-muted"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${numFmt.format(v / 1000)}`}
                label={{
                  value: "MWh",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 11 },
                }}
              />
              <Tooltip content={<DayTooltip />} />
              <Bar
                dataKey="productionKwh"
                name="Produktion"
                radius={[3, 3, 0, 0]}
                onClick={(data) => {
                  if (onDayClick && data?.dataPoints > 0) {
                    onDayClick(data.day);
                  }
                }}
                style={{ cursor: onDayClick ? "pointer" : "default" }}
              >
                {chartData.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={entry.dataPoints > 0 ? "#22c55e" : "hsl(var(--muted))"}
                    className={onDayClick && entry.dataPoints > 0 ? "cursor-pointer" : ""}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {onDayClick && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Klicken Sie auf einen Tag fuer die Tagesdetails
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
