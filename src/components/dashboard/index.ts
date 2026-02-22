// Dashboard Components Exports
export {
  KPICard,
  KPICardGrid,
  KPICardSkeleton,
  KPICardGridSkeleton,
  type KPICardProps,
} from "./kpi-card";

export {
  QuickStats,
  QuickStatsSkeleton,
  CompactQuickStats,
  type QuickStatsProps,
  type CompactQuickStatsProps,
} from "./quick-stats";

export {
  MonthlyInvoicesChart,
  CapitalDevelopmentChart,
  DocumentsByTypeChart,
  AnalyticsCharts,
  ChartSkeleton,
  AnalyticsChartsSkeleton,
} from "./analytics-charts";

// New Dashboard Grid System
export { WidgetWrapper, WidgetSkeleton, EmptyWidgetState } from "./widget-wrapper";
export { WidgetRenderer, WidgetPreview } from "./widget-renderer";
export { DashboardGrid, DashboardGridSkeleton, EmptyDashboard } from "./dashboard-grid";
export { WidgetSidebar, WidgetSidebarSheet } from "./widget-sidebar";
export { DashboardEditor, DashboardView } from "./dashboard-editor";

// Onboarding
export { OnboardingBanner } from "./onboarding-banner";

// Widget Components
export {
  DeadlinesWidget,
  ActivitiesWidget,
  WeatherWidget,
  ExpiringContractsWidget,
  QuickActionsWidget,
  QuickActionsWidgetCompact,
  SystemStatusWidget,
  UserStatsWidget,
} from "./widgets";
