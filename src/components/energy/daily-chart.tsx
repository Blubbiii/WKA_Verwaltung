"use client";

import { useMemo } from "react";
import {
  Area,
  Bar,
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

export type DailyChartType = "area" | "line" | "bar";

interface DailyChartProps {
  data: ScadaProduction[];
  chartType?: DailyChartType;
}

// =============================================================================
// Formatters
// =============================================================================

const numberFormatter = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

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

function DailyTooltip({ active, payload, label }: CustomTooltipProps) {
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
                : `${numberFormatter.format(entry.value)} kW`}
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

export function DailyChart({ data, chartType = "area" }: DailyChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Aggregate by time slot (multiple turbines combined)
    const timeMap = new Map<
      string,
      { time: string; avgPowerKw: number; avgWindSpeed: number; count: number; windCount: number }
    >();

    for (const row of data) {
      const date = new Date(row.periodStart);
      const timeKey = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

      if (!timeMap.has(timeKey)) {
        timeMap.set(timeKey, {
          time: timeKey,
          avgPowerKw: 0,
          avgWindSpeed: 0,
          count: 0,
          windCount: 0,
        });
      }

      const entry = timeMap.get(timeKey)!;
      entry.avgPowerKw += Number(row.avgPowerKw);
      entry.count += 1;

      if (row.avgWindSpeed !== null) {
        entry.avgWindSpeed += Number(row.avgWindSpeed);
        entry.windCount += 1;
      }
    }

    return Array.from(timeMap.values())
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((entry) => ({
        time: entry.time,
        avgPowerKw: entry.count > 0 ? entry.avgPowerKw / entry.count : 0,
        avgWindSpeed: entry.windCount > 0 ? entry.avgWindSpeed / entry.windCount : 0,
      }));
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-muted-foreground">
        Keine Tagesverlaufsdaten vorhanden
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={chartData}>
        <defs>
          <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          className="text-muted-foreground"
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="power"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          className="text-muted-foreground"
          tickFormatter={(value) => numberFormatter.format(value)}
          label={{
            value: "Leistung (kW)",
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
        <Tooltip content={<DailyTooltip />} />
        <Legend />
        {chartType === "bar" ? (
          <Bar
            yAxisId="power"
            dataKey="avgPowerKw"
            name="Leistung (kW)"
            fill="#3b82f6"
            radius={[2, 2, 0, 0]}
          />
        ) : chartType === "line" ? (
          <Line
            yAxisId="power"
            type="monotone"
            dataKey="avgPowerKw"
            name="Leistung (kW)"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        ) : (
          <Area
            yAxisId="power"
            type="monotone"
            dataKey="avgPowerKw"
            name="Leistung (kW)"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#powerGradient)"
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        )}
        <Line
          yAxisId="wind"
          type="monotone"
          dataKey="avgWindSpeed"
          name="Windgeschwindigkeit (m/s)"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
