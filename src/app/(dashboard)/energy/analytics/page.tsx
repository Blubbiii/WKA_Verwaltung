"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { BarChart3, CreditCard, Activity, Wrench, LayoutDashboard, Clock, AlertTriangle, Cloud, Sun, Zap, GitCompare, Search, ArrowLeftRight, FileText, Archive } from "lucide-react";
import { AnalyticsFilterBar } from "@/components/energy/analytics/analytics-filter-bar";
import { CreateReportDialog } from "@/components/energy/analytics/create-report-dialog";
import { DrillDownBreadcrumb } from "@/components/energy/analytics/drill-down-breadcrumb";
import { CollapsibleSection } from "@/components/energy/analytics/collapsible-section";
import {
  DrillDownMonthly,
  DrillDownDaily,
  DailyOverview,
  PerformanceOverview,
  AvailabilityChart,
  TurbineComparison,
  FaultAnalysis,
  EnvironmentChart,
  FinancialAnalysis,
  ShadowChart,
  PhaseSymmetryChart,
} from "@/components/energy/analytics/analytics-dynamic";
import { useDrillDown } from "@/hooks/useDrillDown";
import { DataExplorerTab } from "@/components/energy/analytics/data-explorer-tab";
import { DataComparisonTab } from "@/components/energy/analytics/data-comparison-tab";
import { PdfReportsTab } from "@/components/energy/analytics/pdf-reports-tab";
import { ReportArchiveTab } from "@/components/energy/analytics/report-archive-tab";
import { Button } from "@/components/ui/button";
import type {
  PerformanceOverviewResponse,
  AvailabilityResponse,
  TurbineComparisonResponse,
  FaultsResponse,
  EnvironmentResponse,
  FinancialResponse,
  ShadowResponse,
  PhaseSymmetryResponse,
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
  const [activeTab, setActiveTab] = useState("daily");
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  // Tools sub-tab state
  const [activeToolTab, setActiveToolTab] = useState("data-explorer");

  // Drill-down state for performance section
  const drillDown = useDrillDown(currentYear);

  const handleYearChange = useCallback((year: number) => {
    setSelectedYear(year);
    drillDown.reset();
  }, [drillDown]);

  const handleHeatmapCellClick = useCallback(
    (turbineId: string, turbineDesignation: string, month: number) => {
      drillDown.drillDown({ month, turbineId, turbineDesignation });
    },
    [drillDown],
  );

  const handleDayClick = useCallback(
    (day: number) => {
      drillDown.drillDown({ day });
    },
    [drillDown],
  );

  // Build query params for year-based endpoints
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

  // --- Tab 2: Production & Comparison ---
  const isProductionTab = activeTab === "production";
  const perfParams = buildParams(compareYear ? { compareYear: String(compareYear) } : undefined);

  const { data: perfData, error: perfError, isLoading: perfLoading } = useSWR<PerformanceOverviewResponse>(
    isProductionTab ? `/api/energy/analytics/performance?${perfParams}` : null,
    fetcher, { revalidateOnFocus: false }
  );
  const { data: compData, error: compError, isLoading: compLoading } = useSWR<TurbineComparisonResponse>(
    isProductionTab ? `/api/energy/analytics/turbine-comparison?${baseParams}` : null,
    fetcher, { revalidateOnFocus: false }
  );

  // --- Tab 3: Operations & Environment ---
  const isOperationsTab = activeTab === "operations";

  const { data: availData, error: availError, isLoading: availLoading } = useSWR<AvailabilityResponse>(
    isOperationsTab ? `/api/energy/analytics/availability?${baseParams}` : null,
    fetcher, { revalidateOnFocus: false }
  );
  const { data: faultData, error: faultError, isLoading: faultLoading } = useSWR<FaultsResponse>(
    isOperationsTab ? `/api/energy/analytics/faults?${baseParams}` : null,
    fetcher, { revalidateOnFocus: false }
  );
  const { data: envData, error: envError, isLoading: envLoading } = useSWR<EnvironmentResponse>(
    isOperationsTab ? `/api/energy/analytics/environment?${baseParams}` : null,
    fetcher, { revalidateOnFocus: false }
  );
  const { data: shadowData, error: shadowError, isLoading: shadowLoading } = useSWR<ShadowResponse>(
    isOperationsTab ? `/api/energy/analytics/shadow?${baseParams}` : null,
    fetcher, { revalidateOnFocus: false }
  );

  // --- Tab 4: Finance & Technical ---
  const isFinanceTab = activeTab === "finance";

  const { data: finData, error: finError, isLoading: finLoading } = useSWR<FinancialResponse>(
    isFinanceTab ? `/api/energy/analytics/financial?${baseParams}` : null,
    fetcher, { revalidateOnFocus: false }
  );
  const { data: phaseData, error: phaseError, isLoading: phaseLoading } = useSWR<PhaseSymmetryResponse>(
    isFinanceTab ? `/api/energy/analytics/phase-symmetry?${baseParams}` : null,
    fetcher, { revalidateOnFocus: false }
  );

  // Error display helper
  const ErrorState = ({ message }: { message: string }) => (
    <div className="flex items-center justify-center h-[400px] text-destructive">
      {message}
    </div>
  );

  // Show filter bar only for year-based tabs (not daily overview, not tools)
  const showFilterBar = activeTab !== "daily" && activeTab !== "tools";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Energie-Analysen"
        description="Umfassende Auswertung Ihrer Windenergieanlagen"
      />

      {showFilterBar && (
        <AnalyticsFilterBar
          selectedParkId={selectedParkId}
          onParkChange={setSelectedParkId}
          selectedYear={selectedYear}
          onYearChange={handleYearChange}
          compareYear={compareYear}
          onCompareYearChange={setCompareYear}
          showCompareYear={activeTab === "production" && drillDown.isTopLevel}
          onCreateReport={() => setReportDialogOpen(true)}
        />
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto gap-1 w-full">
          <TabsTrigger value="daily" className="gap-1.5">
            <LayoutDashboard className="h-4 w-4 hidden sm:block" />
            <span>Tagesbericht</span>
          </TabsTrigger>
          <TabsTrigger value="production" className="gap-1.5">
            <BarChart3 className="h-4 w-4 hidden sm:block" />
            <span>Produktion & Vergleich</span>
          </TabsTrigger>
          <TabsTrigger value="operations" className="gap-1.5">
            <Activity className="h-4 w-4 hidden sm:block" />
            <span>Betrieb & Umwelt</span>
          </TabsTrigger>
          <TabsTrigger value="finance" className="gap-1.5">
            <CreditCard className="h-4 w-4 hidden sm:block" />
            <span>Finanzen & Technik</span>
          </TabsTrigger>
          <TabsTrigger value="tools" className="gap-1.5">
            <Wrench className="h-4 w-4 hidden sm:block" />
            <span>Werkzeuge</span>
          </TabsTrigger>
        </TabsList>

        {/* ================================================================= */}
        {/* Tab 1: Tagesbericht (Daily Overview)                              */}
        {/* ================================================================= */}
        <TabsContent value="daily" className="mt-6">
          <DailyOverview />
        </TabsContent>

        {/* ================================================================= */}
        {/* Tab 2: Produktion & Vergleich                                     */}
        {/* ================================================================= */}
        <TabsContent value="production" className="mt-6 space-y-8">
          {/* Performance Section */}
          <CollapsibleSection title="Performance" icon={BarChart3} defaultOpen>
            <DrillDownBreadcrumb
              breadcrumbs={drillDown.breadcrumbs}
              onBack={drillDown.drillUp}
              onReset={drillDown.reset}
              isTopLevel={drillDown.isTopLevel}
              className="mb-6"
            />

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

            {drillDown.state.level === "month" && drillDown.state.month != null && (
              <DrillDownMonthly
                year={selectedYear}
                month={drillDown.state.month}
                parkId={selectedParkId !== "all" ? selectedParkId : undefined}
                turbineId={drillDown.state.turbineId}
                onDayClick={handleDayClick}
              />
            )}

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
          </CollapsibleSection>

          {/* Comparison Section */}
          <CollapsibleSection title="Turbinen-Vergleich" icon={GitCompare} defaultOpen>
            {compError ? (
              <ErrorState message="Fehler beim Laden der Vergleichsdaten" />
            ) : (
              <TurbineComparison
                comparison={compData?.comparison ?? []}
                powerCurves={compData?.powerCurves ?? []}
                isLoading={compLoading}
              />
            )}
          </CollapsibleSection>
        </TabsContent>

        {/* ================================================================= */}
        {/* Tab 3: Betrieb & Umwelt                                           */}
        {/* ================================================================= */}
        <TabsContent value="operations" className="mt-6 space-y-8">
          <CollapsibleSection title="Verfügbarkeit" icon={Clock} defaultOpen>
            {availError ? (
              <ErrorState message="Fehler beim Laden der Verfügbarkeitsdaten" />
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
          </CollapsibleSection>

          <CollapsibleSection title="Störungen" icon={AlertTriangle} defaultOpen>
            {faultError ? (
              <ErrorState message="Fehler beim Laden der Störungsdaten" />
            ) : (
              <FaultAnalysis
                statePareto={faultData?.statePareto ?? []}
                warningTrend={faultData?.warningTrend ?? []}
                perTurbine={faultData?.perTurbine ?? []}
                isLoading={faultLoading}
              />
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Wind & Umwelt" icon={Cloud} defaultOpen>
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
          </CollapsibleSection>

          <CollapsibleSection title="Schattenwurf" icon={Sun} defaultOpen>
            {shadowError ? (
              <ErrorState message="Fehler beim Laden der Schattenwurf-Daten" />
            ) : (
              <ShadowChart
                perTurbine={shadowData?.perTurbine ?? []}
                monthlyTrend={shadowData?.monthlyTrend ?? []}
                dailyProfile={shadowData?.dailyProfile ?? []}
                summary={shadowData?.summary ?? { totalShadowHoursYear: 0, budgetUsedPercent: 0, worstTurbineDesignation: null }}
                isLoading={shadowLoading}
              />
            )}
          </CollapsibleSection>
        </TabsContent>

        {/* ================================================================= */}
        {/* Tab 4: Finanzen & Technik                                         */}
        {/* ================================================================= */}
        <TabsContent value="finance" className="mt-6 space-y-8">
          <CollapsibleSection title="Finanzen" icon={CreditCard} defaultOpen>
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
          </CollapsibleSection>

          <CollapsibleSection title="Phasen-Analyse" icon={Zap} defaultOpen>
            {phaseError ? (
              <ErrorState message="Fehler beim Laden der Phasen-Daten" />
            ) : (
              <PhaseSymmetryChart
                symmetryTrend={phaseData?.symmetryTrend ?? []}
                perTurbine={phaseData?.perTurbine ?? []}
                phasePowers={phaseData?.phasePowers ?? []}
                summary={phaseData?.summary ?? { fleetAvgImbalancePct: 0, worstTurbineDesignation: null, worstTurbineImbalancePct: 0, totalDataPoints: 0 }}
                isLoading={phaseLoading}
              />
            )}
          </CollapsibleSection>
        </TabsContent>

        {/* ================================================================= */}
        {/* Tab 5: Werkzeuge                                                  */}
        {/* ================================================================= */}
        <TabsContent value="tools" className="mt-6">
          <div className="flex gap-2 mb-6">
            {[
              { key: "data-explorer", label: "Daten-Explorer", icon: Search },
              { key: "data-comparison", label: "Datenabgleich", icon: ArrowLeftRight },
              { key: "pdf-reports", label: "PDF-Berichte", icon: FileText },
              { key: "archive", label: "Archiv", icon: Archive },
            ].map(({ key, label, icon: Icon }) => (
              <Button
                key={key}
                variant={activeToolTab === key ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveToolTab(key)}
                className="gap-1.5"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            ))}
          </div>

          {activeToolTab === "data-explorer" && <DataExplorerTab />}
          {activeToolTab === "data-comparison" && <DataComparisonTab />}
          {activeToolTab === "pdf-reports" && <PdfReportsTab />}
          {activeToolTab === "archive" && <ReportArchiveTab />}
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
