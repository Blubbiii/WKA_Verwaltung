// ===========================================
// Dashboard Module Exports
// ===========================================

// Widget Registry
export {
  WIDGET_REGISTRY,
  WIDGET_CATEGORIES,
  getWidgetById,
  getWidgetsForRole,
  getWidgetsByCategory,
  validateWidgetIds,
  filterWidgetsByRole,
  isWidgetAvailable,
} from "./widget-registry";

// Default Layouts
export {
  VIEWER_DEFAULT_LAYOUT,
  MANAGER_DEFAULT_LAYOUT,
  ADMIN_DEFAULT_LAYOUT,
  SUPERADMIN_DEFAULT_LAYOUT,
  DEFAULT_LAYOUTS,
  getDefaultLayoutForRole,
  createMinimalLayout,
  sanitizeDashboardConfig,
  mergeWithDefault,
} from "./default-layouts";

// Re-export types for convenience
export type {
  DashboardWidget,
  DashboardConfig,
  WidgetDefinition,
  WidgetCategory,
  MinimumRole,
  UserSettings,
  AvailableWidgetsResponse,
  DashboardConfigResponse,
  UpdateDashboardConfigRequest,
} from "@/types/dashboard";
