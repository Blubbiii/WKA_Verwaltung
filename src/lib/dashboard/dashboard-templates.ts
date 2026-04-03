// ===========================================
// Dashboard Templates for different personas
// ===========================================

import type { DashboardWidget } from "@/types/dashboard";

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  widgets: DashboardWidget[];
}

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    id: "geschaeftsfuehrer",
    name: "Geschäftsführer",
    description: "KPIs, Umsatzentwicklung, Portfolio-Übersicht, Verträge",
    icon: "Briefcase",
    widgets: [
      // Row 0: KPIs
      { id: "kpi-parks", x: 0, y: 0, w: 3, h: 2 },
      { id: "kpi-fund-capital", x: 3, y: 0, w: 3, h: 2 },
      { id: "kpi-open-invoices", x: 6, y: 0, w: 3, h: 2 },
      { id: "kpi-contracts", x: 9, y: 0, w: 3, h: 2 },
      // Row 4: Charts
      { id: "chart-capital-development", x: 0, y: 4, w: 6, h: 6 },
      { id: "chart-revenue-by-park", x: 6, y: 4, w: 6, h: 6 },
      // Row 12: Lists
      { id: "list-expiring-contracts", x: 0, y: 12, w: 6, h: 4 },
      { id: "list-deadlines", x: 6, y: 12, w: 6, h: 4 },
      // Row 18: Utility
      { id: "list-recently-visited", x: 0, y: 18, w: 3, h: 4 },
      { id: "quick-actions", x: 3, y: 18, w: 3, h: 2 },
    ],
  },
  {
    id: "buchhalter",
    name: "Buchhalter",
    description: "Rechnungen, Zahlungen, Budget, DATEV-Status",
    icon: "Calculator",
    widgets: [
      // Row 0: KPIs
      { id: "kpi-open-invoices", x: 0, y: 0, w: 3, h: 2 },
      { id: "kpi-fund-capital", x: 3, y: 0, w: 3, h: 2 },
      { id: "kpi-budget-variance", x: 6, y: 0, w: 3, h: 2 },
      { id: "kpi-lease-revenue", x: 9, y: 0, w: 3, h: 2 },
      // Row 4: Charts
      { id: "chart-monthly-invoices", x: 0, y: 4, w: 6, h: 6 },
      { id: "chart-wirtschaftsplan-pl", x: 6, y: 4, w: 6, h: 6 },
      // Row 12: Lists
      { id: "list-pending-actions", x: 0, y: 12, w: 6, h: 4 },
      { id: "list-lease-overview", x: 6, y: 12, w: 6, h: 4 },
      // Row 18: Utility
      { id: "list-recently-visited", x: 0, y: 18, w: 3, h: 4 },
    ],
  },
  {
    id: "techniker",
    name: "Techniker",
    description: "SCADA, Turbinenübersicht, Wetter, Service-Events",
    icon: "Wrench",
    widgets: [
      // Row 0: KPIs
      { id: "kpi-turbines", x: 0, y: 0, w: 3, h: 2 },
      { id: "kpi-energy-yield", x: 3, y: 0, w: 3, h: 2 },
      { id: "kpi-availability", x: 6, y: 0, w: 3, h: 2 },
      { id: "kpi-wind-speed", x: 9, y: 0, w: 3, h: 2 },
      // Row 4: Charts
      { id: "chart-turbine-status", x: 0, y: 4, w: 6, h: 6 },
      { id: "chart-production-forecast", x: 6, y: 4, w: 6, h: 6 },
      // Row 12: Utility
      { id: "weather-widget", x: 0, y: 12, w: 3, h: 2 },
      { id: "list-activities", x: 3, y: 12, w: 6, h: 4 },
      { id: "list-recently-visited", x: 9, y: 12, w: 3, h: 4 },
    ],
  },
];
