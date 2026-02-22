// ===========================================
// Default Dashboard Layouts per Role
// ===========================================

import type { DashboardConfig, DashboardWidget } from "@/types/dashboard";
import { UserRole } from "@prisma/client";
import { getWidgetById, getWidgetsForRole } from "./widget-registry";

// ===========================================
// Standard Grid Sizes (12-column grid, rowHeight=60px):
//   small:  3x2  (4 per row, 120px) - KPI cards
//   medium: 4x5  (3 per row, 300px) - lists, small charts
//   large:  6x6  (2 per row, 360px) - big charts, admin logs
//   utility: 3x3 (4 per row, 180px) - weather, quick actions
// ===========================================

/**
 * Default dashboard layout for VIEWER role
 * 8 basic widgets focused on overview information
 */
export const VIEWER_DEFAULT_LAYOUT: DashboardWidget[] = [
  // Row 0-1: 4 KPIs (3x2 each = 12 cols, 120px)
  { id: "kpi-parks",     x: 0, y: 0, w: 3, h: 2 },
  { id: "kpi-turbines",  x: 3, y: 0, w: 3, h: 2 },
  { id: "kpi-contracts", x: 6, y: 0, w: 3, h: 2 },
  { id: "kpi-documents", x: 9, y: 0, w: 3, h: 2 },

  // Row 2-6: 1 chart + 2 lists (4x5 each = 12 cols, 300px)
  { id: "chart-documents-by-type", x: 0, y: 2, w: 4, h: 5 },
  { id: "list-activities",         x: 4, y: 2, w: 4, h: 5 },
  { id: "list-deadlines",          x: 8, y: 2, w: 4, h: 5 },

  // Row 7-9: utility (3x3, 180px)
  { id: "quick-actions", x: 0, y: 7, w: 3, h: 3 },
];

/**
 * Default dashboard layout for MANAGER role
 * 12 widgets including financial KPIs and charts
 */
export const MANAGER_DEFAULT_LAYOUT: DashboardWidget[] = [
  // Row 0-1: 4 KPIs (3x2 each = 12 cols, 120px)
  { id: "kpi-parks",          x: 0, y: 0, w: 3, h: 2 },
  { id: "kpi-turbines",       x: 3, y: 0, w: 3, h: 2 },
  { id: "kpi-shareholders",   x: 6, y: 0, w: 3, h: 2 },
  { id: "kpi-fund-capital",   x: 9, y: 0, w: 3, h: 2 },

  // Row 2-3: 2 more KPIs (3x2 each, 120px) + quick-actions (3x3, 180px)
  { id: "kpi-open-invoices", x: 0, y: 2, w: 3, h: 2 },
  { id: "kpi-contracts",     x: 3, y: 2, w: 3, h: 2 },
  { id: "quick-actions",     x: 6, y: 2, w: 3, h: 3 },

  // Row 4-9: 2 large charts (6x6 each = 12 cols, 360px)
  { id: "chart-monthly-invoices",    x: 0, y: 5, w: 6, h: 6 },
  { id: "chart-capital-development", x: 6, y: 5, w: 6, h: 6 },

  // Row 11-15: 3 lists (4x5 each = 12 cols, 300px)
  { id: "list-deadlines",          x: 0, y: 11, w: 4, h: 5 },
  { id: "list-expiring-contracts", x: 4, y: 11, w: 4, h: 5 },
  { id: "list-activities",         x: 8, y: 11, w: 4, h: 5 },
];

/**
 * Default dashboard layout for ADMIN role
 * All manager widgets + admin widgets
 */
export const ADMIN_DEFAULT_LAYOUT: DashboardWidget[] = [
  // Row 0-1: 4 KPIs (3x2 each, 120px)
  { id: "kpi-parks",        x: 0, y: 0, w: 3, h: 2 },
  { id: "kpi-turbines",     x: 3, y: 0, w: 3, h: 2 },
  { id: "kpi-shareholders", x: 6, y: 0, w: 3, h: 2 },
  { id: "kpi-fund-capital", x: 9, y: 0, w: 3, h: 2 },

  // Row 2-3: 2 KPIs (3x2, 120px) + quick-actions (3x3, 180px)
  { id: "kpi-open-invoices", x: 0, y: 2, w: 3, h: 2 },
  { id: "kpi-contracts",     x: 3, y: 2, w: 3, h: 2 },
  { id: "quick-actions",     x: 6, y: 2, w: 3, h: 3 },

  // Row 5-10: 2 large charts (6x6 each, 360px)
  { id: "chart-monthly-invoices",    x: 0, y: 5, w: 6, h: 6 },
  { id: "chart-capital-development", x: 6, y: 5, w: 6, h: 6 },

  // Row 11-15: 3 lists (4x5 each, 300px)
  { id: "list-deadlines",          x: 0, y: 11, w: 4, h: 5 },
  { id: "list-expiring-contracts", x: 4, y: 11, w: 4, h: 5 },
  { id: "list-activities",         x: 8, y: 11, w: 4, h: 5 },

  // Row 16-20: admin widgets (4x5 + 6x6)
  { id: "admin-system-status", x: 0, y: 16, w: 4, h: 5 },
  { id: "admin-audit-log",     x: 4, y: 16, w: 8, h: 6 },
];

/**
 * Default dashboard layout for SUPERADMIN role
 * All widgets including billing jobs
 */
export const SUPERADMIN_DEFAULT_LAYOUT: DashboardWidget[] = [
  // Row 0-1: 4 KPIs (3x2 each, 120px)
  { id: "kpi-parks",        x: 0, y: 0, w: 3, h: 2 },
  { id: "kpi-turbines",     x: 3, y: 0, w: 3, h: 2 },
  { id: "kpi-shareholders", x: 6, y: 0, w: 3, h: 2 },
  { id: "kpi-fund-capital", x: 9, y: 0, w: 3, h: 2 },

  // Row 2-4: 2 KPIs (3x2, 120px) + weather + quick-actions (3x3, 180px)
  { id: "kpi-open-invoices", x: 0, y: 2, w: 3, h: 2 },
  { id: "kpi-contracts",     x: 3, y: 2, w: 3, h: 2 },
  { id: "weather-widget",    x: 6, y: 2, w: 3, h: 3 },
  { id: "quick-actions",     x: 9, y: 2, w: 3, h: 3 },

  // Row 5-10: 2 large charts (6x6 each, 360px)
  { id: "chart-monthly-invoices",    x: 0, y: 5, w: 6, h: 6 },
  { id: "chart-capital-development", x: 6, y: 5, w: 6, h: 6 },

  // Row 11-15: 3 lists (4x5 each, 300px)
  { id: "list-deadlines",          x: 0, y: 11, w: 4, h: 5 },
  { id: "list-expiring-contracts", x: 4, y: 11, w: 4, h: 5 },
  { id: "list-activities",         x: 8, y: 11, w: 4, h: 5 },

  // Row 16-20: admin widgets + chart
  { id: "admin-system-status",     x: 0, y: 16, w: 4, h: 5 },
  { id: "chart-documents-by-type", x: 4, y: 16, w: 4, h: 5 },
  { id: "admin-audit-log",         x: 0, y: 21, w: 6, h: 6 },
  { id: "admin-billing-jobs",      x: 6, y: 21, w: 6, h: 6 },
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
