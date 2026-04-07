"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  LineChart,
  AreaChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { BarChart3, LineChart as LineChartIcon, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

type ChartType = "bar" | "line" | "area";

interface DataKeyConfig {
  key: string;
  label: string;
  color: string;
  yAxisId?: string;
}

interface SwitchableChartProps {
  /** Unique ID for persisting chart type in localStorage */
  chartId: string;
  /** Chart data array */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>[];
  /** Data series to render */
  dataKeys: DataKeyConfig[];
  /** Key for x-axis values */
  xAxisKey: string;
  /** X-axis label */
  xAxisLabel?: string;
  /** Y-axis label */
  yAxisLabel?: string;
  /** Default chart type */
  defaultType?: ChartType;
  /** Allowed chart types (subset of bar/line/area) */
  allowedTypes?: ChartType[];
  /** Chart height in px */
  height?: number;
  /** Stack bars/areas */
  stacked?: boolean;
  /** Show legend */
  showLegend?: boolean;
  /** Custom tooltip value formatter */
  tooltipFormatter?: (value: number, name: string) => [string, string];
  /** Additional className for wrapper */
  className?: string;
}

// =============================================================================
// Helpers
// =============================================================================

const STORAGE_PREFIX = "wpm:chart-type:";

function getStoredType(chartId: string, defaultType: ChartType): ChartType {
  if (typeof window === "undefined") return defaultType;
  const stored = localStorage.getItem(`${STORAGE_PREFIX}${chartId}`);
  if (stored === "bar" || stored === "line" || stored === "area") return stored;
  return defaultType;
}

const TYPE_ICONS: Record<ChartType, typeof BarChart3> = {
  bar: BarChart3,
  line: LineChartIcon,
  area: Activity,
};

const TYPE_LABELS: Record<ChartType, string> = {
  bar: "Balken",
  line: "Linie",
  area: "Fläche",
};

// =============================================================================
// Custom Tooltip
// =============================================================================

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  formatter?: (value: number, name: string) => [string, string];
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border bg-popover/95 backdrop-blur-sm p-3 shadow-lg text-sm">
      <p className="font-medium text-foreground mb-1.5">{label}</p>
      {payload.map((entry) => {
        const [formattedValue, formattedName] = formatter
          ? formatter(entry.value, entry.name)
          : [String(entry.value), entry.name];
        return (
          <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{formattedName}:</span>
            <span className="font-medium tabular-nums ml-auto">{formattedValue}</span>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function SwitchableChart({
  chartId,
  data,
  dataKeys,
  xAxisKey,
  xAxisLabel,
  yAxisLabel,
  defaultType = "bar",
  allowedTypes = ["bar", "line", "area"],
  height = 300,
  stacked = false,
  showLegend = true,
  tooltipFormatter,
  className,
}: SwitchableChartProps) {
  const [chartType, setChartType] = useState<ChartType>(() =>
    getStoredType(chartId, defaultType)
  );

  const handleTypeChange = (type: ChartType) => {
    setChartType(type);
    localStorage.setItem(`${STORAGE_PREFIX}${chartId}`, type);
  };

  // Common chart props
  const commonProps = {
    data,
    margin: { top: 8, right: 8, left: 0, bottom: 0 },
  };

  const axisProps = {
    xAxis: {
      dataKey: xAxisKey,
      tick: { fontSize: 12 },
      tickLine: false,
      axisLine: false,
      label: xAxisLabel ? { value: xAxisLabel, position: "insideBottom", offset: -5, fontSize: 11 } : undefined,
    },
    yAxis: {
      tick: { fontSize: 12 },
      tickLine: false,
      axisLine: false,
      width: 50,
      label: yAxisLabel ? { value: yAxisLabel, angle: -90, position: "insideLeft", fontSize: 11 } : undefined,
    },
    grid: {
      strokeDasharray: "3 3",
      stroke: "hsl(var(--border))",
      strokeOpacity: 0.5,
    },
  };

  // Gradient definitions for area charts
  const gradients = useMemo(
    () =>
      dataKeys.map((dk, i) => (
        <linearGradient
          key={dk.key}
          id={`gradient-${chartId}-${i}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={dk.color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={dk.color} stopOpacity={0.03} />
        </linearGradient>
      )),
    [dataKeys, chartId]
  );

  // Render the actual chart based on type
  const renderChart = () => {
    const tooltip = (
      <Tooltip
        content={
          <ChartTooltip formatter={tooltipFormatter} />
        }
      />
    );
    const legend = showLegend ? <Legend iconType="circle" iconSize={8} /> : null;
    const grid = <CartesianGrid {...axisProps.grid} />;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const xAxis = <XAxis {...(axisProps.xAxis as any)} />;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const yAxis = <YAxis {...(axisProps.yAxis as any)} />;

    switch (chartType) {
      case "bar":
        return (
          <BarChart {...commonProps}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {legend}
            {dataKeys.map((dk) => (
              <Bar
                key={dk.key}
                dataKey={dk.key}
                name={dk.label}
                fill={dk.color}
                radius={[4, 4, 0, 0]}
                stackId={stacked ? "stack" : undefined}
                yAxisId={dk.yAxisId}
              />
            ))}
          </BarChart>
        );

      case "line":
        return (
          <LineChart {...commonProps}>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {legend}
            {dataKeys.map((dk) => (
              <Line
                key={dk.key}
                dataKey={dk.key}
                name={dk.label}
                stroke={dk.color}
                strokeWidth={2}
                type="monotone"
                dot={false}
                activeDot={{ r: 4, fill: dk.color }}
                yAxisId={dk.yAxisId}
              />
            ))}
          </LineChart>
        );

      case "area":
        return (
          <AreaChart {...commonProps}>
            <defs>{gradients}</defs>
            {grid}
            {xAxis}
            {yAxis}
            {tooltip}
            {legend}
            {dataKeys.map((dk, i) => (
              <Area
                key={dk.key}
                dataKey={dk.key}
                name={dk.label}
                stroke={dk.color}
                strokeWidth={2}
                type="monotone"
                fill={`url(#gradient-${chartId}-${i})`}
                fillOpacity={1}
                stackId={stacked ? "stack" : undefined}
                yAxisId={dk.yAxisId}
              />
            ))}
          </AreaChart>
        );
    }
  };

  return (
    <div className={cn("relative", className)}>
      {/* Chart type toggle */}
      {allowedTypes.length > 1 && (
        <div className="absolute top-0 right-0 z-10 flex items-center gap-0.5 rounded-lg border bg-background/80 backdrop-blur-sm p-0.5">
          {allowedTypes.map((type) => {
            const Icon = TYPE_ICONS[type];
            return (
              <button
                key={type}
                onClick={() => handleTypeChange(type)}
                title={TYPE_LABELS[type]}
                className={cn(
                  "rounded-md p-1.5 transition-colors",
                  chartType === type
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}
