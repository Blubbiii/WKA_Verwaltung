"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { BarChart3, Clock, GitCompare, AlertTriangle, Cloud, CreditCard, Search, ArrowLeftRight } from "lucide-react";
import { AnalyticsFilterBar } from "@/components/energy/analytics/analytics-filter-bar";
import { CreateReportDialog } from "@/components/energy/analytics/create-report-dialog";
import { DrillDownBreadcrumb } from "@/components/energy/analytics/drill-down-breadcrumb";
import { DrillDownMonthly } from "@/components/energy/analytics/drill-down-monthly";
import { DrillDownDaily } from "@/components/energy/analytics/drill-down-daily";
import { useDrillDown } from "@/hooks/useDrillDown";
import { DataExplorerTab } from "@/components/energy/analytics/data-explorer-tab";
import { DataComparisonTab } from "@/components/energy/analytics/data-comparison-tab";
import {
  PerformanceOverview,
  AvailabilityChart,
  TurbineComparison,
  FaultAnalysis,
  EnvironmentChart,
  FinancialAnalysis,
} from "@/components/energy/analytics/analytics-dynamic";
import type {
  PerformanceOverviewResponse,
  AvailabilityResponse,
  TurbineComparisonResponse,
  FaultsResponse,
  EnvironmentResponse,
  FinancialResponse,
} from "@/types/analytics";

// =============================================================================
// Fetcher
// =============================================================================

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(err.error || "Fehler beim Laden");
  }
  return res.json();
};

// =============================================================================
// Page
// =============================================================================

export default function AnalyticsPage() {
  const currentYear = new Date().getFullYear();

  // Filter state
  const [selectedParkId, setSelectedParkId] = useState("all");
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [compareYear, setCompareYear] = useState<number | undefined>(currentYear - 1);
  const [activeTab, setActiveTab] = useState("performance");
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  // Drill-down state for performance tab
  const drillDown = useDrillDown(currentYear);

  // Keep drill-down year in sync with filter year
  const handleYearChange = useCallback((year: number) => {
    setSelectedYear(year);
    drillDown.reset();
  }, [drillDown]);

  // Handle heatmap cell click - drill to monthly view for that turbine
  const handleHeatmapCellClick = useCallback(
    (turbineId: string, turbineDesignation: string, month: number) => {
      drillDown.drillDown({
        month,
        turbineId,
        turbineDesignation,
      });
    },
    [drillDown],
  );

  // Handle day click from monthly view
  const handleDayClick = useCallback(
    (day: number) => {
      drillDown.drillDown({ day });
    },
    [drillDown],
  );

  // Build query params
  const buildParams = useCallback(
    (extra?: Record<string, string>) => {
      const params = new URLSearchParams();
      if (selectedParkId !== "all") params.set("parkId", selectedParkId);
      params.set("year", String(selectedYear));
      if (extra) {
        for (const [k, v] of Object.entries(extra)) params.set(k, v);
      }
      return params.toString();
    },
    [selectedParkId, selectedYear]
  );

  const baseParams = buildParams();

  // --- SWR: Performance (only when tab is active) ---
  const perfParams = buildParams(compareYear ? { compareYear: String(compareYear) } : undefined);
  const { data: perfData, error: perfError, isLoading: perfLoading } = useSWR<PerformanceOverviewResponse>(
    activeTab === "performance" ? `/api/energy/analytics/performance?${perfParams}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // --- SWR: Availability ---
  const { data: availData, error: availError, isLoading: availLoading } = useSWR<AvailabilityResponse>(
    activeTab === "availability" ? `/api/energy/analytics/availability?${baseParams}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // --- SWR: Turbine Comparison ---
  const { data: compData, error: compError, isLoading: compLoading } = useSWR<TurbineComparisonResponse>(
    activeTab === "comparison" ? `/api/energy/analytics/turbine-comparison?${baseParams}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // --- SWR: Faults ---
  const { data: faultData, error: faultError, isLoading: faultLoading } = useSWR<FaultsResponse>(
    activeTab === "faults" ? `/api/energy/analytics/faults?${baseParams}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // --- SWR: Environment ---
  const { data: envData, error: envError, isLoading: envLoading } = useSWR<EnvironmentResponse>(
    activeTab === "environment" ? `/api/energy/analytics/environment?${baseParams}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // --- SWR: Financial ---
  const { data: finData, error: finError, isLoading: finLoading } = useSWR<FinancialResponse>(
    activeTab === "financial" ? `/api/energy/analytics/financial?${baseParams}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // Error display helper
  const ErrorState = ({ message }: { message: string }) => (
    <div className="flex items-center justify-center h-[400px] text-destructive">
      {message}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Windpark-Analytics"
        description="Umfassende Auswertung Ihrer Windenergieanlagen"
      />

      <AnalyticsFilterBar
        selectedParkId={selectedParkId}
        onParkChange={setSelectedParkId}
        selectedYear={selectedYear}
        onYearChange={handleYearChange}
        compareYear={compareYear}
        onCompareYearChange={setCompareYear}
        showCompareYear={activeTab === "performance" && drillDown.isTopLevel}
        onCreateReport={() => setReportDialogOpen(true)}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 w-full">
          <TabsTrigger value="performance" className="gap-1">
            <BarChart3 className="h-4 w-4 hidden sm:block" />
            <span>Performance</span>
          </TabsTrigger>
          <TabsTrigger value="availability" className="gap-1">
            <Clock className="h-4 w-4 hidden sm:block" />
            <span>Verfuegbarkeit</span>
          </TabsTrigger>
          <TabsTrigger value="comparison" className="gap-1">
            <GitCompare className="h-4 w-4 hidden sm:block" />
            <span>Vergleich</span>
          </TabsTrigger>
          <TabsTrigger value="faults" className="gap-1">
            <AlertTriangle className="h-4 w-4 hidden sm:block" />
            <span>Stoerungen</span>
          </TabsTrigger>
          <TabsTrigger value="environment" className="gap-1">
            <Cloud className="h-4 w-4 hidden sm:block" />
            <span>Wind & Umwelt</span>
          </TabsTrigger>
          <TabsTrigger value="financial" className="gap-1">
            <CreditCard className="h-4 w-4 hidden sm:block" />
            <span>Finanzen</span>
          </TabsTrigger>
          <TabsTrigger value="data-explorer" className="gap-1">
            <Search className="h-4 w-4 hidden sm:block" />
            <span>Daten-Explorer</span>
          </TabsTrigger>
          <TabsTrigger value="data-comparison" className="gap-1">
            <ArrowLeftRight className="h-4 w-4 hidden sm:block" />
            <span>Datenabgleich</span>
          </TabsTrigger>
        </TabsList>

        {/* Performance Tab */}
        <TabsContent value="performance" className="mt-6">
          {/* Drill-down breadcrumb navigation */}
          <DrillDownBreadcrumb
            breadcrumbs={drillDown.breadcrumbs}
            onBack={drillDown.drillUp}
            onReset={drillDown.reset}
            isTopLevel={drillDown.isTopLevel}
            className="mb-6"
          />

          {/* Year View (default) */}
          {drillDown.state.level === "year" && (
            <>
              {perfError ? (
                <ErrorState message="Fehler beim Laden der Performance-Daten" />
              ) : (
                <PerformanceOverview
                  turbines={perfData?.turbines ?? []}
                  fleet={perfData?.fleet ?? { totalProductionKwh: 0, avgCapacityFactor: 0, avgSpecificYield: 0, totalInstalledKw: 0, avgWindSpeed: null }}
                  heatmap={perfData?.heatmap ?? []}
                  yearOverYear={perfData?.yearOverYear ?? []}
                  year={selectedYear}
                  compareYear={compareYear ?? selectedYear - 1}
                  isLoading={perfLoading}
                  onHeatmapCellClick={handleHeatmapCellClick}
                />
              )}
            </>
          )}

          {/* Month View - daily production bars */}
          {drillDown.state.level === "month" && drillDown.state.month != null && (
            <DrillDownMonthly
              year={selectedYear}
              month={drillDown.state.month}
              parkId={selectedParkId !== "all" ? selectedParkId : undefined}
              turbineId={drillDown.state.turbineId}
              onDayClick={handleDayClick}
            />
          )}

          {/* Day View - 10-min intervals */}
          {(drillDown.state.level === "day" || drillDown.state.level === "detail") &&
            drillDown.state.month != null &&
            drillDown.state.day != null && (
              <DrillDownDaily
                year={selectedYear}
                month={drillDown.state.month}
                day={drillDown.state.day}
                parkId={selectedParkId !== "all" ? selectedParkId : undefined}
                turbineId={drillDown.state.turbineId}
              />
            )}
        </TabsContent>

        {/* Availability Tab */}
        <TabsContent value="availability" className="mt-6">
          {availError ? (
            <ErrorState message="Fehler beim Laden der Verfuegbarkeitsdaten" />
          ) : (
            <AvailabilityChart
              breakdown={availData?.breakdown ?? []}
              trend={availData?.trend ?? []}
              heatmap={availData?.heatmap ?? []}
              pareto={availData?.pareto ?? []}
              fleet={availData?.fleet ?? { avgAvailability: 0, totalProductionHours: 0, totalDowntimeHours: 0, totalMaintenanceHours: 0 }}
              isLoading={availLoading}
            />
          )}
        </TabsContent>

        {/* Turbine Comparison Tab */}
        <TabsContent value="comparison" className="mt-6">
          {compError ? (
            <ErrorState message="Fehler beim Laden der Vergleichsdaten" />
          ) : (
            <TurbineComparison
              comparison={compData?.comparison ?? []}
              powerCurves={compData?.powerCurves ?? []}
              isLoading={compLoading}
            />
          )}
        </TabsContent>

        {/* Faults Tab */}
        <TabsContent value="faults" className="mt-6">
          {faultError ? (
            <ErrorState message="Fehler beim Laden der Stoerungsdaten" />
          ) : (
            <FaultAnalysis
              statePareto={faultData?.statePareto ?? []}
              warningTrend={faultData?.warningTrend ?? []}
              perTurbine={faultData?.perTurbine ?? []}
              isLoading={faultLoading}
            />
          )}
        </TabsContent>

        {/* Environment Tab */}
        <TabsContent value="environment" className="mt-6">
          {envError ? (
            <ErrorState message="Fehler beim Laden der Umweltdaten" />
          ) : (
            <EnvironmentChart
              windDistribution={envData?.windDistribution ?? []}
              seasonalPatterns={envData?.seasonalPatterns ?? []}
              directionEfficiency={envData?.directionEfficiency ?? []}
              summary={envData?.summary ?? { avgWindSpeed: 0, avgAirPressure: null, avgHumidity: null, totalRain: null }}
              isLoading={envLoading}
            />
          )}
        </TabsContent>

        {/* Financial Tab */}
        <TabsContent value="financial" className="mt-6">
          {finError ? (
            <ErrorState message="Fehler beim Laden der Finanzdaten" />
          ) : (
            <FinancialAnalysis
              monthly={finData?.monthly ?? []}
              lostRevenue={finData?.lostRevenue ?? { totalLostKwh: 0, estimatedLostEur: 0, avgRevenuePerKwh: null }}
              summary={finData?.summary ?? { totalRevenueEur: 0, totalProductionKwh: 0, avgRevenuePerKwh: null }}
              isLoading={finLoading}
            />
          )}
        </TabsContent>

        {/* Data Explorer Tab */}
        <TabsContent value="data-explorer" className="mt-6">
          <DataExplorerTab />
        </TabsContent>

        {/* Data Comparison Tab */}
        <TabsContent value="data-comparison" className="mt-6">
          <DataComparisonTab />
        </TabsContent>
      </Tabs>

      <CreateReportDialog
        open={reportDialogOpen}
        onOpenChange={setReportDialogOpen}
        defaultParkId={selectedParkId !== "all" ? selectedParkId : undefined}
      />
    </div>
  );
}
