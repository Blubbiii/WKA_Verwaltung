"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Cloud } from "lucide-react";
import type {
  ShadowPerTurbine,
  ShadowMonthlyTrend,
  ShadowDailyProfile,
  ShadowSummary,
} from "@/types/analytics";

// =============================================================================
// Types
// =============================================================================

interface ShadowChartProps {
  perTurbine: ShadowPerTurbine[];
  monthlyTrend: ShadowMonthlyTrend[];
  dailyProfile: ShadowDailyProfile[];
  summary: ShadowSummary;
  isLoading?: boolean;
}

// =============================================================================
// Formatters
// =============================================================================

const dec1Fmt = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const numFmt = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 0,
});

// =============================================================================
// Custom Tooltips
// =============================================================================

interface TPayload {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

function ShadowTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-2 shadow-md">
      <p className="font-medium">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.value?.toFixed(1)} min
        </p>
      ))}
    </div>
  );
}

function TurbineTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-2 shadow-md">
      <p className="font-medium">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {dec1Fmt.format(entry.value)} h
        </p>
      ))}
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function budgetColor(pct: number): string {
  if (pct > 80) return "text-red-600 dark:text-red-400";
  if (pct >= 50) return "text-yellow-600 dark:text-yellow-400";
  return "text-green-600 dark:text-green-400";
}

// =============================================================================
// Component
// =============================================================================

export function ShadowChart({
  perTurbine,
  monthlyTrend,
  dailyProfile,
  summary,
  isLoading,
}: ShadowChartProps) {
  // Prepare turbine data for horizontal bar chart (sorted descending)
  const turbineData = useMemo(
    () =>
      [...perTurbine]
        .sort((a, b) => b.totalShadowHoursYear - a.totalShadowHoursYear)
        .map((t) => ({
          designation: t.designation,
          totalShadowHoursYear: t.totalShadowHoursYear,
        })),
    [perTurbine]
  );

  // Format hour labels for daily profile
  const dailyData = useMemo(
    () =>
      dailyProfile.map((d) => ({
        ...d,
        hourLabel: `${String(d.hour).padStart(2, "0")}:00`,
      })),
    [dailyProfile]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Empty state
  if (perTurbine.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <Cloud className="h-8 w-8 mb-2" />
        <p>Keine Schattenwurf-Daten vorhanden</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {dec1Fmt.format(summary.totalShadowHoursYear)} h
            </div>
            <p className="text-xs text-muted-foreground">
              Schattenstunden (Jahr)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div
              className={`text-2xl font-bold ${budgetColor(summary.budgetUsedPercent)}`}
            >
              {dec1Fmt.format(summary.budgetUsedPercent)} %
            </div>
            <p className="text-xs text-muted-foreground">
              Budget verbraucht (BImSchG 30h)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {summary.worstTurbineDesignation ?? "---"}
            </div>
            <p className="text-xs text-muted-foreground">
              Kritischste Anlage
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {numFmt.format(perTurbine.length)}
            </div>
            <p className="text-xs text-muted-foreground">
              Anlagen mit Daten
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Row 1: Monthly Trend + Daily Profile */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Shadow Casting */}
        {monthlyTrend.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Monatlicher Schattenwurf
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={monthlyTrend}
                  margin={{ left: 10, right: 10, bottom: 5 }}
                >
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
                    tickFormatter={(v) => `${v} min`}
                  />
                  <Tooltip content={<ShadowTooltip />} />
                  <Bar
                    dataKey="shadowMinutes"
                    name="Schattenwurf"
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Daily Profile */}
        {dailyData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Tagesprofil
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={dailyData}
                  margin={{ left: 10, right: 10, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="hourLabel"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v} min`}
                  />
                  <Tooltip content={<ShadowTooltip />} />
                  <Bar
                    dataKey="shadowMinutes"
                    name="Schattenwurf"
                    fill="#f97316"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Row 2: Per Turbine (horizontal bar, full width) */}
      {turbineData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Pro Anlage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer
              width="100%"
              height={Math.max(250, turbineData.length * 40 + 60)}
            >
              <BarChart
                data={turbineData}
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
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v} h`}
                />
                <YAxis
                  type="category"
                  dataKey="designation"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip content={<TurbineTooltip />} />
                <ReferenceLine
                  x={30}
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{
                    value: "30h Limit",
                    position: "top",
                    fill: "#ef4444",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                />
                <Bar
                  dataKey="totalShadowHoursYear"
                  name="Schattenstunden"
                  fill="#f59e0b"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
