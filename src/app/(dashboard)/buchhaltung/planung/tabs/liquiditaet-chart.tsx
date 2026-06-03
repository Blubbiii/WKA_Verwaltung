"use client";

/**
 * Liquidity forecast chart — extracted from liquiditaet.tsx so recharts
 * can be code-split via dynamic import (R3 Perf). Recharts is ~120kB and
 * would otherwise be in the initial bundle.
 */

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface ChartDatum {
  name: string;
  [key: string]: string | number;
}

interface LiquidityForecastChartProps {
  data: ChartDatum[];
  inflowsLabel: string;
  outflowsLabel: string;
  cumulativeLabel: string;
  fmtTick: (n: number) => string;
  fmtTooltip: (n: number) => string;
}

export function LiquidityForecastChart({
  data,
  inflowsLabel,
  outflowsLabel,
  cumulativeLabel,
  fmtTick,
  fmtTooltip,
}: LiquidityForecastChartProps) {
  return (
    <ComposedChart width={800} height={300} data={data}>
      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
      <YAxis tickFormatter={fmtTick} tick={{ fontSize: 11 }} />
      <Tooltip
        formatter={(value, name) => {
          const num = typeof value === "number" ? value : 0;
          return [fmtTooltip(Math.abs(num)) + " €", String(name ?? "")];
        }}
        labelStyle={{ fontWeight: "bold" }}
      />
      <Legend />
      <Bar dataKey={inflowsLabel} fill="hsl(142, 71%, 45%)" radius={[2, 2, 0, 0]} />
      <Bar dataKey={outflowsLabel} fill="hsl(0, 84%, 60%)" radius={[2, 2, 0, 0]} />
      <Line
        type="monotone"
        dataKey={cumulativeLabel}
        stroke="hsl(215, 50%, 40%)"
        strokeWidth={2}
        dot={{ r: 3 }}
      />
    </ComposedChart>
  );
}
