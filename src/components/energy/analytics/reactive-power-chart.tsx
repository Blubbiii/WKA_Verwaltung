"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Activity,
  Loader2,
  Gauge,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { AnalyticsKpiRow } from "./kpi-row";
import type {
  ReactivePowerPoint,
  ReactivePowerHourly,
  ReactivePowerSummary,
} from "@/types/analytics";
import { LOCALE_DE } from "@/lib/format";

// =============================================================================
// Types
// =============================================================================

interface ReactivePowerChartProps {
  timeSeries: ReactivePowerPoint[];
  hourlyProfile: ReactivePowerHourly[];
  summary: ReactivePowerSummary;
  isLoading?: boolean;
}

// =============================================================================
// Formatters
// =============================================================================

const dec1Fmt = new Intl.NumberFormat(LOCALE_DE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dec2Fmt = new Intl.NumberFormat(LOCALE_DE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dec3Fmt = new Intl.NumberFormat(LOCALE_DE, {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const numFmt = new Intl.NumberFormat(LOCALE_DE, {
  maximumFractionDigits: 0,
});

// =============================================================================
// Tooltips
// =============================================================================

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

function TimeSeriesTooltip({
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
    <div className="rounded-lg border bg-background p-2 shadow-md">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((e, i) => (
        <p key={i} className="text-sm flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: e.color }}
          />
          <span className="text-muted-foreground">{e.name}:</span>
          <span className="font-medium">
            {e.dataKey === "meanCosPhi"
              ? dec3Fmt.format(e.value)
              : `${numFmt.format(e.value)} Var`}
          </span>
        </p>
      ))}
    </div>
  );
}

function HourlyTooltip({
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
    <div className="rounded-lg border bg-background p-2 shadow-md">
      <p className="font-medium mb-1">
        {label !== undefined ? `${label}:00` : ""}
      </p>
      {payload.map((e, i) => (
        <p key={i} className="text-sm flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: e.color }}
          />
          <span className="text-muted-foreground">{e.name}:</span>
          <span className="font-medium">
            {e.dataKey === "meanCosPhi"
              ? dec3Fmt.format(e.value)
              : `${numFmt.format(e.value)} Var`}
          </span>
        </p>
      ))}
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function complianceLabel(
  pct: number,
  t: (k: string) => string,
): { text: string; icon: typeof Activity; tone: string } {
  if (pct >= 99) return { text: t("complianceGood"), icon: Gauge, tone: "text-emerald-600" };
  if (pct >= 95) return { text: t("complianceWarn"), icon: Gauge, tone: "text-amber-600" };
  return { text: t("complianceBad"), icon: AlertTriangle, tone: "text-rose-600" };
}

// =============================================================================
// Component
// =============================================================================

export function ReactivePowerChart({
  timeSeries,
  hourlyProfile,
  summary,
  isLoading,
}: ReactivePowerChartProps) {
  const t = useTranslations("energy.analytics.reactivePower");

  const cosPhiCompLabel = complianceLabel(summary.cosPhiComplianceRate, t);
  const freqCompLabel = complianceLabel(summary.freqComplianceRate, t);

  const kpis = useMemo(
    () => [
      {
        title: t("kpiTotalReactive"),
        value: dec2Fmt.format(summary.totalReactiveEnergyMWh) + " MVArh",
        icon: Zap,
        description: `${t("inductive")}: ${dec2Fmt.format(summary.inductiveReactiveEnergyMWh)} · ${t("capacitive")}: ${dec2Fmt.format(summary.capacitiveReactiveEnergyMWh)}`,
      },
      {
        title: t("kpiCosPhiCompliance"),
        value: dec1Fmt.format(summary.cosPhiComplianceRate) + " %",
        icon: cosPhiCompLabel.icon,
        description: `${cosPhiCompLabel.text} · Ø cos φ ${dec3Fmt.format(summary.meanCosPhiOverall)}`,
      },
      {
        title: t("kpiFreqCompliance"),
        value: dec1Fmt.format(summary.freqComplianceRate) + " %",
        icon: freqCompLabel.icon,
        description: freqCompLabel.text,
      },
    ],
    [summary, t, cosPhiCompLabel, freqCompLabel],
  );

  const timeSeriesData = useMemo(
    () =>
      timeSeries.map((p) => ({
        bucket: p.bucket,
        meanReactiveVar: p.meanReactiveVar,
        meanCosPhi: p.meanCosPhi,
      })),
    [timeSeries],
  );

  const hourlyData = useMemo(
    () =>
      hourlyProfile.map((h) => ({
        hour: h.hour,
        meanReactiveVar: h.meanReactiveVar,
        meanCosPhi: h.meanCosPhi,
      })),
    [hourlyProfile],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (timeSeries.length === 0 && hourlyProfile.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <Activity className="h-8 w-8 mb-2" />
        <p>{t("noData")}</p>
      </div>
    );
  }

  const showComplianceWarning =
    summary.cosPhiComplianceRate < 95 || summary.freqComplianceRate < 95;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <AnalyticsKpiRow kpis={kpis} isLoading={false} />

      {/* Compliance warning */}
      {showComplianceWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>{t("subtitle")}</p>
        </div>
      )}

      {/* Time series (Q + cos phi) */}
      {timeSeriesData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart width="100%" height={320} data={timeSeriesData}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="stroke-muted"
              />
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${numFmt.format(v)} Var`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                domain={[0.9, 1.0]}
                tickFormatter={(v) => dec2Fmt.format(v)}
              />
              <Tooltip content={<TimeSeriesTooltip />} />
              <Legend />
              <ReferenceLine
                yAxisId="right"
                y={1}
                stroke="#22c55e"
                strokeDasharray="4 4"
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="meanReactiveVar"
                name={t("kpiTotalReactive")}
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="meanCosPhi"
                name={t("cosPhiLabel")}
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </CardContent>
        </Card>
      )}

      {/* Hourly profile */}
      {hourlyData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t("hourLabel")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AreaChart width="100%" height={280} data={hourlyData}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="stroke-muted"
              />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}:00`}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${numFmt.format(v)} Var`}
              />
              <Tooltip content={<HourlyTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="meanReactiveVar"
                name={t("kpiTotalReactive")}
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.2}
              />
            </AreaChart>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
