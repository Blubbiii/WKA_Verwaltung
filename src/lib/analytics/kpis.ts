// KPI Type Definitions for WindparkManager Analytics Dashboard
import { Decimal } from "@prisma/client/runtime/library";

// =============================================================================
// KPI INTERFACES
// =============================================================================

export interface DashboardKPIs {
  // Parks
  totalParks: number;
  activeParks: number;
  totalCapacityMW: number;

  // Turbines
  totalTurbines: number;
  turbinesInMaintenance: number;
  averageTurbineAge: number; // In Jahren

  // Financial
  totalFundCapital: Decimal;
  totalShareholders: number;
  openInvoicesAmount: Decimal;
  openInvoicesCount: number;
  paidThisMonth: Decimal;

  // Contracts
  expiringContractsCount: number; // Naechste 30 Tage
  activeContractsCount: number;

  // Documents
  totalDocuments: number;
  documentsThisMonth: number;

  // Votes
  activeVotes: number;
  pendingVotersCount: number;

  // Trends (Vergleich zum Vormonat)
  trends: {
    revenue: number; // Prozent
    shareholders: number;
    documents: number;
  };
}

// Serialized version for API responses (Decimal -> string)
export interface DashboardKPIsResponse {
  // Parks
  totalParks: number;
  activeParks: number;
  totalCapacityMW: number;

  // Turbines
  totalTurbines: number;
  turbinesInMaintenance: number;
  averageTurbineAge: number;

  // Financial
  totalFundCapital: string;
  totalShareholders: number;
  openInvoicesAmount: string;
  openInvoicesCount: number;
  paidThisMonth: string;

  // Contracts
  expiringContractsCount: number;
  activeContractsCount: number;

  // Documents
  totalDocuments: number;
  documentsThisMonth: number;

  // Votes
  activeVotes: number;
  pendingVotersCount: number;

  // Trends
  trends: {
    revenue: number;
    shareholders: number;
    documents: number;
  };
}

// Chart Data Types
export interface MonthlyInvoiceData {
  month: string;
  invoiced: number;
  paid: number;
}

export interface CapitalDevelopmentData {
  month: string;
  capital: number;
}

export interface DocumentsByTypeData {
  name: string;
  value: number;
  color: string;
}

export interface AnalyticsChartData {
  monthlyInvoices: MonthlyInvoiceData[];
  capitalDevelopment: CapitalDevelopmentData[];
  documentsByType: DocumentsByTypeData[];
}

export interface FullAnalyticsResponse {
  kpis: DashboardKPIsResponse;
  charts: AnalyticsChartData;
  generatedAt: string;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

// Re-export centralized currency formatting
export { formatCurrency, formatCurrencyCompact } from "@/lib/format";

/**
 * Formatiert eine Zahl mit Tausender-Trennzeichen
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "0";
  return new Intl.NumberFormat("de-DE").format(value);
}

/**
 * Formatiert einen Prozentsatz
 */
export function formatPercent(value: number | null | undefined, withSign = false): string {
  if (value === null || value === undefined) return "0%";
  const sign = withSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Berechnet den prozentualen Unterschied zwischen zwei Werten
 */
export function calculateTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Serialisiert KPIs fuer die API-Response (Decimal -> string)
 */
export function serializeKPIs(kpis: DashboardKPIs): DashboardKPIsResponse {
  return {
    ...kpis,
    totalFundCapital: kpis.totalFundCapital?.toString() || "0",
    openInvoicesAmount: kpis.openInvoicesAmount?.toString() || "0",
    paidThisMonth: kpis.paidThisMonth?.toString() || "0",
  };
}

// =============================================================================
// DOCUMENT CATEGORY COLORS
// =============================================================================

export const DOCUMENT_CATEGORY_COLORS: Record<string, string> = {
  CONTRACT: "#3b82f6", // Blue
  PROTOCOL: "#8b5cf6", // Purple
  REPORT: "#06b6d4", // Cyan
  INVOICE: "#22c55e", // Green
  PERMIT: "#f59e0b", // Amber
  CORRESPONDENCE: "#ec4899", // Pink
  OTHER: "#6b7280", // Gray
};

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  CONTRACT: "Vertraege",
  PROTOCOL: "Protokolle",
  REPORT: "Berichte",
  INVOICE: "Rechnungen",
  PERMIT: "Genehmigungen",
  CORRESPONDENCE: "Korrespondenz",
  OTHER: "Sonstige",
};
