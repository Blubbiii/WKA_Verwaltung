// ===========================================
// Dashboard Configuration Types
// ===========================================

import { UserRole } from "@prisma/client";
import type { OnboardingState } from "@/lib/onboarding/tour-config";

/**
 * Widget position and size in the dashboard grid
 */
export interface DashboardWidget {
  /** Unique widget identifier (e.g., "kpi-parks", "chart-monthly-invoices") */
  id: string;
  /** Grid column position (0-based) */
  x: number;
  /** Grid row position (0-based) */
  y: number;
  /** Width in grid units */
  w: number;
  /** Height in grid units */
  h: number;
}

/**
 * User's dashboard configuration stored in User.settings.dashboard
 */
export interface DashboardConfig {
  /** List of widgets with their positions */
  widgets: DashboardWidget[];
  /** Whether to show quick stats bar (optional) */
  showQuickStats?: boolean;
  /** Grid columns (default: 12) */
  gridCols?: number;
  /** Row height in pixels (default: 100) */
  rowHeight?: number;
}

/**
 * Widget category for grouping in the widget picker
 */
export type WidgetCategory = "kpi" | "chart" | "list" | "admin" | "utility";

/**
 * Minimum role required to see a widget
 * Hierarchy: VIEWER < MANAGER < ADMIN < SUPERADMIN
 */
export type MinimumRole = "VIEWER" | "MANAGER" | "ADMIN" | "SUPERADMIN";

/**
 * Widget metadata in the registry
 */
export interface WidgetDefinition {
  /** Unique widget ID */
  id: string;
  /** Display name (German) */
  name: string;
  /** Short description */
  description: string;
  /** Widget category */
  category: WidgetCategory;
  /** Minimum role required to see this widget */
  minRole: MinimumRole;
  /** Default width in grid units */
  defaultWidth: number;
  /** Default height in grid units */
  defaultHeight: number;
  /** Minimum width (for resize constraints) */
  minWidth?: number;
  /** Minimum height (for resize constraints) */
  minHeight?: number;
  /** Maximum width (for resize constraints) */
  maxWidth?: number;
  /** Maximum height (for resize constraints) */
  maxHeight?: number;
  /** Icon name (for widget picker UI) */
  icon?: string;
  /** Whether widget supports resizing */
  resizable?: boolean;
}

/**
 * User settings structure (extends existing User.settings JSON)
 */
export interface UserSettings {
  dashboard?: DashboardConfig;
  onboarding?: OnboardingState;
  /** Ordered labelKeys for sidebar nav groups (middle section only) */
  sidebarGroupOrder?: string[];
  /** Other settings can be added here */
  [key: string]: unknown;
}

/**
 * API response for available widgets
 */
export interface AvailableWidgetsResponse {
  widgets: WidgetDefinition[];
  categories: {
    id: WidgetCategory;
    name: string;
    description: string;
  }[];
}

/**
 * API response for dashboard config
 */
export interface DashboardConfigResponse {
  config: DashboardConfig;
  isDefault: boolean;
}

/**
 * API request for updating dashboard config
 */
export interface UpdateDashboardConfigRequest {
  widgets: DashboardWidget[];
  showQuickStats?: boolean;
}

/**
 * Role hierarchy for permission checks
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  VIEWER: 0,
  MANAGER: 1,
  ADMIN: 2,
  SUPERADMIN: 3,
};

/**
 * Check if a user role meets the minimum required role
 */
export function hasMinimumRole(userRole: UserRole, minRole: MinimumRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole as UserRole];
}
