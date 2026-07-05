"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CloudRain, Gauge, Snowflake, ThermometerSnowflake } from "lucide-react";
import { AnalyticsKpiRow } from "./kpi-row";
import type { MeteoResponse } from "@/types/analytics";
import { MONTH_LABELS } from "@/types/analytics";
import { LOCALE_DE } from "@/lib/format";

// =============================================================================
// Types
// =============================================================================

interface MeteoExtendedChartProps {
  data: MeteoResponse | undefined;
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

function MeteoTooltip({
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
          <span className="font-medium">{dec2Fmt.format(e.value)}</span>
        </p>
      ))}
    </div>
  );
}

function IcingTooltip({
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
          <span className="font-medium">{dec1Fmt.format(e.value)} h</span>
        </p>
      ))}
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function MeteoExtendedChart({
  data,
  isLoading,
}: MeteoExtendedChartProps) {
  const t = useTranslations("energy.analytics.meteoExtended");

  const kpis = useMemo(() => {
    const icing = data?.icing;
    const peakLabel =
      icing?.peakIcingMonth != null
        ? `${MONTH_LABELS[(icing.peakIcingMonth.month - 1) % 12]} · ${dec1Fmt.format(icing.peakIcingMonth.hours)} h`
        : "---";
    const availability = data?.summary.dataAvailability ?? 0;

    return [
      {
        title: t("kpiIcingHours"),
        value: icing ? `${dec1Fmt.format(icing.totalIcingHours)} h` : "---",
        icon: Snowflake,
        description: icing
          ? `${dec2Fmt.format(icing.icingRate)} %`
          : undefined,
      },
      {
        title: t("kpiColdIcingHours"),
        value: icing
          ? `${dec1Fmt.format(icing.totalColdIcingHours)} h`
          : "---",
        icon: ThermometerSnowflake,
        description: t("coldIcingLabel"),
      },
      {
        title: t("kpiPeakMonth"),
        value: peakLabel,
        icon: CloudRain,
        description: t("icingMonthlyLabel"),
      },
      {
        title: t("kpiDataAvailability"),
        value: `${dec1Fmt.format(availability)} %`,
        icon: Gauge,
        description: t("subtitle"),
      },
    ];
  }, [data, t]);

  // Time-series chart data (already sorted by bucket ascending from API)
  const timeSeriesData = useMemo(() => {
    if (!data?.timeSeries) return [];
    return data.timeSeries.map((p) => ({
      bucket: p.bucket,
      pressure: p.meanAirPressureHpa,
      humidity: p.meanHumidityPct,
      rain: p.meanRainIndex,
    }));
  }, [data]);

  // Monthly icing chart data
  const icingChartData = useMemo(() => {
    const monthly = data?.icing.monthlyIcingHours ?? [];
    // Build 12-month scaffold so gaps render as zero-height bars.
    const byMonth = new Map(monthly.map((m) => [m.month, m]));
    return Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1;
      const row = byMonth.get(monthNum);
      return {
        label: MONTH_LABELS[i],
        hours: row?.hours ?? 0,
        coldHours: row?.coldHours ?? 0,
      };
    });
  }, [data]);

  const hasTimeSeries = timeSeriesData.length > 0;
  const hasIcing = (data?.icing.monthlyIcingHours.length ?? 0) > 0;

  if (!isLoading && !hasTimeSeries && !hasIcing) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
        <Gauge className="h-8 w-8 mb-2" />
        <p>{t("subtitle")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">{t("title")}</h3>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <AnalyticsKpiRow kpis={kpis} isLoading={isLoading} />

      {/* Meteo time-series (pressure / humidity / rain — dual axes) */}
      {hasTimeSeries && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t("pressureLabel")} · {t("humidityLabel")} · {t("rainLabel")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ComposedChart
              width="100%"
              height={340}
              data={timeSeriesData}
              margin={{ left: 10, right: 10, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                className="stroke-muted"
              />
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                minTickGap={30}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${numFmt.format(v)} hPa`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${numFmt.format(v)} %`}
              />
              <Tooltip content={<MeteoTooltip />} />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="pressure"
                name={t("pressureLabel")}
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="humidity"
                name={t("humidityLabel")}
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="rain"
                name={t("rainLabel")}
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </CardContent>
        </Card>
      )}

      {/* Icing bar chart with cold-icing overlay */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t("icingMonthlyLabel")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            width="100%"
            height={320}
            data={icingChartData}
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
              tickFormatter={(v) => `${numFmt.format(v)} h`}
            />
            <Tooltip content={<IcingTooltip />} />
            <Legend />
            <Bar
              dataKey="hours"
              name={t("icingMonthlyLabel")}
              fill="#ef4444"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="coldHours"
              name={t("coldIcingLabel")}
              fill="#7f1d1d"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </CardContent>
      </Card>
    </div>
  );
}
