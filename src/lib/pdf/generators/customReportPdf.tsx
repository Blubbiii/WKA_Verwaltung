/**
 * Custom Report PDF Generator
 *
 * Fetches data for each requested analytics module in parallel,
 * builds the CustomReportData object, and renders to a PDF buffer.
 */

import { renderToBuffer } from "@react-pdf/renderer";
import { CustomReportTemplate, type CustomReportData } from "../templates/CustomReportTemplate";
import { prisma } from "@/lib/prisma";
import {
  fetchPerformanceKpis,
  fetchProductionHeatmap,
  fetchYearOverYear,
  fetchAvailabilityBreakdown,
  fetchAvailabilityTrend,
  fetchAvailabilityHeatmap,
  fetchDowntimePareto,
  fetchTurbineComparison,
  fetchFaultPareto,
  fetchWarningTrend,
  fetchWindDistribution,
  fetchDirectionEfficiency,
  fetchFinancialSummary,
  fetchMonthlyRevenue,
} from "@/lib/analytics/module-fetchers";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Conditional fetch: only call fetcher if the module key is included.
 * Returns undefined if not requested.
 */
async function fetchIf<T>(
  condition: boolean,
  fetcher: () => Promise<T>
): Promise<T | undefined> {
  if (!condition) return undefined;
  return fetcher();
}

// =============================================================================
// Main Generator
// =============================================================================

/**
 * Generate a custom analytics report PDF.
 *
 * @param parkId - Park UUID (or "all" for tenant-wide)
 * @param year - Report year
 * @param month - Optional month (1-12)
 * @param modules - Array of module keys to include
 * @param tenantId - Tenant UUID
 * @param tenantName - Display name for tenant
 */
export async function generateCustomReportPdf(
  parkId: string,
  year: number,
  month: number | undefined,
  modules: string[],
  tenantId: string,
  tenantName: string
): Promise<Buffer> {
  const has = (key: string) => modules.includes(key);
  const parkIdOrNull = parkId === "all" ? null : parkId;

  // Resolve park name
  let parkName = "Alle Parks";
  if (parkIdOrNull) {
    const park = await prisma.park.findUnique({
      where: { id: parkIdOrNull },
      select: { name: true },
    });
    parkName = park?.name ?? "Unbekannt";
  }

  // Determine which fetches are needed
  // performanceKpis is shared by: performanceKpis, turbineRanking, kpiSummary, production
  const needPerformanceKpis =
    has("performanceKpis") || has("turbineRanking") || has("kpiSummary") || has("production");

  // turbineComparison is shared by: turbineComparison, powerCurveOverlay, powerCurve, dailyProfile
  const needTurbineComparison =
    has("turbineComparison") || has("powerCurveOverlay") || has("powerCurve") || has("dailyProfile");

  // Fetch all required data in parallel
  const [
    performanceKpis,
    productionHeatmap,
    yearOverYear,
    availabilityBreakdown,
    availabilityTrend,
    availabilityHeatmap,
    downtimePareto,
    turbineComparison,
    faultPareto,
    warningTrend,
    windDistribution,
    environmentalData,
    financialOverview,
    revenueComparison,
  ] = await Promise.all([
    fetchIf(needPerformanceKpis, () =>
      fetchPerformanceKpis(tenantId, year, parkIdOrNull)
    ),
    fetchIf(has("productionHeatmap"), () =>
      fetchProductionHeatmap(tenantId, year, parkIdOrNull)
    ),
    fetchIf(has("yearOverYear"), () =>
      fetchYearOverYear(tenantId, year, year - 1, parkIdOrNull)
    ),
    fetchIf(has("availabilityBreakdown"), () =>
      fetchAvailabilityBreakdown(tenantId, year, parkIdOrNull)
    ),
    fetchIf(has("availabilityTrend"), () =>
      fetchAvailabilityTrend(tenantId, year, parkIdOrNull)
    ),
    fetchIf(has("availabilityHeatmap"), () =>
      fetchAvailabilityHeatmap(tenantId, year, parkIdOrNull)
    ),
    fetchIf(has("downtimePareto"), () =>
      fetchDowntimePareto(tenantId, year, parkIdOrNull)
    ),
    fetchIf(needTurbineComparison, () =>
      fetchTurbineComparison(tenantId, year, parkIdOrNull)
    ),
    fetchIf(has("faultPareto"), () =>
      fetchFaultPareto(tenantId, year, parkIdOrNull)
    ),
    fetchIf(has("warningTrend"), () =>
      fetchWarningTrend(tenantId, year, parkIdOrNull)
    ),
    fetchIf(has("windDistribution") || has("windRose"), () =>
      fetchWindDistribution(tenantId, year, parkIdOrNull)
    ),
    fetchIf(has("environmentalData"), () =>
      fetchDirectionEfficiency(tenantId, year, parkIdOrNull)
    ),
    fetchIf(has("financialOverview"), () =>
      fetchFinancialSummary(tenantId, year, parkIdOrNull)
    ),
    fetchIf(has("revenueComparison"), () =>
      fetchMonthlyRevenue(tenantId, year, parkIdOrNull)
    ),
  ]);

  // Build CustomReportData
  const reportData: CustomReportData = {
    parkName,
    year,
    month,
    generatedAt: new Date().toISOString(),
    tenantName,
    selectedModules: modules,

    performanceKpis,
    productionHeatmap,
    yearOverYear,
    availabilityBreakdown,
    availabilityTrend,
    availabilityHeatmap,
    downtimePareto,
    turbineComparison,
    faultPareto,
    warningTrend,
    windDistribution,
    environmentalData,
    financialOverview,
    revenueComparison,
  };

  // Render to PDF buffer
  const pdfBuffer = await renderToBuffer(
    <CustomReportTemplate data={reportData} />
  );

  return pdfBuffer;
}

/**
 * Build a sanitized filename for the custom report download.
 */
export function getCustomReportFilename(
  parkName: string,
  year: number,
  month?: number
): string {
  const sanitized = parkName
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .substring(0, 30);
  const suffix = month != null ? `_${String(month).padStart(2, "0")}` : "";
  return `Bericht_${sanitized}_${year}${suffix}.pdf`;
}
