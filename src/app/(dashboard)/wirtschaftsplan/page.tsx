"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Wallet,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

function useFormatEur() {
  const locale = useLocale();
  return (val: number): string =>
    new Intl.NumberFormat(locale === "en" ? "en-US" : "de-DE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(val);
}

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

function KpiCard({
  title,
  value,
  sub,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  trend?: "positive" | "negative" | "neutral";
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold ${
            trend === "positive"
              ? "text-green-600 dark:text-green-400"
              : trend === "negative"
                ? "text-destructive"
                : ""
          }`}
        >
          {value}
        </div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function WirtschaftsplanOverviewPage() {
  const t = useTranslations("wirtschaftsplan.overview");
  const tMonths = useTranslations("wirtschaftsplan.months");
  const tNav = useTranslations("nav");
  const formatEur = useFormatEur();

  const { data, isLoading, error } = useQuery<OverviewData>({
    queryKey: ["/api/wirtschaftsplan/overview"],
    queryFn: () => fetcher("/api/wirtschaftsplan/overview"),
  });

  const MONTH_KEYS = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ] as const;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{tNav("wirtschaftsplan")}</h1>
          <p className="text-muted-foreground">{t("shortSubtitle")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{tNav("wirtschaftsplan")}</h1>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{t("loadError")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const currentMonthName = tMonths(MONTH_KEYS[data.currentMonth - 1]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{tNav("wirtschaftsplan")}</h1>
          <p className="text-muted-foreground">
            {t("subtitle", { year: data.year, month: currentMonthName })}
          </p>
        </div>
        {!data.hasBudget && (
          <Badge variant="outline" className="text-amber-600 border-amber-300">
            {t("noBudget")}
          </Badge>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={t("kpiRevenueYtd")}
          value={formatEur(data.totalRevenue)}
          sub={
            data.hasBudget
              ? t("planPrefix", { value: formatEur(data.budgetRevenue) })
              : undefined
          }
          icon={TrendingUp}
          trend={
            data.hasBudget
              ? data.varianceRevenue >= 0
                ? "positive"
                : "negative"
              : "neutral"
          }
        />
        <KpiCard
          title={t("kpiCostsYtd")}
          value={formatEur(data.totalCosts)}
          sub={
            data.hasBudget
              ? t("planPrefix", { value: formatEur(data.budgetCosts) })
              : undefined
          }
          icon={TrendingDown}
          trend={
            data.hasBudget
              ? data.varianceCosts <= 0
                ? "positive"
                : "negative"
              : "neutral"
          }
        />
        <KpiCard
          title={t("kpiNetPlYtd")}
          value={formatEur(data.netPL)}
          sub={
            data.hasBudget
              ? t("planPrefix", { value: formatEur(data.budgetNetPL) })
              : undefined
          }
          icon={Wallet}
          trend={data.netPL >= 0 ? "positive" : "negative"}
        />
        <KpiCard
          title={t("kpiBudgetUsage")}
          value={
            data.budgetUsagePct !== null
              ? `${data.budgetUsagePct.toFixed(1)} %`
              : "–"
          }
          sub={
            data.hasBudget
              ? t("kpiBudgetUsageSub")
              : t("kpiBudgetUsageNone")
          }
          icon={BarChart3}
          trend={
            data.budgetUsagePct !== null
              ? data.budgetUsagePct > 110
                ? "negative"
                : data.budgetUsagePct < 90
                  ? "positive"
                  : "neutral"
              : "neutral"
          }
        />
      </div>

      {/* Variance Info */}
      {data.hasBudget && (
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              label: t("varianceRevenue"),
              val: data.varianceRevenue,
              hint: t("varianceRevenueHint"),
            },
            {
              label: t("varianceCosts"),
              val: -data.varianceCosts, // negative means under budget = good
              hint: t("varianceCostsHint"),
            },
            {
              label: t("varianceNetPl"),
              val: data.varianceNetPL,
              hint: t("varianceNetPlHint"),
            },
          ].map(({ label, val, hint }) => (
            <Card key={label}>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p
                  className={`text-xl font-semibold mt-1 ${
                    val > 0
                      ? "text-green-600 dark:text-green-400"
                      : val < 0
                        ? "text-destructive"
                        : ""
                  }`}
                >
                  {val > 0 ? "+" : ""}
                  {formatEur(val)}
                </p>
                <p className="text-xs text-muted-foreground">{hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            label: t("quickLinkPlTitle"),
            href: "/wirtschaftsplan/pl",
            icon: BarChart3,
            desc: t("quickLinkPlDesc"),
          },
          {
            label: t("quickLinkBudgetTitle"),
            href: "/wirtschaftsplan/budget",
            icon: Wallet,
            desc: t("quickLinkBudgetDesc"),
          },
          {
            label: t("quickLinkCostCentersTitle"),
            href: "/wirtschaftsplan/cost-centers",
            icon: TrendingUp,
            desc: t("quickLinkCostCentersDesc"),
          },
        ].map(({ label, href, icon: Icon, desc }) => (
          <a key={href} href={href}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="rounded-md bg-primary/10 p-2">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <p className="font-medium">{label}</p>
                </div>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
