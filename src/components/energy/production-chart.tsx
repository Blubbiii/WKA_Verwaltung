"use client";

import { useMemo } from "react";
import {
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
} from "recharts";

// =============================================================================
// Types
// =============================================================================

interface ScadaProduction {
  turbineId: string;
  turbineDesignation: string;
  parkName: string;
  periodStart: string;
  productionKwh: number;
  avgPowerKw: number;
  avgWindSpeed: number | null;
  dataPoints: number;
}

export type ChartType = "bar" | "line" | "area";

interface ProductionChartProps {
  data: ScadaProduction[];
  hasParkFilter: boolean;
  interval?: string;
  chartType?: ChartType;
}

// =============================================================================
// Constants
// =============================================================================

const MONTH_NAMES: Record<number, string> = {
  0: "Jan",
  1: "Feb",
  2: "Mär",
  3: "Apr",
  4: "Mai",
  5: "Jun",
  6: "Jul",
  7: "Aug",
  8: "Sep",
  9: "Okt",
  10: "Nov",
  11: "Dez",
};

const TURBINE_COLORS = [
  "hsl(var(--chart-1))",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

const numberFormatter = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// =============================================================================
// Helpers
// =============================================================================

function formatPeriodLabel(periodStart: string, interval: string): string {
  const date = new Date(periodStart);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");

  switch (interval) {
    case "10min":
      return `${dd}.${mm} ${hh}:${min}`;
    case "hour":
      return `${dd}.${mm} ${hh}h`;
    case "day":
      return `${dd}.${mm}`;
    case "month":
      return `${MONTH_NAMES[date.getMonth()] ?? mm} ${date.getFullYear()}`;
    case "year":
      return `${date.getFullYear()}`;
    default:
      return `${dd}.${mm}.${date.getFullYear()}`;
  }
}

/** Create a sortable key from periodStart for ordering */
function periodSortKey(periodStart: string): string {
  return new Date(periodStart).toISOString();
}

// =============================================================================
// Custom Tooltip
// =============================================================================

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

function ProductionTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-2">{label}</p>
      <div className="space-y-1 text-sm">
        {payload.map((entry, index) => (
          <p key={index} className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-medium">
              {entry.dataKey === "avgWindSpeed"
                ? `${decimalFormatter.format(entry.value)} m/s`
                : `${numberFormatter.format(entry.value)} kWh`}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function ProductionChart({
  data,
  hasParkFilter,
  interval = "month",
  chartType = "bar",
}: ProductionChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    if (hasParkFilter) {
      // Group by period with one key per turbine
      const periodMap = new Map<
        string,
        { sortKey: string; entry: Record<string, string | number> }
      >();

      for (const row of data) {
        const sortKey = periodSortKey(row.periodStart);
        const label = formatPeriodLabel(row.periodStart, interval);

        if (!periodMap.has(sortKey)) {
          periodMap.set(sortKey, {
            sortKey,
            entry: { period: label, avgWindSpeed: 0, _windCount: 0 },
          });
        }

        const { entry } = periodMap.get(sortKey)!;
        entry[row.turbineDesignation] = Number(row.productionKwh);

        if (row.avgWindSpeed !== null) {
          entry.avgWindSpeed =
            (entry.avgWindSpeed as number) + Number(row.avgWindSpeed);
          entry._windCount = (entry._windCount as number) + 1;
        }
      }

      return Array.from(periodMap.values())
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .map(({ entry }) => {
          const windCount = entry._windCount as number;
          if (windCount > 0) {
            entry.avgWindSpeed = (entry.avgWindSpeed as number) / windCount;
          }
          const { _windCount, ...rest } = entry;
          return rest;
        });
    } else {
      // Aggregate all turbines per period
      const periodMap = new Map<
        string,
        {
          sortKey: string;
          period: string;
          produktionKwh: number;
          avgWindSpeed: number;
          windCount: number;
        }
      >();

      for (const row of data) {
        const sortKey = periodSortKey(row.periodStart);
        const label = formatPeriodLabel(row.periodStart, interval);

        if (!periodMap.has(sortKey)) {
          periodMap.set(sortKey, {
            sortKey,
            period: label,
            produktionKwh: 0,
            avgWindSpeed: 0,
            windCount: 0,
          });
        }

        const entry = periodMap.get(sortKey)!;
        entry.produktionKwh += Number(row.productionKwh);

        if (row.avgWindSpeed !== null) {
          entry.avgWindSpeed += Number(row.avgWindSpeed);
          entry.windCount += 1;
        }
      }

      return Array.from(periodMap.values())
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .map(({ sortKey, windCount, ...rest }) => ({
          ...rest,
          avgWindSpeed: windCount > 0 ? rest.avgWindSpeed / windCount : 0,
        }));
    }
  }, [data, hasParkFilter, interval]);

  // Unique turbine names for grouped chart
  const turbineNames = useMemo(() => {
    if (!hasParkFilter) return [];
    const names = new Set<string>();
    for (const row of data) {
      names.add(row.turbineDesignation);
    }
    return Array.from(names).sort();
  }, [data, hasParkFilter]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        Keine Produktionsdaten vorhanden
      </div>
    );
  }

  // Render data series based on chartType
  const renderSeries = () => {
    if (hasParkFilter) {
      return turbineNames.map((name, index) => {
        const color = TURBINE_COLORS[index % TURBINE_COLORS.length];
        switch (chartType) {
          case "line":
            return (
              <Line
                key={name}
                yAxisId="kwh"
                type="monotone"
                dataKey={name}
                name={name}
                stroke={color}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            );
          case "area":
            return (
              <Area
                key={name}
                yAxisId="kwh"
                type="monotone"
                dataKey={name}
                name={name}
                stroke={color}
                fill={color}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            );
          default:
            return (
              <Bar
                key={name}
                yAxisId="kwh"
                dataKey={name}
                name={name}
                fill={color}
                radius={[2, 2, 0, 0]}
              />
            );
        }
      });
    }

    switch (chartType) {
      case "line":
        return (
          <Line
            yAxisId="kwh"
            type="monotone"
            dataKey="produktionKwh"
            name="Produktion (kWh)"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        );
      case "area":
        return (
          <>
            <defs>
              <linearGradient id="prodGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              yAxisId="kwh"
              type="monotone"
              dataKey="produktionKwh"
              name="Produktion (kWh)"
              stroke="hsl(var(--chart-1))"
              fill="url(#prodGradient)"
              strokeWidth={2}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </>
        );
      default:
        return (
          <Bar
            yAxisId="kwh"
            dataKey="produktionKwh"
            name="Produktion (kWh)"
            fill="hsl(var(--chart-1))"
            radius={[4, 4, 0, 0]}
          />
        );
    }
  };

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={chartData}>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          className="stroke-muted"
        />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          className="text-muted-foreground"
          interval="preserveStartEnd"
          angle={chartData.length > 20 ? -45 : 0}
          textAnchor={chartData.length > 20 ? "end" : "middle"}
          height={chartData.length > 20 ? 60 : 30}
        />
        <YAxis
          yAxisId="kwh"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          className="text-muted-foreground"
          tickFormatter={(value) => numberFormatter.format(value)}
          label={{
            value: "Produktion (kWh)",
            angle: -90,
            position: "insideLeft",
            style: { fontSize: 12, fill: "hsl(var(--muted-foreground))" },
          }}
        />
        <YAxis
          yAxisId="wind"
          orientation="right"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          className="text-muted-foreground"
          label={{
            value: "Wind (m/s)",
            angle: 90,
            position: "insideRight",
            style: { fontSize: 12, fill: "hsl(var(--muted-foreground))" },
          }}
        />
        <Tooltip content={<ProductionTooltip />} />
        <Legend />
        {renderSeries()}
        <Line
          yAxisId="wind"
          type="monotone"
          dataKey="avgWindSpeed"
          name="Windgeschwindigkeit (m/s)"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={chartData.length <= 50 ? { r: 2 } : false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
