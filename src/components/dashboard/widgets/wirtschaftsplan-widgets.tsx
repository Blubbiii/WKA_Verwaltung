"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// =============================================================================
// Types — matches actual /api/wirtschaftsplan/overview response
// =============================================================================

interface OverviewData {
  year: number;
  currentMonth: number;
  totalRevenue: number;
  totalCosts: number;
  netPL: number;
  budgetRevenue: number;
  budgetCosts: number;
  budgetNetPL: number;
  budgetUsagePct: number | null;
  hasBudget: boolean;
  varianceRevenue: number;
  varianceCosts: number;
  varianceNetPL: number;
}

function useOverviewData() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/wirtschaftsplan/overview", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: OverviewData) => { setData(d); setIsLoading(false); })
      .catch((e) => {
        if (e?.name !== "AbortError") { setError(true); setIsLoading(false); }
      });
    return () => controller.abort();
  }, []);

  return { data, isLoading, error };
}

// =============================================================================
// KPI: Budget Variance
// =============================================================================

export function BudgetVarianceKPI({ className }: { className?: string }) {
  const t = useTranslations("dashboard.widgets");
  const { data, isLoading, error } = useOverviewData();

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={cn("flex items-center justify-center h-full text-muted-foreground text-sm", className)}>
        {t("noData")}
      </div>
    );
  }

  const utilization = data.budgetUsagePct;
  const hasBudget = data.hasBudget && utilization !== null;

  const isOver = hasBudget && utilization! > 100;
  const isUnder = hasBudget && utilization! < 90;
  const color = isOver
    ? "text-red-600 dark:text-red-400"
    : isUnder
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-blue-600 dark:text-blue-400";
  const iconColor = isOver
    ? "text-red-500/40 dark:text-red-400/30"
    : isUnder
    ? "text-emerald-500/40 dark:text-emerald-400/30"
    : "text-blue-500/40 dark:text-blue-400/30";
  const Icon = isOver ? TrendingUp : isUnder ? TrendingDown : Minus;
  const label = isOver
    ? t("overPlan", { pct: (utilization! - 100).toFixed(1) })
    : isUnder
    ? t("underPlan", { pct: (100 - utilization!).toFixed(1) })
    : t("inPlan");

  return (
    <div className={cn("flex items-start gap-3 @md:gap-4", className)}>
      <Icon className={cn("h-8 w-8 @md:h-10 @md:w-10 shrink-0 mt-1", iconColor)} />
      <div className="min-w-0">
        <p className={cn("text-2xl @md:text-3xl font-bold truncate", color)}>
          {hasBudget ? `${utilization!.toFixed(1)} %` : "–"}
        </p>
        <p className="text-xs @md:text-sm text-muted-foreground mt-0.5">{t("costUtilization", { year: data.year })}</p>
        {hasBudget && <p className={cn("text-xs @md:text-sm mt-1", color)}>{label}</p>}
        {!hasBudget && (
          <p className="text-xs @md:text-sm text-muted-foreground mt-1">{t("noBudget")}</p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Chart: P&L Ist vs. Plan (YTD comparison, 3 categories)
// =============================================================================

function formatK(value: number) {
  return `${(value / 1000).toFixed(1)}k€`;
}

export function WirtschaftsplanPLChart({ className }: { className?: string }) {
  const t = useTranslations("dashboard.widgets");
  const { data, isLoading, error } = useOverviewData();

  if (isLoading) {
    return (
      <Card className={cn("h-full flex items-center justify-center", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className={cn("h-full flex items-center justify-center text-muted-foreground text-sm", className)}>
        {t("dataNotAvailable")}
      </Card>
    );
  }

  const monthLabel = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"][data.currentMonth - 1];

  const chartData = [
    {
      name: t("categoryRevenue"),
      [t("actualLabel")]: Math.round(data.totalRevenue / 10) / 100,
      ...(data.hasBudget ? { [t("planLabel")]: Math.round(data.budgetRevenue / 10) / 100 } : {}),
    },
    {
      name: t("categoryCosts"),
      [t("actualLabel")]: Math.round(data.totalCosts / 10) / 100,
      ...(data.hasBudget ? { [t("planLabel")]: Math.round(data.budgetCosts / 10) / 100 } : {}),
    },
    {
      name: t("categoryResult"),
      [t("actualLabel")]: Math.round(data.netPL / 10) / 100,
      ...(data.hasBudget ? { [t("planLabel")]: Math.round(data.budgetNetPL / 10) / 100 } : {}),
    },
  ];

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="uppercase tracking-wider text-[11px] font-semibold text-muted-foreground">
          {t("plYearProgress")}
        </CardTitle>
        <CardDescription className="text-xs">
          {data.hasBudget
            ? t("ytdActualVsPlan", { year: data.year, month: monthLabel })
            : t("ytdActual", { year: data.year, month: monthLabel })}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={formatK}
              width={50}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
                fontSize: 12,
              }}
              formatter={(value, name) => {
                const num = typeof value === "number" ? value : 0;
                return [`${num.toFixed(1)}k€`, String(name ?? "")];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey={t("actualLabel")} fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
            {data.hasBudget && (
              <Bar dataKey={t("planLabel")} fill="hsl(var(--chart-2))" radius={[2, 2, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
