"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  RefreshCw,
  AlertTriangle,
  Building2,
  Wind,
  Gauge,
  FileText,
  Receipt,
  CreditCard,
  Vote,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KPICard } from "@/components/dashboard/kpi-card";

// R3 Perf: Recharts-Charts dynamisch importieren — recharts ist ein ~120kB
// schwerer Bundle und sollte nicht im initial JS-Payload landen. SSR off,
// da Charts ohnehin Client-Only interaktiv sind.
const MonthlyInvoicesChart = dynamic(
  () => import("@/components/dashboard/analytics-charts").then((m) => m.MonthlyInvoicesChart),
  { ssr: false }
);
const CapitalDevelopmentChart = dynamic(
  () => import("@/components/dashboard/analytics-charts").then((m) => m.CapitalDevelopmentChart),
  { ssr: false }
);
const DocumentsByTypeChart = dynamic(
  () => import("@/components/dashboard/analytics-charts").then((m) => m.DocumentsByTypeChart),
  { ssr: false }
);
const TurbineStatusChart = dynamic(
  () => import("@/components/dashboard/widgets/energy-widgets").then((m) => m.TurbineStatusChart),
  { ssr: false }
);
const ProductionForecastChart = dynamic(
  () => import("@/components/dashboard/widgets/energy-widgets").then((m) => m.ProductionForecastChart),
  { ssr: false }
);
const RevenueByParkChart = dynamic(
  () => import("@/components/dashboard/widgets/energy-widgets").then((m) => m.RevenueByParkChart),
  { ssr: false }
);
import { useAnalytics } from "@/hooks/useAnalytics";
import { useEnergyDashboard } from "@/hooks/useEnergyDashboard";
import { formatCurrency, LOCALE_DE } from "@/lib/format";

// =============================================================================
// Component
// =============================================================================

export function AnalyticsDashboard() {
  const t = useTranslations("admin.analyticsDashboard");
  const analytics = useAnalytics();
  const energy = useEnergyDashboard();

  const isLoading = analytics.isLoading || energy.isLoading;
  const hasError = (analytics.error && !analytics.data) || (energy.error && !energy.data);

  function handleRefresh() {
    analytics.refetch();
    energy.refetch();
  }

  if (isLoading && !analytics.data && !energy.data) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" />
        {t("loading")}
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p>{analytics.error || energy.error}</p>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  const kpis = analytics.data?.kpis;
  const charts = analytics.data?.charts;

  return (
    <div className="space-y-6">
      {/* Status Bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {analytics.data?.generatedAt &&
            t("statusUpdated", { date: new Date(analytics.data.generatedAt).toLocaleString(LOCALE_DE) })}
        </span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => analytics.clearCache()}
            className="h-7 text-xs"
          >
            {t("clearCache")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            className="h-7 text-xs"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            {t("refresh")}
          </Button>
        </div>
      </div>

      {/* KPI Cards Row 1: Infrastructure */}
      {kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title={t("kpiParks")}
            value={`${kpis.activeParks} / ${kpis.totalParks}`}
            icon={Building2}
            description={t("kpiParksDesc", { mw: kpis.totalCapacityMW })}
            accentColor="text-cyan-600 dark:text-cyan-400"
            iconColor="text-cyan-500/70 dark:text-cyan-400/60"
          />
          <KPICard
            title={t("kpiTurbines")}
            value={kpis.totalTurbines}
            icon={Wind}
            description={t("kpiTurbinesDesc", { count: kpis.turbinesInMaintenance })}
            accentColor="text-slate-600 dark:text-slate-400"
            iconColor="text-slate-500/70 dark:text-slate-400/60"
            isAlert={kpis.turbinesInMaintenance > 0}
          />
          <KPICard
            title={t("kpiCapacity")}
            value={`${kpis.totalCapacityMW} MW`}
            icon={Gauge}
            description={t("kpiCapacityDesc", { years: kpis.averageTurbineAge.toFixed(1) })}
            accentColor="text-emerald-600 dark:text-emerald-400"
            iconColor="text-emerald-500/70 dark:text-emerald-400/60"
          />
          <KPICard
            title={t("kpiContracts")}
            value={kpis.activeContractsCount}
            icon={ScrollText}
            description={
              kpis.expiringContractsCount > 0
                ? t("kpiContractsExpiring", { count: kpis.expiringContractsCount })
                : t("kpiContractsNone")
            }
            accentColor="text-orange-600 dark:text-orange-400"
            iconColor="text-orange-500/70 dark:text-orange-400/60"
            isAlert={kpis.expiringContractsCount > 0}
          />
        </div>
      )}

      {/* KPI Cards Row 2: Financial */}
      {kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title={t("kpiOpenInvoices")}
            value={kpis.openInvoicesCount}
            icon={Receipt}
            description={formatCurrency(parseFloat(kpis.openInvoicesAmount))}
            accentColor="text-amber-600 dark:text-amber-400"
            iconColor="text-amber-500/70 dark:text-amber-400/60"
            isAlert={kpis.openInvoicesCount > 0}
          />
          <KPICard
            title={t("kpiPaidMonth")}
            value={formatCurrency(parseFloat(kpis.paidThisMonth))}
            icon={CreditCard}
            trend={kpis.trends.revenue}
            accentColor="text-green-600 dark:text-green-400"
            iconColor="text-green-500/70 dark:text-green-400/60"
          />
          <KPICard
            title={t("kpiDocuments")}
            value={kpis.totalDocuments}
            icon={FileText}
            description={t("kpiDocumentsDesc", { count: kpis.documentsThisMonth })}
            trend={kpis.trends.documents}
            accentColor="text-pink-600 dark:text-pink-400"
            iconColor="text-pink-500/70 dark:text-pink-400/60"
          />
          <KPICard
            title={t("kpiVotes")}
            value={kpis.activeVotes}
            icon={Vote}
            description={
              kpis.pendingVotersCount > 0
                ? t("kpiVotesPending", { count: kpis.pendingVotersCount })
                : t("kpiVotesNone")
            }
            accentColor="text-indigo-600 dark:text-indigo-400"
            iconColor="text-indigo-500/70 dark:text-indigo-400/60"
          />
        </div>
      )}

      {/* Charts Row 1: Financial */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-[300px]">
          <MonthlyInvoicesChart
            data={charts?.monthlyInvoices ?? []}
            isLoading={analytics.isLoading}
          />
        </div>
        <div className="h-[300px]">
          <CapitalDevelopmentChart
            data={charts?.capitalDevelopment ?? []}
            isLoading={analytics.isLoading}
          />
        </div>
      </div>

      {/* Charts Row 2: Documents + Energy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-[300px]">
          <DocumentsByTypeChart
            data={charts?.documentsByType ?? []}
            isLoading={analytics.isLoading}
          />
        </div>
        <div className="h-[300px]">
          <TurbineStatusChart />
        </div>
      </div>

      {/* Charts Row 3: Production + Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-[350px]">
          <ProductionForecastChart />
        </div>
        <div className="h-[350px]">
          <RevenueByParkChart />
        </div>
      </div>
    </div>
  );
}
