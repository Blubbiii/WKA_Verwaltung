"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertOctagon, TrendingDown, Euro, ShieldAlert } from "lucide-react";
import { AnalyticsKpiRow } from "./kpi-row";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { CurtailmentResponse, CurtailmentCategory } from "@/types/analytics";
import { LOCALE_DE, formatCurrency } from "@/lib/format";

// =============================================================================
// Props
// =============================================================================

interface CurtailmentChartProps {
  parkId?: string | null;
  year?: number;
  /** When provided, disables built-in fetching and uses the given data. */
  data?: CurtailmentResponse | null;
  isLoading?: boolean;
}

// =============================================================================
// Category color semantics
//  - external = critical / einforderbar → destructive/red
//  - technical = warning → amber
//  - wind      = informational → info blue
//  - forced    = muted / grey
// =============================================================================

const CATEGORY_COLORS: Record<CurtailmentCategory, string> = {
  external: "#ef4444",   // red-500 — §13a EnWG
  technical: "#f59e0b",  // amber-500
  wind: "#3b82f6",       // blue-500
  forced: "#6b7280",     // gray-500
};

// =============================================================================
// Formatters
// =============================================================================

const dec1Fmt = new Intl.NumberFormat(LOCALE_DE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
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
  payload?: Record<string, unknown>;
}

function StackedTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
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
            {dec1Fmt.format(e.value)} kW
          </span>
        </p>
      ))}
      <p className="text-xs text-muted-foreground mt-1 border-t pt-1">
        Ø {dec1Fmt.format(total)} kW
      </p>
    </div>
  );
}

interface PieDatum {
  category: CurtailmentCategory;
  label: string;
  value: number;
  totalLostEur: number;
  pctOfProduction: number;
}

function PieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: PieDatum; value: number; color: string }>;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="font-medium mb-1">{entry.label}</p>
      <p className="text-sm">
        <span className="text-muted-foreground">kWh: </span>
        <span className="font-medium">{numFmt.format(entry.value)}</span>
      </p>
      <p className="text-sm">
        <span className="text-muted-foreground">Ausfall: </span>
        <span className="font-medium">{formatCurrency(entry.totalLostEur)}</span>
      </p>
      <p className="text-sm">
        <span className="text-muted-foreground">Anteil Prod.: </span>
        <span className="font-medium">
          {dec1Fmt.format(entry.pctOfProduction)} %
        </span>
      </p>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function CurtailmentChart({
  parkId,
  year,
  data: providedData,
  isLoading: providedIsLoading,
}: CurtailmentChartProps) {
  const t = useTranslations("energy.analytics.curtailment");
  const [fetchedData, setFetchedData] = useState<CurtailmentResponse | null>(
    null,
  );
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveYear = year ?? new Date().getFullYear();
  const isControlled = providedData !== undefined;

  const fetchData = useCallback(async () => {
    if (isControlled) return;
    setFetching(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("year", String(effectiveYear));
      if (parkId && parkId !== "all") params.set("parkId", parkId);
      const res = await fetch(
        `/api/energy/analytics/curtailment?${params.toString()}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as CurtailmentResponse;
      setFetchedData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setFetching(false);
    }
  }, [effectiveYear, parkId, isControlled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const data = isControlled ? providedData : fetchedData;
  const isLoading = isControlled ? !!providedIsLoading : fetching;

  // KPI Cards
  const kpis = useMemo(() => {
    const s = data?.summary;
    return [
      {
        title: t("kpiLostEnergy"),
        value: s ? numFmt.format(s.totalLostKwh) + " kWh" : "---",
        icon: TrendingDown,
        description: t("subtitle"),
      },
      {
        title: t("kpiLostRevenue"),
        value: s ? formatCurrency(s.totalLostEur) : "---",
        icon: Euro,
        description: t("subtitle"),
      },
      {
        title: t("kpiRedispatch"),
        value: s ? formatCurrency(s.externalRedispatchEur) : "---",
        icon: ShieldAlert,
        description: t("categoryExternalDetail"),
        isAlert: (s?.externalRedispatchEur ?? 0) > 0,
      },
    ];
  }, [data, t]);

  // Stacked bar data (time-series)
  const stackedData = useMemo(() => {
    if (!data) return [];
    return data.timeSeries.map((p) => ({
      bucket: p.bucket,
      wind: p.windKw,
      technical: p.technicalKw,
      forced: p.forcedKw,
      external: p.externalKw,
    }));
  }, [data]);

  // Pie data
  const pieData: PieDatum[] = useMemo(() => {
    if (!data) return [];
    return data.byCategory
      .filter((c) => c.totalLostKwh > 0)
      .map((c) => ({
        category: c.category,
        label: c.label,
        value: c.totalLostKwh,
        totalLostEur: c.totalLostEur,
        pctOfProduction: c.pctOfProduction,
      }));
  }, [data]);

  const hasData = !!data && data.timeSeries.length > 0;

  // Category labels (localized names for legend/bars)
  const catLabels: Record<CurtailmentCategory, string> = {
    wind: t("categoryWind"),
    technical: t("categoryTechnical"),
    forced: t("categoryForced"),
    external: t("categoryExternal"),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          {t("title")}
          <InfoTooltip text={t("redispatchInfoTooltip")} />
        </h2>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertOctagon className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* KPI Cards */}
      <AnalyticsKpiRow kpis={kpis} isLoading={isLoading} />

      {/* Empty state */}
      {!isLoading && !hasData && (
        <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
          <AlertOctagon className="h-8 w-8 mb-2" />
          <p>{t("noData")}</p>
        </div>
      )}

      {hasData && (
        <>
          {/* Stacked Bar-Chart (dominating) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {t("title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                width="100%"
                height={380}
                data={stackedData}
                margin={{ left: 10, right: 10, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  className="stroke-muted"
                />
                <XAxis
                  dataKey="bucket"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: t("timeAxisLabel"),
                    position: "insideBottom",
                    offset: -2,
                    fontSize: 12,
                  }}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${numFmt.format(v)} kW`}
                />
                <Tooltip content={<StackedTooltip />} />
                <Legend />
                <Bar
                  dataKey="wind"
                  name={catLabels.wind}
                  stackId="curtail"
                  fill={CATEGORY_COLORS.wind}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="technical"
                  name={catLabels.technical}
                  stackId="curtail"
                  fill={CATEGORY_COLORS.technical}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="forced"
                  name={catLabels.forced}
                  stackId="curtail"
                  fill={CATEGORY_COLORS.forced}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="external"
                  name={catLabels.external}
                  stackId="curtail"
                  fill={CATEGORY_COLORS.external}
                  isAnimationActive={false}
                />
              </BarChart>
            </CardContent>
          </Card>

          {/* Pie-Chart: category distribution */}
          {pieData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {t("pctOfProduction")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PieChart width="100%" height={320}>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    dataKey="value"
                    nameKey="label"
                    isAnimationActive={false}
                    labelLine={false}
                  >
                    {pieData.map((entry) => (
                      <Cell
                        key={entry.category}
                        fill={CATEGORY_COLORS[entry.category]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                  <Legend />
                </PieChart>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
