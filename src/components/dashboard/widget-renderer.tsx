"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Building2,
  Zap,
  Users,
  Euro,
  FileText,
  FileWarning,
  FolderOpen,
  Vote,
} from "lucide-react";
import dynamic from "next/dynamic";
import { WidgetWrapper } from "./widget-wrapper";
import { KPICard, KPI_ACCENT_COLORS, KPI_ICON_COLORS } from "./kpi-card";

// Lazy-load Recharts-based widgets — Recharts is ~500KB gzipped and only
// needed when these specific widgets are actually rendered on the dashboard.
const MonthlyInvoicesChart = dynamic(
  () => import("./analytics-charts").then((mod) => mod.MonthlyInvoicesChart),
  { ssr: false }
);
const CapitalDevelopmentChart = dynamic(
  () => import("./analytics-charts").then((mod) => mod.CapitalDevelopmentChart),
  { ssr: false }
);
const DocumentsByTypeChart = dynamic(
  () => import("./analytics-charts").then((mod) => mod.DocumentsByTypeChart),
  { ssr: false }
);
import {
  DeadlinesWidget,
  ActivitiesWidget,
  WeatherWidget,
  ExpiringContractsWidget,
  QuickActionsWidget,
  SystemStatusWidget,
  UserStatsWidget,
  PendingActionsWidget,
  AuditLogWidget,
  BillingJobsWidget,
  WebhookStatusWidget,
  EnergyYieldKPI,
  AvailabilityKPI,
  WindSpeedKPI,
  LeaseRevenueKPI,
  TurbineStatusChart,
  ProductionForecastChart,
  RevenueByParkChart,
  LeaseOverviewWidget,
  BudgetVarianceKPI,
  WirtschaftsplanPLChart,
} from "./widgets";
import { RecentlyVisitedWidget } from "./widgets/recently-visited-widget";
import { useAnalytics, useFormatCurrencyCompact } from "@/hooks/useAnalytics";
import type { AvailableWidget } from "@/hooks/useDashboardConfig";

// =============================================================================
// TYPES
// =============================================================================

interface WidgetRendererProps {
  widgetId: string;
  isEditing?: boolean;
  onRemove?: () => void;
  availableWidgets?: AvailableWidget[];
}

// =============================================================================
// WIDGET TITLE KEYS (mapped to dashboard.widget.* i18n keys)
// =============================================================================

const WIDGET_TITLE_KEYS: Record<string, string> = {
  "kpi-parks": "parks",
  "kpi-turbines": "turbines",
  "kpi-shareholders": "shareholders",
  "kpi-fund-capital": "fundCapital",
  "kpi-open-invoices": "openInvoices",
  "kpi-contracts": "contracts",
  "kpi-documents": "documents",
  "kpi-votes": "votes",
  "chart-monthly-invoices": "monthlyInvoices",
  "chart-capital-development": "capitalDevelopment",
  "chart-documents-by-type": "documentsByType",
  "list-expiring-contracts": "expiringContracts",
  "list-deadlines": "deadlines",
  "list-activities": "activities",
  "list-pending-actions": "pendingActions",
  "weather-widget": "weather",
  "quick-actions": "quickActions",
  "admin-system-status": "systemStatus",
  "admin-user-stats": "userStats",
  "admin-webhook-status": "webhookStatus",
  "kpi-energy-yield": "energyYield",
  "kpi-availability": "availability",
  "kpi-wind-speed": "windSpeed",
  "kpi-lease-revenue": "leaseRevenue",
  "chart-turbine-status": "turbineStatus",
  "chart-production-forecast": "productionForecast",
  "chart-revenue-by-park": "revenueByPark",
  "list-lease-overview": "leaseOverview",
  "list-recently-visited": "recentlyVisited",
  "kpi-budget-variance": "budgetVariance",
  "chart-wirtschaftsplan-pl": "wirtschaftsplanPL",
};

// =============================================================================
// WIDGET HREF TARGETS — where each KPI card navigates to on click
// =============================================================================

const WIDGET_HREFS: Record<string, string> = {
  "kpi-parks": "/parks",
  "kpi-turbines": "/parks",
  "kpi-shareholders": "/funds",
  "kpi-fund-capital": "/funds",
  "kpi-open-invoices": "/invoices",
  "kpi-contracts": "/contracts",
  "kpi-documents": "/documents",
  "kpi-votes": "/votes",
  "kpi-energy-yield": "/energy",
  "kpi-availability": "/energy",
  "kpi-wind-speed": "/energy",
  "kpi-lease-revenue": "/leases",
  "kpi-budget-variance": "/wirtschaftsplan",
};

// =============================================================================
// WIDGET RENDERER COMPONENT
// =============================================================================

export function WidgetRenderer({
  widgetId,
  isEditing = false,
  onRemove,
  availableWidgets,
}: WidgetRendererProps) {
  const { data, isLoading, error } = useAnalytics();
  const formatCurrency = useFormatCurrencyCompact();
  const t = useTranslations("dashboard");

  const kpis = data?.kpis ?? null;
  const charts = data?.charts ?? null;

  // Get widget title via i18n
  const widgetTitle = useMemo(() => {
    if (availableWidgets) {
      const widget = availableWidgets.find((w) => w.id === widgetId);
      if (widget) return widget.name;
    }
    const titleKey = WIDGET_TITLE_KEYS[widgetId];
    if (titleKey) return t(`widget.${titleKey}`);
    return widgetId;
  }, [widgetId, availableWidgets, t]);

  // Render the appropriate widget content based on widgetId
  const renderWidgetContent = () => {
    // KPI Widgets
    if (widgetId === "kpi-parks") {
      return (
        <KPICard
          title={t("widget.parks")}
          value={kpis ? `${kpis.activeParks} ${t("widget.active")}` : "-"}
          icon={Building2}
          description={kpis ? `${kpis.totalParks} ${t("widget.totalSuffix")}` : undefined}
          isLoading={isLoading}
          accentColor={KPI_ACCENT_COLORS[widgetId]}
          iconColor={KPI_ICON_COLORS[widgetId]}
          href={WIDGET_HREFS[widgetId]}
        />
      );
    }

    if (widgetId === "kpi-turbines") {
      return (
        <KPICard
          title={t("widget.turbines")}
          value={kpis ? `${kpis.totalTurbines} ${t("widget.totalSuffix")}` : "-"}
          icon={Zap}
          description={
            kpis
              ? kpis.turbinesInMaintenance > 0
                ? `${kpis.turbinesInMaintenance} ${t("widget.inMaintenance")}`
                : `${kpis.totalCapacityMW} MW ${t("widget.power")}`
              : undefined
          }
          isLoading={isLoading}
          isAlert={kpis ? kpis.turbinesInMaintenance > 0 : false}
          accentColor={KPI_ACCENT_COLORS[widgetId]}
          iconColor={KPI_ICON_COLORS[widgetId]}
          href={WIDGET_HREFS[widgetId]}
        />
      );
    }

    if (widgetId === "kpi-shareholders") {
      return (
        <KPICard
          title={t("widget.shareholders")}
          value={kpis ? kpis.totalShareholders : "-"}
          icon={Users}
          trend={kpis?.trends.shareholders}
          trendLabel={t("widget.vsLastMonth")}
          isLoading={isLoading}
          accentColor={KPI_ACCENT_COLORS[widgetId]}
          iconColor={KPI_ICON_COLORS[widgetId]}
          href={WIDGET_HREFS[widgetId]}
        />
      );
    }

    if (widgetId === "kpi-fund-capital") {
      return (
        <KPICard
          title={t("widget.fundCapital")}
          value={kpis ? formatCurrency(kpis.totalFundCapital) : "-"}
          icon={Euro}
          trend={kpis?.trends.revenue}
          trendLabel={t("widget.revenueVsLastMonth")}
          isLoading={isLoading}
          accentColor={KPI_ACCENT_COLORS[widgetId]}
          iconColor={KPI_ICON_COLORS[widgetId]}
          href={WIDGET_HREFS[widgetId]}
        />
      );
    }

    if (widgetId === "kpi-open-invoices") {
      return (
        <KPICard
          title={t("widget.openInvoices")}
          value={kpis ? formatCurrency(kpis.openInvoicesAmount) : "-"}
          icon={FileText}
          description={kpis ? `${kpis.openInvoicesCount} ${t("widget.pending")}` : undefined}
          isLoading={isLoading}
          isAlert={kpis ? kpis.openInvoicesCount > 10 : false}
          accentColor={KPI_ACCENT_COLORS[widgetId]}
          iconColor={KPI_ICON_COLORS[widgetId]}
          href={WIDGET_HREFS[widgetId]}
        />
      );
    }

    if (widgetId === "kpi-contracts") {
      return (
        <KPICard
          title={t("widget.contracts")}
          value={
            kpis
              ? kpis.expiringContractsCount > 0
                ? `${kpis.expiringContractsCount} ${t("widget.expiring")}`
                : `${kpis.activeContractsCount} ${t("widget.active")}`
              : "-"
          }
          icon={FileWarning}
          description={
            kpis ? `${kpis.activeContractsCount} ${t("widget.activeContracts")}` : undefined
          }
          isLoading={isLoading}
          isAlert={kpis ? kpis.expiringContractsCount > 0 : false}
          trendLabel={
            kpis && kpis.expiringContractsCount > 0
              ? t("widget.next30Days")
              : undefined
          }
          accentColor={KPI_ACCENT_COLORS[widgetId]}
          iconColor={KPI_ICON_COLORS[widgetId]}
          href={WIDGET_HREFS[widgetId]}
        />
      );
    }

    if (widgetId === "kpi-documents") {
      return (
        <KPICard
          title={t("widget.documents")}
          value={kpis ? `${kpis.totalDocuments} ${t("widget.totalSuffix")}` : "-"}
          icon={FolderOpen}
          description={kpis ? `+${kpis.documentsThisMonth} ${t("widget.thisMonth")}` : undefined}
          trend={kpis?.trends.documents}
          isLoading={isLoading}
          accentColor={KPI_ACCENT_COLORS[widgetId]}
          iconColor={KPI_ICON_COLORS[widgetId]}
          href={WIDGET_HREFS[widgetId]}
        />
      );
    }

    if (widgetId === "kpi-votes") {
      return (
        <KPICard
          title={t("widget.votes")}
          value={kpis ? `${kpis.activeVotes} ${t("widget.active")}` : "-"}
          icon={Vote}
          description={
            kpis
              ? kpis.pendingVotersCount > 0
                ? `${kpis.pendingVotersCount} ${t("widget.openVotes")}`
                : t("widget.allVoted")
              : undefined
          }
          isLoading={isLoading}
          isAlert={kpis ? kpis.pendingVotersCount > 5 : false}
          accentColor={KPI_ACCENT_COLORS[widgetId]}
          iconColor={KPI_ICON_COLORS[widgetId]}
          href={WIDGET_HREFS[widgetId]}
        />
      );
    }

    // Chart Widgets
    if (widgetId === "chart-monthly-invoices") {
      return (
        <MonthlyInvoicesChart
          data={charts?.monthlyInvoices || []}
          isLoading={isLoading}
        />
      );
    }

    if (widgetId === "chart-capital-development") {
      return (
        <CapitalDevelopmentChart
          data={charts?.capitalDevelopment || []}
          isLoading={isLoading}
        />
      );
    }

    if (widgetId === "chart-documents-by-type") {
      return (
        <DocumentsByTypeChart
          data={charts?.documentsByType || []}
          isLoading={isLoading}
        />
      );
    }

    // List Widgets
    if (widgetId === "list-expiring-contracts") {
      return (
        <WidgetWrapper
          title={widgetTitle}
          isEditing={isEditing}
          onRemove={onRemove}
        >
          <ExpiringContractsWidget />
        </WidgetWrapper>
      );
    }

    if (widgetId === "list-deadlines") {
      return (
        <WidgetWrapper
          title={widgetTitle}
          isEditing={isEditing}
          onRemove={onRemove}
        >
          <DeadlinesWidget />
        </WidgetWrapper>
      );
    }

    if (widgetId === "list-activities") {
      return (
        <WidgetWrapper
          title={widgetTitle}
          isEditing={isEditing}
          onRemove={onRemove}
        >
          <ActivitiesWidget />
        </WidgetWrapper>
      );
    }

    // Pending Actions Widget
    if (widgetId === "list-pending-actions") {
      return (
        <WidgetWrapper
          title={widgetTitle}
          isEditing={isEditing}
          onRemove={onRemove}
        >
          <PendingActionsWidget />
        </WidgetWrapper>
      );
    }

    // Recently Visited Widget
    if (widgetId === "list-recently-visited") {
      return (
        <WidgetWrapper
          title={widgetTitle}
          isEditing={isEditing}
          onRemove={onRemove}
        >
          <RecentlyVisitedWidget />
        </WidgetWrapper>
      );
    }

    // Weather Widget
    if (widgetId === "weather-widget") {
      return (
        <WidgetWrapper
          title={widgetTitle}
          isEditing={isEditing}
          onRemove={onRemove}
        >
          <WeatherWidget />
        </WidgetWrapper>
      );
    }

    // Quick Actions Widget
    if (widgetId === "quick-actions") {
      return (
        <WidgetWrapper
          title={widgetTitle}
          isEditing={isEditing}
          onRemove={onRemove}
        >
          <QuickActionsWidget />
        </WidgetWrapper>
      );
    }

    // Admin Widgets
    if (widgetId === "admin-system-status") {
      return (
        <WidgetWrapper
          title={widgetTitle}
          isEditing={isEditing}
          onRemove={onRemove}
        >
          <SystemStatusWidget />
        </WidgetWrapper>
      );
    }

    if (widgetId === "admin-user-stats") {
      return (
        <WidgetWrapper
          title={widgetTitle}
          isEditing={isEditing}
          onRemove={onRemove}
        >
          <UserStatsWidget />
        </WidgetWrapper>
      );
    }

    if (widgetId === "admin-audit-log") {
      return (
        <WidgetWrapper
          title={widgetTitle}
          isEditing={isEditing}
          onRemove={onRemove}
        >
          <AuditLogWidget />
        </WidgetWrapper>
      );
    }

    if (widgetId === "admin-billing-jobs") {
      return (
        <WidgetWrapper
          title={widgetTitle}
          isEditing={isEditing}
          onRemove={onRemove}
        >
          <BillingJobsWidget />
        </WidgetWrapper>
      );
    }

    if (widgetId === "admin-webhook-status") {
      return (
        <WidgetWrapper
          title={widgetTitle}
          isEditing={isEditing}
          onRemove={onRemove}
        >
          <WebhookStatusWidget />
        </WidgetWrapper>
      );
    }

    // Energy KPI Widgets
    if (widgetId === "kpi-energy-yield") {
      return (
        <WidgetWrapper title={widgetTitle} isEditing={isEditing} onRemove={onRemove}>
          <EnergyYieldKPI />
        </WidgetWrapper>
      );
    }

    if (widgetId === "kpi-availability") {
      return (
        <WidgetWrapper title={widgetTitle} isEditing={isEditing} onRemove={onRemove}>
          <AvailabilityKPI />
        </WidgetWrapper>
      );
    }

    if (widgetId === "kpi-wind-speed") {
      return (
        <WidgetWrapper title={widgetTitle} isEditing={isEditing} onRemove={onRemove}>
          <WindSpeedKPI />
        </WidgetWrapper>
      );
    }

    if (widgetId === "kpi-lease-revenue") {
      return (
        <WidgetWrapper title={widgetTitle} isEditing={isEditing} onRemove={onRemove}>
          <LeaseRevenueKPI />
        </WidgetWrapper>
      );
    }

    // Energy Chart Widgets (standalone - own card structure)
    if (widgetId === "chart-turbine-status") {
      return <TurbineStatusChart />;
    }

    if (widgetId === "chart-production-forecast") {
      return <ProductionForecastChart />;
    }

    if (widgetId === "chart-revenue-by-park") {
      return <RevenueByParkChart />;
    }

    // Energy List Widget
    if (widgetId === "list-lease-overview") {
      return (
        <WidgetWrapper
          title={widgetTitle}
          isEditing={isEditing}
          onRemove={onRemove}
        >
          <LeaseOverviewWidget />
        </WidgetWrapper>
      );
    }

    // Wirtschaftsplan Widgets
    if (widgetId === "kpi-budget-variance") {
      return (
        <WidgetWrapper title={widgetTitle} isEditing={isEditing} onRemove={onRemove}>
          <BudgetVarianceKPI />
        </WidgetWrapper>
      );
    }

    if (widgetId === "chart-wirtschaftsplan-pl") {
      return <WirtschaftsplanPLChart />;
    }

    // Unknown Widget
    return (
      <WidgetWrapper
        title={widgetTitle}
        isEditing={isEditing}
        onRemove={onRemove}
        error={t("widget.notFound", { widgetId })}
      >
        <div />
      </WidgetWrapper>
    );
  };

  // For KPI and Chart widgets that already have their own card structure,
  // we wrap them differently based on edit mode
  const isStandaloneWidget = widgetId.startsWith("kpi-") || widgetId.startsWith("chart-");

  // Show error state for analytics-dependent widgets when the API fails
  if (error && !isLoading && isStandaloneWidget) {
    return (
      <WidgetWrapper
        title={widgetTitle}
        isEditing={isEditing}
        onRemove={onRemove}
        error={t("widget.loadError")}
      >
        <div />
      </WidgetWrapper>
    );
  }

  if (isStandaloneWidget) {
    const content = renderWidgetContent();

    if (isEditing) {
      // In edit mode, wrap in WidgetWrapper for edit controls
      return (
        <div className="h-full relative group">
          <div className="h-full">{content}</div>
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90 z-10"
              title={t("widget.remove")}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
        </div>
      );
    }

    return content;
  }

  return renderWidgetContent();
}

// =============================================================================
// WIDGET PREVIEW (for sidebar)
// =============================================================================

interface WidgetPreviewProps {
  widget: AvailableWidget;
  className?: string;
}

export function WidgetPreview({ widget, className }: WidgetPreviewProps) {
  return (
    <div
      className={`p-3 border rounded-lg bg-card hover:bg-accent/50 cursor-grab transition-colors ${className}`}
    >
      <p className="font-medium text-sm">{widget.name}</p>
      <p className="text-xs text-muted-foreground mt-1">{widget.description}</p>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="px-2 py-0.5 bg-muted rounded">
          {widget.defaultSize.w}x{widget.defaultSize.h}
        </span>
      </div>
    </div>
  );
}
