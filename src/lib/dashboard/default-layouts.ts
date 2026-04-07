// ===========================================
// Default Dashboard Layouts per Role
// ===========================================

import type { DashboardConfig, DashboardWidget, UserRole } from "@/types/dashboard";
import { getWidgetById, getWidgetsForRole } from "./widget-registry";

// ===========================================
// Standard Grid Sizes (12-column grid, rowHeight=60px):
//   KPI:     3×2  — 1 Kachel  (4 per row, ~120px tall)
//   utility: 3×2  — 1 Kachel  (weather, quick-actions)
//   medium:  6×4  — 2×2 Kacheln (2 per row, ~240px tall)
//   large:   6×6  — 2×3 Kacheln (2 per row, ~360px tall)
//
// Layout rules:
//   - x values are multiples of 3  (aligns to Kachel columns)
//   - y values are multiples of 2  (aligns to Kachel rows)
//   - 2-row gap (120px) between widget groups for visual breathing room
//   - compactType=null → tiles stay exactly where placed; gaps are intentional
// ===========================================

/**
 * Default dashboard layout for VIEWER role
 */
export const VIEWER_DEFAULT_LAYOUT: DashboardWidget[] = [
  // Group 1 — KPIs (y=0, h=2 → ends at y=2)
  { id: "kpi-parks",     x: 0, y: 0, w: 3, h: 2 },
  { id: "kpi-turbines",  x: 3, y: 0, w: 3, h: 2 },
  { id: "kpi-contracts", x: 6, y: 0, w: 3, h: 2 },
  { id: "kpi-documents", x: 9, y: 0, w: 3, h: 2 },

  // Group 2 — Charts & Lists  (gap at y=2-3, starts at y=4, h=4 → ends at y=8)
  { id: "chart-documents-by-type", x: 0, y: 4, w: 6, h: 4 },
  { id: "list-activities",         x: 6, y: 4, w: 6, h: 4 },

  // Group 3 — More content  (gap at y=8-9, starts at y=10)
  { id: "list-deadlines", x: 0, y: 10, w: 6, h: 4 },
  { id: "quick-actions",  x: 6, y: 10, w: 3, h: 2 },
];

/**
 * Default dashboard layout for MANAGER role
 */
export const MANAGER_DEFAULT_LAYOUT: DashboardWidget[] = [
  // Group 1 — KPIs  (y=0-3, ends at y=4)
  { id: "kpi-parks",          x: 0, y: 0, w: 3, h: 2 },
  { id: "kpi-turbines",       x: 3, y: 0, w: 3, h: 2 },
  { id: "kpi-shareholders",   x: 6, y: 0, w: 3, h: 2 },
  { id: "kpi-fund-capital",   x: 9, y: 0, w: 3, h: 2 },
  { id: "kpi-open-invoices",  x: 0, y: 2, w: 3, h: 2 },
  { id: "kpi-contracts",      x: 3, y: 2, w: 3, h: 2 },
  { id: "kpi-budget-variance",x: 6, y: 2, w: 3, h: 2 },
  { id: "quick-actions",      x: 9, y: 2, w: 3, h: 2 },

  // Group 2 — Large Charts  (gap at y=4-5, starts at y=6, h=6 → ends at y=12)
  { id: "chart-production-forecast", x: 0, y: 6, w: 6, h: 6 },
  { id: "chart-turbine-status",      x: 6, y: 6, w: 6, h: 6 },

  // Group 3 — Lists & P&L  (gap at y=12-13, starts at y=14)
  { id: "list-deadlines",          x: 0, y: 14, w: 6, h: 4 },
  { id: "list-expiring-contracts", x: 6, y: 14, w: 6, h: 4 },
  { id: "list-activities",         x: 0, y: 18, w: 6, h: 4 },
  { id: "chart-wirtschaftsplan-pl",x: 6, y: 18, w: 6, h: 4 },
];

/**
 * Default dashboard layout for ADMIN role
 * All manager widgets + admin system widgets
 */
export const ADMIN_DEFAULT_LAYOUT: DashboardWidget[] = [
  // Group 1 — KPIs  (y=0-3, ends at y=4)
  { id: "kpi-parks",          x: 0, y: 0, w: 3, h: 2 },
  { id: "kpi-turbines",       x: 3, y: 0, w: 3, h: 2 },
  { id: "kpi-shareholders",   x: 6, y: 0, w: 3, h: 2 },
  { id: "kpi-fund-capital",   x: 9, y: 0, w: 3, h: 2 },
  { id: "kpi-open-invoices",  x: 0, y: 2, w: 3, h: 2 },
  { id: "kpi-contracts",      x: 3, y: 2, w: 3, h: 2 },
  { id: "kpi-budget-variance",x: 6, y: 2, w: 3, h: 2 },
  { id: "quick-actions",      x: 9, y: 2, w: 3, h: 2 },

  // Group 2 — Large Charts  (gap at y=4-5, starts at y=6, h=6 → ends at y=12)
  { id: "chart-monthly-invoices",    x: 0, y: 6, w: 6, h: 6 },
  { id: "chart-capital-development", x: 6, y: 6, w: 6, h: 6 },

  // Group 3 — Lists & P&L  (gap at y=12-13, starts at y=14)
  { id: "list-deadlines",          x: 0, y: 14, w: 6, h: 4 },
  { id: "list-expiring-contracts", x: 6, y: 14, w: 6, h: 4 },
  { id: "list-activities",         x: 0, y: 18, w: 6, h: 4 },
  { id: "chart-wirtschaftsplan-pl",x: 6, y: 18, w: 6, h: 4 },

  // Group 4 — Admin  (gap at y=22-23, starts at y=24)
  { id: "admin-system-status", x: 0, y: 24, w: 6, h: 4 },
  { id: "admin-audit-log",     x: 6, y: 24, w: 6, h: 6 },
];

/**
 * Default dashboard layout for SUPERADMIN role
 * All widgets including billing jobs and webhook status
 */
export const SUPERADMIN_DEFAULT_LAYOUT: DashboardWidget[] = [
  // Group 1 — KPIs + Utility  (y=0-3, ends at y=4)
  { id: "kpi-parks",          x: 0, y: 0, w: 3, h: 2 },
  { id: "kpi-turbines",       x: 3, y: 0, w: 3, h: 2 },
  { id: "kpi-shareholders",   x: 6, y: 0, w: 3, h: 2 },
  { id: "kpi-fund-capital",   x: 9, y: 0, w: 3, h: 2 },
  { id: "kpi-open-invoices",  x: 0, y: 2, w: 3, h: 2 },
  { id: "kpi-contracts",      x: 3, y: 2, w: 3, h: 2 },
  { id: "weather-widget",     x: 6, y: 2, w: 3, h: 2 },
  { id: "quick-actions",      x: 9, y: 2, w: 3, h: 2 },

  // Group 2 — Large Charts  (gap at y=4-5, starts at y=6, h=6 → ends at y=12)
  { id: "chart-monthly-invoices",    x: 0, y: 6, w: 6, h: 6 },
  { id: "chart-capital-development", x: 6, y: 6, w: 6, h: 6 },

  // Group 3 — Lists & P&L  (gap at y=12-13, starts at y=14)
  { id: "list-deadlines",          x: 0, y: 14, w: 6, h: 4 },
  { id: "list-expiring-contracts", x: 6, y: 14, w: 6, h: 4 },
  { id: "list-activities",         x: 0, y: 18, w: 6, h: 4 },
  { id: "chart-wirtschaftsplan-pl",x: 6, y: 18, w: 6, h: 4 },

  // Group 4 — Secondary KPI & Analytics  (gap at y=22-23, starts at y=24)
  { id: "kpi-budget-variance",     x: 0, y: 24, w: 3, h: 2 },
  { id: "admin-system-status",     x: 3, y: 24, w: 6, h: 4 },
  { id: "chart-documents-by-type", x: 0, y: 28, w: 6, h: 4 },

  // Group 5 — Admin Logs & Jobs  (gap at y=32-33, starts at y=34)
  { id: "admin-audit-log",    x: 0, y: 34, w: 6, h: 6 },
  { id: "admin-billing-jobs", x: 6, y: 34, w: 6, h: 6 },

  // Group 6 — Integrations  (gap at y=40-41, starts at y=42)
  { id: "admin-webhook-status", x: 0, y: 42, w: 6, h: 4 },
];

/**
 * Map of role to default layout
 */
export const DEFAULT_LAYOUTS: Record<UserRole, DashboardWidget[]> = {
  VIEWER: VIEWER_DEFAULT_LAYOUT,
  MANAGER: MANAGER_DEFAULT_LAYOUT,
  ADMIN: ADMIN_DEFAULT_LAYOUT,
  SUPERADMIN: SUPERADMIN_DEFAULT_LAYOUT,
};

/**
 * Get the default dashboard configuration for a role
 */
export function getDefaultLayoutForRole(role: UserRole): DashboardConfig {
  const layout = DEFAULT_LAYOUTS[role] || VIEWER_DEFAULT_LAYOUT;

  return {
    widgets: layout,
    showQuickStats: true,
    gridCols: 12,
    rowHeight: 60,
  };
}

/**
 * Create a minimal default layout with only available widgets
 * Useful when widgets might be removed or unavailable
 */
export function createMinimalLayout(role: UserRole): DashboardConfig {
  const availableWidgets = getWidgetsForRole(role);
  const availableIds = new Set(availableWidgets.map((w) => w.id));

  // Filter the default layout to only include available widgets
  const defaultLayout = DEFAULT_LAYOUTS[role] || VIEWER_DEFAULT_LAYOUT;
  const filteredWidgets = defaultLayout.filter((w) => availableIds.has(w.id));

  // If no widgets match, create a simple layout with available KPI widgets
  if (filteredWidgets.length === 0) {
    const kpiWidgets = availableWidgets
      .filter((w) => w.category === "kpi")
      .slice(0, 4);

    return {
      widgets: kpiWidgets.map((w, i) => ({
        id: w.id,
        x: (i * 3) % 12,
        y: Math.floor((i * 3) / 12),
        w: w.defaultWidth,
        h: w.defaultHeight,
      })),
      showQuickStats: true,
      gridCols: 12,
      rowHeight: 60,
    };
  }

  return {
    widgets: filteredWidgets,
    showQuickStats: true,
    gridCols: 12,
    rowHeight: 60,
  };
}

/**
 * Validate and sanitize a user's dashboard config
 * Removes invalid widgets and fixes overlapping positions
 */
export function sanitizeDashboardConfig(
  config: DashboardConfig,
  role: UserRole
): DashboardConfig {
  const availableWidgets = getWidgetsForRole(role);
  const availableIds = new Set(availableWidgets.map((w) => w.id));

  // Filter to only include valid and available widgets
  const sanitizedWidgets = config.widgets.filter((widget) => {
    // Check if widget exists in registry
    const definition = getWidgetById(widget.id);
    if (!definition) return false;

    // Check if widget is available for role
    if (!availableIds.has(widget.id)) return false;

    // Validate position values
    if (
      typeof widget.x !== "number" ||
      typeof widget.y !== "number" ||
      typeof widget.w !== "number" ||
      typeof widget.h !== "number"
    ) {
      return false;
    }

    // Ensure positive values
    if (widget.x < 0 || widget.y < 0 || widget.w <= 0 || widget.h <= 0) {
      return false;
    }

    return true;
  });

  // Apply min/max constraints
  const constrainedWidgets = sanitizedWidgets.map((widget) => {
    const definition = getWidgetById(widget.id);
    if (!definition) return widget;

    return {
      ...widget,
      w: Math.min(
        Math.max(widget.w, definition.minWidth || 1),
        definition.maxWidth || 12
      ),
      h: Math.min(
        Math.max(widget.h, definition.minHeight || 1),
        definition.maxHeight || 10
      ),
      x: Math.min(widget.x, 12 - widget.w), // Ensure widget fits in grid
    };
  });

  return {
    widgets: constrainedWidgets,
    showQuickStats: config.showQuickStats ?? true,
    gridCols: config.gridCols ?? 12,
    rowHeight: config.rowHeight ?? 60,
  };
}

/**
 * Merge user config with default, filling in missing widgets
 */
export function mergeWithDefault(
  userConfig: DashboardConfig | null,
  role: UserRole
): DashboardConfig {
  if (!userConfig || !userConfig.widgets || userConfig.widgets.length === 0) {
    return getDefaultLayoutForRole(role);
  }

  return sanitizeDashboardConfig(userConfig, role);
}
