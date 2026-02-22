"use client";

import { useMemo } from "react";
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
import { WidgetWrapper } from "./widget-wrapper";
import { KPICard } from "./kpi-card";
import {
  MonthlyInvoicesChart,
  CapitalDevelopmentChart,
  DocumentsByTypeChart,
} from "./analytics-charts";
import {
  DeadlinesWidget,
  ActivitiesWidget,
  WeatherWidget,
  ExpiringContractsWidget,
  QuickActionsWidget,
  SystemStatusWidget,
  UserStatsWidget,
  PendingActionsWidget,
} from "./widgets";
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
// WIDGET TITLES MAP
// =============================================================================

const WIDGET_TITLES: Record<string, string> = {
  "kpi-parks": "Windparks",
  "kpi-turbines": "Turbinen",
  "kpi-shareholders": "Gesellschafter",
  "kpi-fund-capital": "Gesellschaftskapital",
  "kpi-open-invoices": "Offene Rechnungen",
  "kpi-contracts": "Vertraege",
  "kpi-documents": "Dokumente",
  "kpi-votes": "Abstimmungen",
  "chart-monthly-invoices": "Rechnungen pro Monat",
  "chart-capital-development": "Kapitalentwicklung",
  "chart-documents-by-type": "Dokumente nach Typ",
  "list-expiring-contracts": "Auslaufende Vertraege",
  "list-deadlines": "Anstehende Fristen",
  "list-activities": "Letzte Aktivitaeten",
  "list-pending-actions": "Handlungsbedarf",
  "weather-widget": "Wetter",
  "quick-actions": "Schnellzugriff",
  "admin-system-status": "System-Status",
  "admin-user-stats": "Benutzer-Statistiken",
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

  const kpis = data?.kpis ?? null;
  const charts = data?.charts ?? null;

  // Get widget title
  const widgetTitle = useMemo(() => {
    if (availableWidgets) {
      const widget = availableWidgets.find((w) => w.id === widgetId);
      if (widget) return widget.name;
    }
    return WIDGET_TITLES[widgetId] || widgetId;
  }, [widgetId, availableWidgets]);

  // Render the appropriate widget content based on widgetId
  const renderWidgetContent = () => {
    // KPI Widgets
    if (widgetId === "kpi-parks") {
      return (
        <KPICard
          title="Windparks"
          value={kpis ? `${kpis.activeParks} aktiv` : "-"}
          icon={Building2}
          description={kpis ? `${kpis.totalParks} total` : undefined}
          isLoading={isLoading}
        />
      );
    }

    if (widgetId === "kpi-turbines") {
      return (
        <KPICard
          title="Turbinen"
          value={kpis ? `${kpis.totalTurbines} total` : "-"}
          icon={Zap}
          description={
            kpis
              ? kpis.turbinesInMaintenance > 0
                ? `${kpis.turbinesInMaintenance} in Wartung`
                : `${kpis.totalCapacityMW} MW Leistung`
              : undefined
          }
          isLoading={isLoading}
          isAlert={kpis ? kpis.turbinesInMaintenance > 0 : false}
        />
      );
    }

    if (widgetId === "kpi-shareholders") {
      return (
        <KPICard
          title="Gesellschafter"
          value={kpis ? kpis.totalShareholders : "-"}
          icon={Users}
          trend={kpis?.trends.shareholders}
          trendLabel="vs. Vormonat"
          isLoading={isLoading}
        />
      );
    }

    if (widgetId === "kpi-fund-capital") {
      return (
        <KPICard
          title="Gesellschaftskapital"
          value={kpis ? formatCurrency(kpis.totalFundCapital) : "-"}
          icon={Euro}
          trend={kpis?.trends.revenue}
          trendLabel="Einnahmen vs. Vormonat"
          isLoading={isLoading}
        />
      );
    }

    if (widgetId === "kpi-open-invoices") {
      return (
        <KPICard
          title="Offene Rechnungen"
          value={kpis ? formatCurrency(kpis.openInvoicesAmount) : "-"}
          icon={FileText}
          description={kpis ? `${kpis.openInvoicesCount} ausstehend` : undefined}
          isLoading={isLoading}
          isAlert={kpis ? kpis.openInvoicesCount > 10 : false}
        />
      );
    }

    if (widgetId === "kpi-contracts") {
      return (
        <KPICard
          title="Vertraege"
          value={
            kpis
              ? kpis.expiringContractsCount > 0
                ? `${kpis.expiringContractsCount} laufen aus`
                : `${kpis.activeContractsCount} aktiv`
              : "-"
          }
          icon={FileWarning}
          description={
            kpis ? `${kpis.activeContractsCount} aktive Vertraege` : undefined
          }
          isLoading={isLoading}
          isAlert={kpis ? kpis.expiringContractsCount > 0 : false}
          trendLabel={
            kpis && kpis.expiringContractsCount > 0
              ? "Naechste 30 Tage"
              : undefined
          }
        />
      );
    }

    if (widgetId === "kpi-documents") {
      return (
        <KPICard
          title="Dokumente"
          value={kpis ? `${kpis.totalDocuments} total` : "-"}
          icon={FolderOpen}
          description={kpis ? `+${kpis.documentsThisMonth} diesen Monat` : undefined}
          trend={kpis?.trends.documents}
          isLoading={isLoading}
        />
      );
    }

    if (widgetId === "kpi-votes") {
      return (
        <KPICard
          title="Abstimmungen"
          value={kpis ? `${kpis.activeVotes} aktiv` : "-"}
          icon={Vote}
          description={
            kpis
              ? kpis.pendingVotersCount > 0
                ? `${kpis.pendingVotersCount} offene Stimmen`
                : "Alle haben abgestimmt"
              : undefined
          }
          isLoading={isLoading}
          isAlert={kpis ? kpis.pendingVotersCount > 5 : false}
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

    // Unknown Widget
    return (
      <WidgetWrapper
        title={widgetTitle}
        isEditing={isEditing}
        onRemove={onRemove}
        error={`Widget "${widgetId}" nicht gefunden`}
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
        error="Daten konnten nicht geladen werden"
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
              title="Widget entfernen"
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
