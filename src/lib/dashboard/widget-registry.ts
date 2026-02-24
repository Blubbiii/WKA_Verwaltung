// ===========================================
// Dashboard Widget Registry
// ===========================================

import type { WidgetDefinition, WidgetCategory, MinimumRole } from "@/types/dashboard";
import { UserRole } from "@prisma/client";
import { hasMinimumRole } from "@/types/dashboard";

/**
 * All available dashboard widgets with their metadata
 */
// ===========================================
// STANDARD WIDGET SIZES (in grid units, 12-column grid)
// 1 unit width  = containerWidth / 12 (~100px at 1200px)
// 1 unit height = rowHeight (60px)
// ===========================================
// small:  3x2  (4 per row, 120px) - KPI cards
// medium: 4x5  (3 per row, 300px) - lists, small charts
// large:  6x6  (2 per row, 360px) - large charts, admin logs
// utility: 3x3 (4 per row, 180px) - weather, quick actions
// ===========================================

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  // ===========================================
  // KPI WIDGETS - Standard: 3x2 (120px height)
  // ===========================================
  {
    id: "kpi-parks",
    name: "Windparks",
    description: "Anzahl der Windparks",
    category: "kpi",
    minRole: "VIEWER",
    defaultWidth: 3,
    defaultHeight: 2,
    minWidth: 2,
    minHeight: 2,
    maxWidth: 6,
    maxHeight: 4,
    icon: "Wind",
    resizable: true,
  },
  {
    id: "kpi-turbines",
    name: "Turbinen",
    description: "Anzahl der Windturbinen",
    category: "kpi",
    minRole: "VIEWER",
    defaultWidth: 3,
    defaultHeight: 2,
    minWidth: 2,
    minHeight: 2,
    maxWidth: 6,
    maxHeight: 4,
    icon: "Fan",
    resizable: true,
  },
  {
    id: "kpi-shareholders",
    name: "Gesellschafter",
    description: "Anzahl der Gesellschafter",
    category: "kpi",
    minRole: "VIEWER",
    defaultWidth: 3,
    defaultHeight: 2,
    minWidth: 2,
    minHeight: 2,
    maxWidth: 6,
    maxHeight: 4,
    icon: "Users",
    resizable: true,
  },
  {
    id: "kpi-fund-capital",
    name: "Gesellschaftskapital",
    description: "Gesamtes Gesellschaftskapital",
    category: "kpi",
    minRole: "MANAGER",
    defaultWidth: 3,
    defaultHeight: 2,
    minWidth: 2,
    minHeight: 2,
    maxWidth: 6,
    maxHeight: 4,
    icon: "Banknote",
    resizable: true,
  },
  {
    id: "kpi-open-invoices",
    name: "Offene Rechnungen",
    description: "Anzahl und Summe offener Rechnungen",
    category: "kpi",
    minRole: "MANAGER",
    defaultWidth: 3,
    defaultHeight: 2,
    minWidth: 2,
    minHeight: 2,
    maxWidth: 6,
    maxHeight: 4,
    icon: "Receipt",
    resizable: true,
  },
  {
    id: "kpi-contracts",
    name: "Verträge",
    description: "Anzahl aktiver Verträge",
    category: "kpi",
    minRole: "VIEWER",
    defaultWidth: 3,
    defaultHeight: 2,
    minWidth: 2,
    minHeight: 2,
    maxWidth: 6,
    maxHeight: 4,
    icon: "FileText",
    resizable: true,
  },
  {
    id: "kpi-documents",
    name: "Dokumente",
    description: "Anzahl der Dokumente",
    category: "kpi",
    minRole: "VIEWER",
    defaultWidth: 3,
    defaultHeight: 2,
    minWidth: 2,
    minHeight: 2,
    maxWidth: 6,
    maxHeight: 4,
    icon: "FolderOpen",
    resizable: true,
  },
  {
    id: "kpi-votes",
    name: "Abstimmungen",
    description: "Aktive Abstimmungen",
    category: "kpi",
    minRole: "VIEWER",
    defaultWidth: 3,
    defaultHeight: 2,
    minWidth: 2,
    minHeight: 2,
    maxWidth: 6,
    maxHeight: 4,
    icon: "Vote",
    resizable: true,
  },

  // ===========================================
  // CHART WIDGETS - Standard: 6x6 (large, 360px) / 4x5 (medium, 300px)
  // ===========================================
  {
    id: "chart-monthly-invoices",
    name: "Rechnungen/Monat",
    description: "Rechnungsvolumen der letzten 12 Monate",
    category: "chart",
    minRole: "MANAGER",
    defaultWidth: 6,
    defaultHeight: 6,
    minWidth: 4,
    minHeight: 4,
    maxWidth: 12,
    maxHeight: 10,
    icon: "BarChart3",
    resizable: true,
  },
  {
    id: "chart-capital-development",
    name: "Kapitalentwicklung",
    description: "Entwicklung des Gesellschaftskapitals",
    category: "chart",
    minRole: "MANAGER",
    defaultWidth: 6,
    defaultHeight: 6,
    minWidth: 4,
    minHeight: 4,
    maxWidth: 12,
    maxHeight: 10,
    icon: "TrendingUp",
    resizable: true,
  },
  {
    id: "chart-documents-by-type",
    name: "Dokumente nach Typ",
    description: "Verteilung der Dokumente nach Kategorie",
    category: "chart",
    minRole: "VIEWER",
    defaultWidth: 4,
    defaultHeight: 5,
    minWidth: 3,
    minHeight: 4,
    maxWidth: 8,
    maxHeight: 8,
    icon: "PieChart",
    resizable: true,
  },

  // ===========================================
  // LIST WIDGETS - Standard: 4x5 (300px height)
  // ===========================================
  {
    id: "list-deadlines",
    name: "Anstehende Fristen",
    description: "Kommende Vertragsfristen und Deadlines",
    category: "list",
    minRole: "VIEWER",
    defaultWidth: 4,
    defaultHeight: 5,
    minWidth: 3,
    minHeight: 3,
    maxWidth: 8,
    maxHeight: 10,
    icon: "Calendar",
    resizable: true,
  },
  {
    id: "list-activities",
    name: "Letzte Aktivitäten",
    description: "Neueste Aktivitäten im System",
    category: "list",
    minRole: "VIEWER",
    defaultWidth: 4,
    defaultHeight: 5,
    minWidth: 3,
    minHeight: 3,
    maxWidth: 8,
    maxHeight: 10,
    icon: "Activity",
    resizable: true,
  },
  {
    id: "list-expiring-contracts",
    name: "Auslaufende Verträge",
    description: "Verträge die bald auslaufen",
    category: "list",
    minRole: "VIEWER",
    defaultWidth: 4,
    defaultHeight: 5,
    minWidth: 3,
    minHeight: 3,
    maxWidth: 8,
    maxHeight: 10,
    icon: "AlertTriangle",
    resizable: true,
  },

  {
    id: "list-pending-actions",
    name: "Handlungsbedarf",
    description: "Überfällige Rechnungen, auslaufende Verträge und offene Abrechnungen",
    category: "list",
    minRole: "MANAGER",
    defaultWidth: 4,
    defaultHeight: 5,
    minWidth: 3,
    minHeight: 3,
    maxWidth: 8,
    maxHeight: 10,
    icon: "AlertTriangle",
    resizable: true,
  },

  // ===========================================
  // UTILITY WIDGETS - Standard: 3x3 (180px height)
  // ===========================================
  {
    id: "weather-widget",
    name: "Wetter",
    description: "Aktuelle Wetterdaten für Windparks",
    category: "utility",
    minRole: "VIEWER",
    defaultWidth: 3,
    defaultHeight: 3,
    minWidth: 2,
    minHeight: 2,
    maxWidth: 6,
    maxHeight: 6,
    icon: "Cloud",
    resizable: true,
  },
  {
    id: "quick-actions",
    name: "Schnellzugriff",
    description: "Schnelle Aktionen und Links",
    category: "utility",
    minRole: "VIEWER",
    defaultWidth: 3,
    defaultHeight: 3,
    minWidth: 2,
    minHeight: 2,
    maxWidth: 6,
    maxHeight: 6,
    icon: "Zap",
    resizable: true,
  },

  // ===========================================
  // ADMIN WIDGETS - Standard: 4x5 (medium) / 6x6 (large)
  // ===========================================
  {
    id: "admin-system-status",
    name: "System-Status",
    description: "Systemstatus und Health-Checks",
    category: "admin",
    minRole: "ADMIN",
    defaultWidth: 4,
    defaultHeight: 5,
    minWidth: 3,
    minHeight: 3,
    maxWidth: 8,
    maxHeight: 8,
    icon: "Server",
    resizable: true,
  },
  {
    id: "admin-audit-log",
    name: "Audit-Log",
    description: "Letzte Audit-Log Einträge",
    category: "admin",
    minRole: "ADMIN",
    defaultWidth: 6,
    defaultHeight: 6,
    minWidth: 4,
    minHeight: 4,
    maxWidth: 12,
    maxHeight: 10,
    icon: "ScrollText",
    resizable: true,
  },
  {
    id: "admin-billing-jobs",
    name: "Billing-Jobs",
    description: "Status der automatischen Abrechnungs-Jobs",
    category: "admin",
    minRole: "SUPERADMIN",
    defaultWidth: 6,
    defaultHeight: 6,
    minWidth: 4,
    minHeight: 4,
    maxWidth: 12,
    maxHeight: 10,
    icon: "Clock",
    resizable: true,
  },

  // ===========================================
  // ENERGY WIDGETS (planned for future implementation)
  // ===========================================
  {
    id: "kpi-energy-yield",
    name: "Energieertrag",
    description: "Gesamter Energieertrag in MWh",
    category: "kpi",
    minRole: "VIEWER",
    defaultWidth: 3,
    defaultHeight: 2,
    minWidth: 2,
    minHeight: 2,
    maxWidth: 6,
    maxHeight: 4,
    icon: "Zap",
    resizable: true,
  },
  {
    id: "kpi-availability",
    name: "Verfügbarkeit",
    description: "Durchschnittliche Anlagenverfügbarkeit in %",
    category: "kpi",
    minRole: "VIEWER",
    defaultWidth: 3,
    defaultHeight: 2,
    minWidth: 2,
    minHeight: 2,
    maxWidth: 6,
    maxHeight: 4,
    icon: "Activity",
    resizable: true,
  },
  {
    id: "kpi-wind-speed",
    name: "Windgeschwindigkeit",
    description: "Aktuelle mittlere Windgeschwindigkeit",
    category: "kpi",
    minRole: "VIEWER",
    defaultWidth: 3,
    defaultHeight: 2,
    minWidth: 2,
    minHeight: 2,
    maxWidth: 6,
    maxHeight: 4,
    icon: "Wind",
    resizable: true,
  },
  {
    id: "kpi-lease-revenue",
    name: "Pachteinnahmen",
    description: "Aktuelle Pachteinnahmen und Vorschüsse",
    category: "kpi",
    minRole: "MANAGER",
    defaultWidth: 3,
    defaultHeight: 2,
    minWidth: 2,
    minHeight: 2,
    maxWidth: 6,
    maxHeight: 4,
    icon: "Landmark",
    resizable: true,
  },
  {
    id: "chart-turbine-status",
    name: "Turbinen-Status",
    description: "Verteilung der Turbinenstatus als Donut-Chart",
    category: "chart",
    minRole: "VIEWER",
    defaultWidth: 4,
    defaultHeight: 5,
    minWidth: 3,
    minHeight: 4,
    maxWidth: 8,
    maxHeight: 8,
    icon: "PieChart",
    resizable: true,
  },
  {
    id: "chart-production-forecast",
    name: "Produktion vs. Prognose",
    description: "Tatsächliche Produktion im Vergleich zur Prognose",
    category: "chart",
    minRole: "MANAGER",
    defaultWidth: 6,
    defaultHeight: 6,
    minWidth: 4,
    minHeight: 4,
    maxWidth: 12,
    maxHeight: 10,
    icon: "TrendingUp",
    resizable: true,
  },
  {
    id: "chart-revenue-by-park",
    name: "Erlöse nach Park",
    description: "Erlösverteilung über alle Windparks",
    category: "chart",
    minRole: "MANAGER",
    defaultWidth: 6,
    defaultHeight: 6,
    minWidth: 4,
    minHeight: 4,
    maxWidth: 12,
    maxHeight: 10,
    icon: "BarChart3",
    resizable: true,
  },
  {
    id: "list-lease-overview",
    name: "Pachtübersicht",
    description: "Aktuelle Pachtverhältnisse und anstehende Zahlungen",
    category: "list",
    minRole: "MANAGER",
    defaultWidth: 4,
    defaultHeight: 5,
    minWidth: 3,
    minHeight: 3,
    maxWidth: 8,
    maxHeight: 10,
    icon: "Landmark",
    resizable: true,
  },
];

/**
 * Widget categories with display names
 */
export const WIDGET_CATEGORIES: {
  id: WidgetCategory;
  name: string;
  description: string;
}[] = [
  {
    id: "kpi",
    name: "KPIs",
    description: "Kennzahlen und Statistiken",
  },
  {
    id: "chart",
    name: "Charts",
    description: "Diagramme und Visualisierungen",
  },
  {
    id: "list",
    name: "Listen",
    description: "Tabellen und Auflistungen",
  },
  {
    id: "utility",
    name: "Werkzeuge",
    description: "Nützliche Widgets und Schnellzugriffe",
  },
  {
    id: "admin",
    name: "Administration",
    description: "Widgets für Administratoren",
  },
];

/**
 * Get a widget definition by ID
 */
export function getWidgetById(id: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY.find((w) => w.id === id);
}

/**
 * Get all widgets available for a specific user role
 */
export function getWidgetsForRole(role: UserRole): WidgetDefinition[] {
  return WIDGET_REGISTRY.filter((widget) =>
    hasMinimumRole(role, widget.minRole)
  );
}

/**
 * Get widgets grouped by category for a specific role
 */
export function getWidgetsByCategory(
  role: UserRole
): Record<WidgetCategory, WidgetDefinition[]> {
  const availableWidgets = getWidgetsForRole(role);

  return availableWidgets.reduce((acc, widget) => {
    if (!acc[widget.category]) {
      acc[widget.category] = [];
    }
    acc[widget.category].push(widget);
    return acc;
  }, {} as Record<WidgetCategory, WidgetDefinition[]>);
}

/**
 * Validate widget IDs against the registry
 * Returns invalid widget IDs
 */
export function validateWidgetIds(ids: string[]): string[] {
  const validIds = new Set(WIDGET_REGISTRY.map((w) => w.id));
  return ids.filter((id) => !validIds.has(id));
}

/**
 * Filter widget IDs to only include those available for a role
 */
export function filterWidgetsByRole(ids: string[], role: UserRole): string[] {
  const availableIds = new Set(getWidgetsForRole(role).map((w) => w.id));
  return ids.filter((id) => availableIds.has(id));
}

/**
 * Check if a widget is available for a specific role
 */
export function isWidgetAvailable(widgetId: string, role: UserRole): boolean {
  const widget = getWidgetById(widgetId);
  if (!widget) return false;
  return hasMinimumRole(role, widget.minRole);
}
