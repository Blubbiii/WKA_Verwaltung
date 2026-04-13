"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Zap, Sun, Wind, CheckCircle } from "lucide-react";
import {
  KPICard,
  KPICardGrid,
  KPICardGridSkeleton,
} from "@/components/dashboard/kpi-card";
import { Card, CardContent } from "@/components/ui/card";

// =============================================================================
// SCADA KPI Cards for Energy Overview
// Shows real-time SCADA summary: current production, daily production,
// average wind speed, monthly availability
// =============================================================================

interface ScadaSummaryResponse {
  currentProductionKw: number;
  todayProductionMwh: number;
  avgWindSpeed: number;
  monthAvailability: number;
  latestTimestamp: string | null;
  turbineCount: number;
  trends: {
    production: { previous: number; change: number };
    wind: { previous: number; change: number };
    availability: { previous: number; change: number };
  };
}

interface ScadaKpiCardsProps {
  parkId?: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Fehler beim Laden");
  return res.json();
};

const dec1Fmt = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const dec2Fmt = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numFmt = new Intl.NumberFormat("de-DE", {
  maximumFractionDigits: 0,
});

export function ScadaKpiCards({ parkId }: ScadaKpiCardsProps) {
  const t = useTranslations("energy.scadaKpi");

  const formatTimestamp = (ts: string | null): string => {
    if (!ts) return t("noData");
    try {
      const date = new Date(ts);
      return t("stand", { time: date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) });
    } catch {
      return t("noData");
    }
  };

  const params = new URLSearchParams();
  if (parkId && parkId !== "all") params.set("parkId", parkId);

  const summaryUrl = `/api/energy/scada/summary?${params.toString()}`;
  const { data, error, isLoading } = useQuery<ScadaSummaryResponse>({
    queryKey: [summaryUrl],
    queryFn: () => fetcher(summaryUrl),
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  });

  // Loading state
  if (isLoading) {
    return <KPICardGridSkeleton count={4} />;
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-center text-sm text-muted-foreground">
            {t("loadError")}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Empty state - no SCADA data available at all
  if (!data || (data.currentProductionKw === 0 && data.todayProductionMwh === 0 && data.turbineCount === 0)) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-center text-sm text-muted-foreground">
            {t("noScadaImport")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <KPICardGrid>
      {/* Current Production */}
      <KPICard
        title={t("currentProduction")}
        value={`${numFmt.format(data.currentProductionKw)} kW`}
        icon={Zap}
        description={formatTimestamp(data.latestTimestamp)}
        trend={data.trends.production.change || undefined}
        trendLabel={
          data.trends.production.change === 0 && data.trends.production.previous > 0
            ? t("sameAsYesterday")
            : undefined
        }
      />

      {/* Daily Production */}
      <KPICard
        title={t("dailyProduction")}
        value={`${dec2Fmt.format(data.todayProductionMwh)} MWh`}
        icon={Sun}
        description={
          data.trends.production.previous > 0
            ? t("yesterdayMwh", { value: dec2Fmt.format(data.trends.production.previous) })
            : t("todayProduction")
        }
        trend={data.trends.production.change || undefined}
      />

      {/* Average Wind Speed */}
      <KPICard
        title={t("avgWind")}
        value={`${dec1Fmt.format(data.avgWindSpeed)} m/s`}
        icon={Wind}
        description={
          data.trends.wind.previous > 0
            ? t("yesterdayWind", { value: dec1Fmt.format(data.trends.wind.previous) })
            : t("currentWindSpeed")
        }
        trend={data.trends.wind.change || undefined}
      />

      {/* Monthly Availability */}
      <KPICard
        title={t("availability")}
        value={
          data.monthAvailability > 0
            ? `${dec1Fmt.format(data.monthAvailability)} %`
            : "-"
        }
        icon={CheckCircle}
        description={
          data.trends.availability.previous > 0
            ? t("previousMonth", { value: dec1Fmt.format(data.trends.availability.previous) })
            : t("currentMonth")
        }
        trend={data.trends.availability.change || undefined}
      />
    </KPICardGrid>
  );
}
