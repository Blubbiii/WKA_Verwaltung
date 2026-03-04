"use client";

import { useEffect, useState } from "react";
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
// Types
// =============================================================================

interface OverviewData {
  year: number;
  revenueActual: number;
  revenueBudget: number | null;
  costsActual: number;
  costsBudget: number | null;
  resultActual: number;
  resultBudget: number | null;
  budgetUtilizationPct: number | null;
  monthlyData: Array<{
    month: number;
    revenueActual: number;
    revenueBudget: number | null;
    costsActual: number;
    costsBudget: number | null;
    resultActual: number;
    resultBudget: number | null;
  }>;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

function useOverviewData() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/wirtschaftsplan/overview")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: OverviewData) => { setData(d); setIsLoading(false); })
      .catch(() => { setError(true); setIsLoading(false); });
  }, []);

  return { data, isLoading, error };
}

// =============================================================================
// KPI: Budget Variance
// =============================================================================

export function BudgetVarianceKPI({ className }: { className?: string }) {
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
        Keine Daten
      </div>
    );
  }

  const utilization = data.budgetUtilizationPct;
  const hasBudget = utilization !== null && utilization !== undefined;

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
    ? `+${(utilization! - 100).toFixed(1)}% über Plan`
    : isUnder
    ? `${(100 - utilization!).toFixed(1)}% unter Plan`
    : "Im Plan";

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <Icon className={cn("h-8 w-8 shrink-0 mt-1", iconColor)} />
      <div className="min-w-0">
        <p className={cn("text-2xl font-bold truncate", color)}>
          {hasBudget ? `${utilization!.toFixed(1)} %` : "–"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">Budget-Auslastung {data.year}</p>
        {hasBudget && (
          <p className={cn("text-xs mt-1", color)}>{label}</p>
        )}
        {!hasBudget && (
          <p className="text-xs text-muted-foreground mt-1">Kein Budget hinterlegt</p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Chart: P&L Jahresverlauf (Ist vs. Plan)
// =============================================================================

export function WirtschaftsplanPLChart({ className }: { className?: string }) {
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
        Daten nicht verfügbar
      </Card>
    );
  }

  const chartData = data.monthlyData.map((m) => ({
    name: MONTH_LABELS[m.month - 1],
    Ist: Math.round(m.resultActual / 100) / 10,
    Plan: m.resultBudget != null ? Math.round(m.resultBudget / 100) / 10 : undefined,
  }));

  const hasBudget = data.revenueBudget !== null;

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="uppercase tracking-wider text-[11px] font-semibold text-muted-foreground">
          P&L Jahresverlauf
        </CardTitle>
        <CardDescription className="text-xs">
          Ergebnis {data.year} — Ist{hasBudget ? " vs. Plan" : ""}
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
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v) => `${v}k`}
              width={36}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => [`${value.toFixed(1)} k€`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Ist" fill="hsl(215, 50%, 40%)" radius={[2, 2, 0, 0]} />
            {hasBudget && (
              <Bar dataKey="Plan" fill="hsl(215, 50%, 68%)" radius={[2, 2, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
