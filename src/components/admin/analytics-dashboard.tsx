"use client";

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
import {
  MonthlyInvoicesChart,
  CapitalDevelopmentChart,
  DocumentsByTypeChart,
} from "@/components/dashboard/analytics-charts";
import {
  TurbineStatusChart,
  ProductionForecastChart,
  RevenueByParkChart,
} from "@/components/dashboard/widgets/energy-widgets";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useEnergyDashboard } from "@/hooks/useEnergyDashboard";
import { formatCurrency } from "@/lib/format";

// =============================================================================
// Component
// =============================================================================

export function AnalyticsDashboard() {
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
        Lade Analytics-Daten...
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p>{analytics.error || energy.error}</p>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          Erneut versuchen
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
            `Stand: ${new Date(analytics.data.generatedAt).toLocaleString("de-DE")}`}
        </span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => analytics.clearCache()}
            className="h-7 text-xs"
          >
            Cache leeren
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            className="h-7 text-xs"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Aktualisieren
          </Button>
        </div>
      </div>

      {/* KPI Cards Row 1: Infrastructure */}
      {kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Windparks"
            value={`${kpis.activeParks} / ${kpis.totalParks}`}
            icon={Building2}
            description={`${kpis.totalCapacityMW} MW Gesamtleistung`}
            accentColor="text-cyan-600 dark:text-cyan-400"
            iconColor="text-cyan-500/40 dark:text-cyan-400/30"
          />
          <KPICard
            title="Turbinen"
            value={kpis.totalTurbines}
            icon={Wind}
            description={`${kpis.turbinesInMaintenance} in Wartung`}
            accentColor="text-slate-600 dark:text-slate-400"
            iconColor="text-slate-500/40 dark:text-slate-400/30"
            isAlert={kpis.turbinesInMaintenance > 0}
          />
          <KPICard
            title="Kapazität"
            value={`${kpis.totalCapacityMW} MW`}
            icon={Gauge}
            description={`Ø ${kpis.averageTurbineAge.toFixed(1)} Jahre Alter`}
            accentColor="text-emerald-600 dark:text-emerald-400"
            iconColor="text-emerald-500/40 dark:text-emerald-400/30"
          />
          <KPICard
            title="Verträge"
            value={kpis.activeContractsCount}
            icon={ScrollText}
            description={
              kpis.expiringContractsCount > 0
                ? `${kpis.expiringContractsCount} laufen bald aus`
                : "Keine auslaufend"
            }
            accentColor="text-orange-600 dark:text-orange-400"
            iconColor="text-orange-500/40 dark:text-orange-400/30"
            isAlert={kpis.expiringContractsCount > 0}
          />
        </div>
      )}

      {/* KPI Cards Row 2: Financial */}
      {kpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Offene Rechnungen"
            value={kpis.openInvoicesCount}
            icon={Receipt}
            description={formatCurrency(parseFloat(kpis.openInvoicesAmount))}
            accentColor="text-amber-600 dark:text-amber-400"
            iconColor="text-amber-500/40 dark:text-amber-400/30"
            isAlert={kpis.openInvoicesCount > 0}
          />
          <KPICard
            title="Bezahlt (Monat)"
            value={formatCurrency(parseFloat(kpis.paidThisMonth))}
            icon={CreditCard}
            trend={kpis.trends.revenue}
            accentColor="text-green-600 dark:text-green-400"
            iconColor="text-green-500/40 dark:text-green-400/30"
          />
          <KPICard
            title="Dokumente"
            value={kpis.totalDocuments}
            icon={FileText}
            description={`${kpis.documentsThisMonth} diesen Monat`}
            trend={kpis.trends.documents}
            accentColor="text-pink-600 dark:text-pink-400"
            iconColor="text-pink-500/40 dark:text-pink-400/30"
          />
          <KPICard
            title="Abstimmungen"
            value={kpis.activeVotes}
            icon={Vote}
            description={
              kpis.pendingVotersCount > 0
                ? `${kpis.pendingVotersCount} ausstehende Stimmen`
                : "Keine offenen"
            }
            accentColor="text-indigo-600 dark:text-indigo-400"
            iconColor="text-indigo-500/40 dark:text-indigo-400/30"
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
