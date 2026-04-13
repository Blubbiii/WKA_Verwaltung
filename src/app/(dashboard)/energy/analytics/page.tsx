"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, CreditCard, Activity, Wrench, LayoutDashboard, Clock, AlertTriangle, Cloud, Sun, Zap, GitCompare, Search, ArrowLeftRight, FileText, Archive, BookMarked } from "lucide-react";
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
import { Button } from "@/components/ui/button";

// Lazy-load the large tab components (each > 500 LoC) — only the active tab
// is hydrated. Cuts initial JS bundle significantly on first analytics load.
// next/dynamic requires options as an inline object literal (SWC restriction).
const DataExplorerTab = dynamic(
  () => import("@/components/energy/analytics/data-explorer-tab").then((m) => m.DataExplorerTab),
  { ssr: false, loading: () => <Skeleton className="w-full h-[400px]" /> },
);
const DataComparisonTab = dynamic(
  () => import("@/components/energy/analytics/data-comparison-tab").then((m) => m.DataComparisonTab),
  { ssr: false, loading: () => <Skeleton className="w-full h-[400px]" /> },
);
const PdfReportsTab = dynamic(
  () => import("@/components/energy/analytics/pdf-reports-tab").then((m) => m.PdfReportsTab),
  { ssr: false, loading: () => <Skeleton className="w-full h-[400px]" /> },
);
const ReportArchiveTab = dynamic(
  () => import("@/components/energy/analytics/report-archive-tab").then((m) => m.ReportArchiveTab),
  { ssr: false, loading: () => <Skeleton className="w-full h-[400px]" /> },
);
const ReportConfigsTab = dynamic(
  () => import("@/components/energy/analytics/report-configs-tab").then((m) => m.ReportConfigsTab),
  { ssr: false, loading: () => <Skeleton className="w-full h-[400px]" /> },
);
const ReportBuilderTab = dynamic(
  () => import("@/components/energy/analytics/report-builder-tab").then((m) => m.ReportBuilderTab),
  { ssr: false, loading: () => <Skeleton className="w-full h-[400px]" /> },
);
import type {
  PerformanceOverviewResponse,
  AvailabilityResponse,
  TurbineComparisonResponse,
  FaultsResponse,
  EnvironmentResponse,
  FinancialResponse,
  ShadowResponse,
  PhaseSymmetryResponse,
  AvailabilityTarget,
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
// Helper Components
// =============================================================================

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-[400px] text-destructive">
      {message}
    </div>
  );
}

// =============================================================================
// Page
// =============================================================================

export default function AnalyticsPage() {
  const t = useTranslations("energy.analyticsPage");
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

  const perfUrl = isProductionTab ? `/api/energy/analytics/performance?${perfParams}` : null;
  const compUrl = isProductionTab ? `/api/energy/analytics/turbine-comparison?${baseParams}` : null;

  const { data: perfData, error: perfError, isLoading: perfLoading } = useQuery<PerformanceOverviewResponse>({
    queryKey: [perfUrl],
    queryFn: () => fetcher(perfUrl!),
    enabled: !!perfUrl,
    refetchOnWindowFocus: false,
  });
  const { data: compData, error: compError, isLoading: compLoading } = useQuery<TurbineComparisonResponse>({
    queryKey: [compUrl],
    queryFn: () => fetcher(compUrl!),
    enabled: !!compUrl,
    refetchOnWindowFocus: false,
  });

  // --- Tab 3: Operations & Environment ---
  const isOperationsTab = activeTab === "operations";

  const availUrl = isOperationsTab ? `/api/energy/analytics/availability?${baseParams}` : null;
  const faultUrl = isOperationsTab ? `/api/energy/analytics/faults?${baseParams}` : null;
  const envUrl = isOperationsTab ? `/api/energy/analytics/environment?${baseParams}` : null;
  const shadowUrl = isOperationsTab ? `/api/energy/analytics/shadow?${baseParams}` : null;

  const { data: availData, error: availError, isLoading: availLoading } = useQuery<AvailabilityResponse>({
    queryKey: [availUrl],
    queryFn: () => fetcher(availUrl!),
    enabled: !!availUrl,
    refetchOnWindowFocus: false,
  });

  // Availability targets (Soll/Ist per park)
  const targetsUrl = isOperationsTab ? `/api/energy/analytics/availability-detail?${baseParams}` : null;
  const { data: targetsData } = useQuery<{ targets: AvailabilityTarget[] }>({
    queryKey: [targetsUrl],
    queryFn: () => fetcher(targetsUrl!),
    enabled: !!targetsUrl,
    refetchOnWindowFocus: false,
  });
  const { data: faultData, error: faultError, isLoading: faultLoading } = useQuery<FaultsResponse>({
    queryKey: [faultUrl],
    queryFn: () => fetcher(faultUrl!),
    enabled: !!faultUrl,
    refetchOnWindowFocus: false,
  });
  const { data: envData, error: envError, isLoading: envLoading } = useQuery<EnvironmentResponse>({
    queryKey: [envUrl],
    queryFn: () => fetcher(envUrl!),
    enabled: !!envUrl,
    refetchOnWindowFocus: false,
  });
  const { data: shadowData, error: shadowError, isLoading: shadowLoading } = useQuery<ShadowResponse>({
    queryKey: [shadowUrl],
    queryFn: () => fetcher(shadowUrl!),
    enabled: !!shadowUrl,
    refetchOnWindowFocus: false,
  });

  // --- Tab 4: Finance & Technical ---
  const isFinanceTab = activeTab === "finance";

  const finUrl = isFinanceTab ? `/api/energy/analytics/financial?${baseParams}` : null;
  const phaseUrl = isFinanceTab ? `/api/energy/analytics/phase-symmetry?${baseParams}` : null;

  const { data: finData, error: finError, isLoading: finLoading } = useQuery<FinancialResponse>({
    queryKey: [finUrl],
    queryFn: () => fetcher(finUrl!),
    enabled: !!finUrl,
    refetchOnWindowFocus: false,
  });
  const { data: phaseData, error: phaseError, isLoading: phaseLoading } = useQuery<PhaseSymmetryResponse>({
    queryKey: [phaseUrl],
    queryFn: () => fetcher(phaseUrl!),
    enabled: !!phaseUrl,
    refetchOnWindowFocus: false,
  });

  // Show filter bar only for year-based tabs (not daily overview, tools, or bericht)
  const showFilterBar = activeTab !== "daily" && activeTab !== "tools" && activeTab !== "bericht";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
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
            <span>{t("dailyReport")}</span>
          </TabsTrigger>
          <TabsTrigger value="production" className="gap-1.5">
            <BarChart3 className="h-4 w-4 hidden sm:block" />
            <span>{t("productionComparison")}</span>
          </TabsTrigger>
          <TabsTrigger value="operations" className="gap-1.5">
            <Activity className="h-4 w-4 hidden sm:block" />
            <span>{t("operationsEnvironment")}</span>
          </TabsTrigger>
          <TabsTrigger value="finance" className="gap-1.5">
            <CreditCard className="h-4 w-4 hidden sm:block" />
            <span>{t("financeTech")}</span>
          </TabsTrigger>
          <TabsTrigger value="tools" className="gap-1.5">
            <Wrench className="h-4 w-4 hidden sm:block" />
            <span>{t("tools")}</span>
          </TabsTrigger>
          <TabsTrigger value="bericht" className="gap-1.5">
            <FileText className="h-4 w-4 hidden sm:block" />
            <span>{t("report")}</span>
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
                  <ErrorState message={t("perfLoadError")} />
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
          <CollapsibleSection title={t("turbineComparison")} icon={GitCompare} defaultOpen>
            {compError ? (
              <ErrorState message={t("compLoadError")} />
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
          <CollapsibleSection title={t("availability")} icon={Clock} defaultOpen>
            {availError ? (
              <ErrorState message={t("availLoadError")} />
            ) : (
              <AvailabilityChart
                breakdown={availData?.breakdown ?? []}
                trend={availData?.trend ?? []}
                heatmap={availData?.heatmap ?? []}
                pareto={availData?.pareto ?? []}
                fleet={availData?.fleet ?? { avgAvailability: 0, totalProductionHours: 0, totalDowntimeHours: 0, totalMaintenanceHours: 0 }}
                targets={targetsData?.targets}
                isLoading={availLoading}
              />
            )}
          </CollapsibleSection>

          <CollapsibleSection title={t("faults")} icon={AlertTriangle} defaultOpen>
            {faultError ? (
              <ErrorState message={t("faultLoadError")} />
            ) : (
              <FaultAnalysis
                statePareto={faultData?.statePareto ?? []}
                warningTrend={faultData?.warningTrend ?? []}
                perTurbine={faultData?.perTurbine ?? []}
                isLoading={faultLoading}
                parkId={selectedParkId}
                year={selectedYear}
              />
            )}
          </CollapsibleSection>

          <CollapsibleSection title={t("windEnvironment")} icon={Cloud} defaultOpen>
            {envError ? (
              <ErrorState message={t("envLoadError")} />
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

          <CollapsibleSection title={t("shadowCast")} icon={Sun} defaultOpen>
            {shadowError ? (
              <ErrorState message={t("shadowLoadError")} />
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
          <CollapsibleSection title={t("finance")} icon={CreditCard} defaultOpen>
            {finError ? (
              <ErrorState message={t("finLoadError")} />
            ) : (
              <FinancialAnalysis
                monthly={finData?.monthly ?? []}
                lostRevenue={finData?.lostRevenue ?? { totalLostKwh: 0, estimatedLostEur: 0, avgRevenuePerKwh: null }}
                summary={finData?.summary ?? { totalRevenueEur: 0, totalProductionKwh: 0, avgRevenuePerKwh: null }}
                isLoading={finLoading}
              />
            )}
          </CollapsibleSection>

          <CollapsibleSection title={t("phaseAnalysis")} icon={Zap} defaultOpen>
            {phaseError ? (
              <ErrorState message={t("phaseLoadError")} />
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
              { key: "data-explorer", label: t("dataExplorer"), icon: Search },
              { key: "data-comparison", label: t("dataComparison"), icon: ArrowLeftRight },
              { key: "pdf-reports", label: t("pdfReports"), icon: FileText },
              { key: "vorlagen", label: t("templates"), icon: BookMarked },
              { key: "archive", label: t("archive"), icon: Archive },
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
          {activeToolTab === "vorlagen" && <ReportConfigsTab onCreateReport={() => setReportDialogOpen(true)} />}
          {activeToolTab === "archive" && <ReportArchiveTab />}
        </TabsContent>

        {/* ================================================================= */}
        {/* Tab 6: Bericht                                                     */}
        {/* ================================================================= */}
        <TabsContent value="bericht" className="mt-6">
          <ReportBuilderTab />
        </TabsContent>
      </Tabs>

      <CreateReportDialog
        open={reportDialogOpen}
        onOpenChange={setReportDialogOpen}
        defaultParkId={selectedParkId !== "all" ? selectedParkId : undefined}
        onSuccess={() => { setActiveTab("tools"); setActiveToolTab("vorlagen"); }}
      />
    </div>
  );
}
