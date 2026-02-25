"use client";

import { useMemo } from "react";
import { format, parseISO, startOfDay, eachDayOfInterval, subDays } from "date-fns";
import { de } from "date-fns/locale";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// =============================================================================
// Types
// =============================================================================

interface WeatherDataPoint {
  id: string;
  recordedAt: string;
  windSpeedMs: number | null;
  windDirectionDeg: number | null;
  temperatureC: number | null;
  humidityPercent: number | null;
  pressureHpa: number | null;
  weatherCondition: string | null;
}

interface WeatherChartProps {
  data: WeatherDataPoint[];
  period: "7d" | "30d" | "90d";
  dataKey: "windSpeedMs" | "temperatureC" | "humidityPercent" | "pressureHpa";
  label: string;
  color?: string;
  showArea?: boolean;
  height?: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

function aggregateDataByDay(
  data: WeatherDataPoint[],
  dataKey: keyof WeatherDataPoint
): Array<{
  date: Date;
  dateStr: string;
  avg: number;
  min: number;
  max: number;
  count: number;
}> {
  // Group by day
  const byDay = new Map<
    string,
    { values: number[]; date: Date }
  >();

  for (const point of data) {
    const value = point[dataKey];
    if (value === null || value === undefined) continue;

    const date = parseISO(point.recordedAt);
    const dayKey = format(date, "yyyy-MM-dd");

    if (!byDay.has(dayKey)) {
      byDay.set(dayKey, { values: [], date: startOfDay(date) });
    }

    byDay.get(dayKey)!.values.push(Number(value));
  }

  // Calculate aggregates
  const result: Array<{
    date: Date;
    dateStr: string;
    avg: number;
    min: number;
    max: number;
    count: number;
  }> = [];

  for (const [dateStr, { values, date }] of byDay) {
    if (values.length === 0) continue;

    result.push({
      date,
      dateStr,
      avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
      min: Math.round(Math.min(...values) * 10) / 10,
      max: Math.round(Math.max(...values) * 10) / 10,
      count: values.length,
    });
  }

  // Sort by date
  result.sort((a, b) => a.date.getTime() - b.date.getTime());

  return result;
}

// =============================================================================
// Custom Tooltip
// =============================================================================

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: {
      date: Date;
      dateStr: string;
      avg: number;
      min: number;
      max: number;
      count: number;
    };
  }>;
  label?: string;
  dataLabel: string;
  unit: string;
}

function CustomTooltip({ active, payload, dataLabel, unit }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium">
        {format(data.date, "EEEE, dd.MM.yyyy", { locale: de })}
      </p>
      <div className="mt-2 space-y-1 text-sm">
        <p className="text-muted-foreground">
          Durchschnitt: <span className="font-medium text-foreground">{data.avg} {unit}</span>
        </p>
        <p className="text-muted-foreground">
          Maximum: <span className="font-medium text-green-600">{data.max} {unit}</span>
        </p>
        <p className="text-muted-foreground">
          Minimum: <span className="font-medium text-orange-600">{data.min} {unit}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Datenpunkte: {data.count}
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function WeatherChart({
  data,
  period,
  dataKey,
  label,
  color = "hsl(var(--chart-1))",
  showArea = true,
  height = 300,
}: WeatherChartProps) {
  const chartData = useMemo(() => {
    return aggregateDataByDay(data, dataKey);
  }, [data, dataKey]);

  const unit = useMemo(() => {
    switch (dataKey) {
      case "windSpeedMs":
        return "m/s";
      case "temperatureC":
        return "C";
      case "humidityPercent":
        return "%";
      case "pressureHpa":
        return "hPa";
      default:
        return "";
    }
  }, [dataKey]);

  // Calculate domain with some padding
  const domain = useMemo(() => {
    if (chartData.length === 0) return [0, 10];

    const allValues = chartData.flatMap((d) => [d.min, d.max]);
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = (max - min) * 0.1;

    return [Math.max(0, Math.floor(min - padding)), Math.ceil(max + padding)];
  }, [chartData]);

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        Keine Daten verfügbar
      </div>
    );
  }

  const formatXAxis = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (period === "7d") {
      return format(date, "EEE", { locale: de });
    }
    if (period === "30d") {
      return format(date, "dd.MM.", { locale: de });
    }
    return format(date, "dd.MM.", { locale: de });
  };

  const ChartComponent = showArea ? AreaChart : LineChart;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ChartComponent data={chartData}>
        <defs>
          <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          className="stroke-muted"
        />
        <XAxis
          dataKey="dateStr"
          tickFormatter={formatXAxis}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          className="text-muted-foreground"
          interval={period === "90d" ? 6 : period === "30d" ? 2 : 0}
        />
        <YAxis
          domain={domain}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          className="text-muted-foreground"
          tickFormatter={(value) => `${value}`}
        />
        <Tooltip
          content={<CustomTooltip dataLabel={label} unit={unit} />}
        />
        {showArea ? (
          <>
            <Area
              type="monotone"
              dataKey="max"
              stroke={color}
              strokeWidth={1}
              strokeOpacity={0.3}
              fill="none"
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="min"
              stroke={color}
              strokeWidth={1}
              strokeOpacity={0.3}
              fill="none"
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="avg"
              stroke={color}
              strokeWidth={2}
              fill={`url(#gradient-${dataKey})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </>
        ) : (
          <>
            <Line
              type="monotone"
              dataKey="max"
              stroke={color}
              strokeWidth={1}
              strokeOpacity={0.3}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="min"
              stroke={color}
              strokeWidth={1}
              strokeOpacity={0.3}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="avg"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </>
        )}
      </ChartComponent>
    </ResponsiveContainer>
  );
}

// =============================================================================
// Multi-Line Chart for comparing multiple metrics
// =============================================================================

interface MultiWeatherChartProps {
  data: WeatherDataPoint[];
  period: "7d" | "30d" | "90d";
  metrics: Array<{
    dataKey: "windSpeedMs" | "temperatureC" | "humidityPercent";
    label: string;
    color: string;
  }>;
  height?: number;
}

export function MultiWeatherChart({
  data,
  period,
  metrics,
  height = 300,
}: MultiWeatherChartProps) {
  const chartData = useMemo(() => {
    // Get all unique dates
    const dates = new Set<string>();
    data.forEach((point) => {
      dates.add(format(parseISO(point.recordedAt), "yyyy-MM-dd"));
    });

    // Aggregate each metric
    const result: Array<Record<string, number | string | Date>> = [];

    for (const dateStr of Array.from(dates).sort()) {
      const entry: Record<string, number | string | Date> = {
        dateStr,
        date: parseISO(dateStr),
      };

      for (const metric of metrics) {
        const values = data
          .filter((d) => format(parseISO(d.recordedAt), "yyyy-MM-dd") === dateStr)
          .map((d) => d[metric.dataKey])
          .filter((v): v is number => v !== null);

        if (values.length > 0) {
          entry[metric.dataKey] =
            Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
        }
      }

      result.push(entry);
    }

    return result;
  }, [data, metrics]);

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        Keine Daten verfügbar
      </div>
    );
  }

  const formatXAxis = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (period === "7d") {
      return format(date, "EEE", { locale: de });
    }
    return format(date, "dd.MM.", { locale: de });
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData}>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          className="stroke-muted"
        />
        <XAxis
          dataKey="dateStr"
          tickFormatter={formatXAxis}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          className="text-muted-foreground"
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          className="text-muted-foreground"
        />
        <Tooltip />
        {metrics.map((metric) => (
          <Line
            key={metric.dataKey}
            type="monotone"
            dataKey={metric.dataKey}
            name={metric.label}
            stroke={metric.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
