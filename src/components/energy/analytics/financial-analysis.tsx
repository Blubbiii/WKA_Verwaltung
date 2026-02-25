"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  ComposedChart,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Euro, Zap, TrendingUp, AlertTriangle } from "lucide-react";
import { AnalyticsKpiRow } from "./kpi-row";
import type { MonthlyRevenuePoint } from "@/types/analytics";

// =============================================================================
// Types
// =============================================================================

interface FinancialAnalysisProps {
  monthly: MonthlyRevenuePoint[];
  lostRevenue: {
    totalLostKwh: number;
    estimatedLostEur: number;
    avgRevenuePerKwh: number | null;
  };
  summary: {
    totalRevenueEur: number;
    totalProductionKwh: number;
    avgRevenuePerKwh: number | null;
  };
  isLoading?: boolean;
}

// =============================================================================
// Formatters
// =============================================================================

const eurFmt = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

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

function formatCtKwh(eurPerKwh: number | null): string {
  if (eurPerKwh == null) return "\u2013";
  return dec2Fmt.format(eurPerKwh * 100) + " ct/kWh";
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

function RevenueTooltip({
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
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((e, i) => (
        <p key={i} className="text-sm flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: e.color }}
          />
          <span className="text-muted-foreground">{e.name}:</span>
          <span className="font-medium">{eurFmt.format(e.value)}</span>
        </p>
      ))}
    </div>
  );
}

function ProductionRevenueTooltip({
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
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((e, i) => (
        <p key={i} className="text-sm flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: e.color }}
          />
          <span className="text-muted-foreground">{e.name}:</span>
          <span className="font-medium">
            {e.dataKey === "productionMwh"
              ? dec1Fmt.format(e.value) + " MWh"
              : dec2Fmt.format(e.value) + " ct/kWh"}
          </span>
        </p>
      ))}
    </div>
  );
}

function CtKwhTooltip({
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
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((e, i) => (
        <p key={i} className="text-sm flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: e.color }}
          />
          <span className="text-muted-foreground">{e.name}:</span>
          <span className="font-medium">
            {dec2Fmt.format(e.value)} ct/kWh
          </span>
        </p>
      ))}
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function FinancialAnalysis({
  monthly,
  lostRevenue,
  summary,
  isLoading,
}: FinancialAnalysisProps) {
  // Bar chart data: monthly revenue
  const revenueBarData = useMemo(
    () =>
      monthly.map((m) => ({
        label: m.label,
        revenueEur: m.revenueEur,
      })),
    [monthly]
  );

  // Composed chart data: production (MWh) + revenue per kWh (ct/kWh)
  const prodRevenueData = useMemo(
    () =>
      monthly.map((m) => ({
        label: m.label,
        productionMwh: m.productionKwh / 1000,
        ctPerKwh: m.revenuePerKwh != null ? m.revenuePerKwh * 100 : null,
      })),
    [monthly]
  );

  // Line chart data: revenue per kWh trend
  const ctTrendData = useMemo(
    () =>
      monthly
        .filter((m) => m.revenuePerKwh != null)
        .map((m) => ({
          label: m.label,
          ctPerKwh: m.revenuePerKwh! * 100,
        })),
    [monthly]
  );

  // KPI cards
  const kpis = useMemo(
    () => [
      {
        title: "Gesamterlöse",
        value: eurFmt.format(summary.totalRevenueEur),
        icon: Euro,
        description: "Netzbetreiber-Erlöse (netto)",
      },
      {
        title: "Gesamtproduktion",
        value: formatMwh(summary.totalProductionKwh),
        icon: Zap,
        description: "Abgerechnete Produktion",
      },
      {
        title: "Durchschnittserlös",
        value: formatCtKwh(summary.avgRevenuePerKwh),
        icon: TrendingUp,
        description: "Mittlerer Erlös pro kWh",
      },
      {
        title: "Geschaetzter Verlust",
        value: eurFmt.format(lostRevenue.estimatedLostEur),
        icon: AlertTriangle,
        description: `${formatMwh(lostRevenue.totalLostKwh)} Produktionsverlust`,
      },
    ],
    [summary, lostRevenue]
  );

  // Empty state
  if (monthly.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <Euro className="h-8 w-8 mb-2" />
        <p>Keine Abrechnungsdaten vorhanden</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <AnalyticsKpiRow kpis={kpis} isLoading={isLoading} />

      {/* Row: Monthly Revenue + Production vs. Revenue */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Revenue Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Monatliche Erlöse
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={revenueBarData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  className="stroke-muted"
                />
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
                  tickFormatter={(v) => `${numFmt.format(v)} \u20AC`}
                />
                <Tooltip content={<RevenueTooltip />} />
                <Bar
                  dataKey="revenueEur"
                  name="Erlöse"
                  fill="#22c55e"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Production vs. Revenue per kWh (Dual Axis) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Produktion vs. Abrechnung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={prodRevenueData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  className="stroke-muted"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="mwh"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${numFmt.format(v)} MWh`}
                />
                <YAxis
                  yAxisId="ct"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${dec2Fmt.format(v)} ct`}
                />
                <Tooltip content={<ProductionRevenueTooltip />} />
                <Legend />
                <Bar
                  yAxisId="mwh"
                  dataKey="productionMwh"
                  name="Produktion (MWh)"
                  fill="hsl(var(--chart-1))"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="ct"
                  type="monotone"
                  dataKey="ctPerKwh"
                  name="Erlös (ct/kWh)"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#f59e0b" }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Revenue per kWh Trend */}
      {ctTrendData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Erlöse pro kWh Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={ctTrendData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  className="stroke-muted"
                />
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
                  tickFormatter={(v) => `${dec2Fmt.format(v)} ct`}
                />
                <Tooltip content={<CtKwhTooltip />} />
                <Line
                  type="monotone"
                  dataKey="ctPerKwh"
                  name="Erlös"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#f59e0b" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Lost Revenue Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Geschaetzter Produktionsverlust (Störungen)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">
                Verlorene Produktion
              </p>
              <p className="text-xl font-bold mt-1">
                {formatMwh(lostRevenue.totalLostKwh)}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">
                Geschaetzter Erlösausfall
              </p>
              <p className="text-xl font-bold mt-1">
                {eurFmt.format(lostRevenue.estimatedLostEur)}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">
                Durchschnittl. Erlös/kWh
              </p>
              <p className="text-xl font-bold mt-1">
                {formatCtKwh(lostRevenue.avgRevenuePerKwh)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
