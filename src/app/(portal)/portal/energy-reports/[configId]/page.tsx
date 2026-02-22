"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  Loader2,
  Zap,
  Gauge,
  Wind,
  Activity,
  Clock,
  Database,
  BarChart3,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  ProductionChart,
  PowerCurveChart,
  WindRoseChart,
  DailyChart,
} from "@/components/energy/charts-dynamic";

// =============================================================================
// Types
// =============================================================================

interface ReportConfig {
  id: string;
  name: string;
  description: string | null;
  modules: string[];
  parkId: string | null;
  interval: string | null;
  portalLabel: string | null;
}

interface KpiSummary {
  totalProductionKwh: number;
  avgPowerKw: number;
  avgWindSpeed: number | null;
  maxPowerKw: number;
  operatingHours: number;
  dataCompleteness: number;
}

interface TurbineRow {
  turbineId: string;
  turbineDesignation: string;
  productionKwh: number;
  avgPowerKw: number;
  avgWindSpeed: number | null;
  dataPoints: number;
}

interface ProductionDataPoint {
  turbineId: string;
  turbineDesignation: string;
  parkName: string;
  periodStart: string;
  productionKwh: number;
  avgPowerKw: number;
  avgWindSpeed: number | null;
  dataPoints: number;
}

interface PowerCurveScatter {
  windSpeed: number;
  powerKw: number;
  turbineId: string;
}

interface PowerCurveBinned {
  windSpeed: number;
  avgPowerKw: number;
}

interface SpeedRange {
  range: string;
  count: number;
}

interface WindRoseDataPoint {
  direction: string;
  directionDeg: number;
  total: number;
  speedRanges: SpeedRange[];
}

interface WindRoseMeta {
  totalMeasurements: number;
  avgWindSpeed: number;
  dominantDirection: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ReportData {
  kpiSummary?: KpiSummary;
  production?: ProductionDataPoint[];
  turbineComparison?: TurbineRow[];
  powerCurve?: {
    scatter: PowerCurveScatter[];
    curve: PowerCurveBinned[];
  };
  windRose?: {
    data: WindRoseDataPoint[];
    dominantDirection?: string;
    meta?: WindRoseMeta;
  };
  dailyProfile?: ProductionDataPoint[];
  // Analytics modules
  performanceKpis?: any;
  productionHeatmap?: any;
  turbineRanking?: any;
  yearOverYear?: any;
  availabilityBreakdown?: any;
  availabilityTrend?: any;
  availabilityHeatmap?: any;
  downtimePareto?: any;
  faultPareto?: any;
  warningTrend?: any;
  powerCurveOverlay?: any;
  windDistribution?: any;
  environmentalData?: any;
  financialOverview?: any;
  revenueComparison?: any;
}

const MODULE_LABELS: Record<string, string> = {
  // Classic
  kpiSummary: "KPI-Zusammenfassung",
  production: "Produktion",
  turbineComparison: "Anlagenvergleich",
  powerCurve: "Leistungskurve",
  windRose: "Windrose",
  dailyProfile: "Tagesverlauf",
  // Analytics
  performanceKpis: "Performance-KPIs",
  productionHeatmap: "Produktions-Heatmap",
  turbineRanking: "Turbinen-Ranking",
  yearOverYear: "Jahresvergleich",
  availabilityBreakdown: "Verfuegbarkeit T1-T6",
  availabilityTrend: "Verfuegbarkeits-Trend",
  availabilityHeatmap: "Verfuegbarkeits-Heatmap",
  downtimePareto: "Ausfallzeiten-Pareto",
  powerCurveOverlay: "Leistungskurven-Overlay",
  faultPareto: "Stoerungen-Pareto",
  warningTrend: "Warnungs-Trend",
  windDistribution: "Windverteilung",
  environmentalData: "Umweltdaten",
  financialOverview: "Finanz-Uebersicht",
  revenueComparison: "Erloesvergleich",
};

// =============================================================================
// Helpers
// =============================================================================

function getDefaultDates(): { from: string; to: string } {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const fromStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}-${String(prevMonth.getDate()).padStart(2, "0")}`;
  const toStr = `${lastDayPrevMonth.getFullYear()}-${String(lastDayPrevMonth.getMonth() + 1).padStart(2, "0")}-${String(lastDayPrevMonth.getDate()).padStart(2, "0")}`;

  return { from: fromStr, to: toStr };
}

function formatNumber(value: number, decimals = 1): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatInteger(value: number): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// =============================================================================
// Page Component
// =============================================================================

export default function EnergyReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const configId = params.configId as string;

  const defaults = getDefaultDates();
  const [config, setConfig] = useState<ReportConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [generating, setGenerating] = useState(false);

  // ---------------------------------------------------------------------------
  // Load Config
  // ---------------------------------------------------------------------------

  useEffect(() => {
    async function loadConfig() {
      try {
        setConfigLoading(true);
        const response = await fetch("/api/portal/energy-reports");
        if (!response.ok) {
          throw new Error("Fehler beim Laden der Berichtskonfiguration");
        }
        const data = await response.json();
        const configs: ReportConfig[] = data.data || [];
        const found = configs.find((c) => c.id === configId);
        if (!found) {
          toast.error("Berichtskonfiguration nicht gefunden");
          router.push("/portal/energy-reports");
          return;
        }
        setConfig(found);
      } catch {
        toast.error("Fehler beim Laden der Berichtskonfiguration");
      } finally {
        setConfigLoading(false);
      }
    }
    loadConfig();
  }, [configId, router]);

  // ---------------------------------------------------------------------------
  // Generate Report
  // ---------------------------------------------------------------------------

  const generateReport = useCallback(async () => {
    if (!configId) return;
    try {
      setGenerating(true);
      setReportData(null);
      const response = await fetch(
        `/api/portal/energy-reports/${configId}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: fromDate, to: toDate }),
        }
      );
      if (!response.ok) {
        const errData = await response
          .json()
          .catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(errData.error || "Fehler beim Generieren des Berichts");
      }
      const data = await response.json();
      setReportData(data.data || data);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Generieren des Berichts"
      );
    } finally {
      setGenerating(false);
    }
  }, [configId, fromDate, toDate]);

  // ---------------------------------------------------------------------------
  // Print
  // ---------------------------------------------------------------------------

  function handlePrint() {
    window.print();
  }

  // ---------------------------------------------------------------------------
  // Loading Config
  // ---------------------------------------------------------------------------

  if (configLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-80" />
        <div className="flex gap-4">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!config) {
    return null;
  }

  const hasModule = (mod: string) => config.modules.includes(mod);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/portal/energy-reports">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">
              {config.portalLabel || config.name}
            </h1>
          </div>
          {config.description && (
            <p className="text-muted-foreground ml-12">
              {config.description}
            </p>
          )}
          <div className="flex flex-wrap gap-1 mt-2 ml-12">
            {config.modules.map((mod) => (
              <Badge key={mod} variant="outline" className="text-xs">
                {MODULE_LABELS[mod] || mod}
              </Badge>
            ))}
          </div>
        </div>
        {reportData && (
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Drucken / PDF
          </Button>
        )}
      </div>

      {/* Print-only header */}
      <div className="hidden print:block print:mb-8">
        <h1 className="text-2xl font-bold">
          {config.portalLabel || config.name}
        </h1>
        {config.description && (
          <p className="text-sm text-gray-600">{config.description}</p>
        )}
        <p className="text-sm text-gray-500 mt-1">
          Zeitraum: {fromDate} bis {toDate}
        </p>
      </div>

      {/* Date Range + Generate */}
      <Card className="print:hidden">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex items-center gap-2">
              <label
                htmlFor="report-from"
                className="text-sm font-medium text-muted-foreground whitespace-nowrap"
              >
                Von
              </label>
              <input
                id="report-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="flex h-9 w-[160px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="flex items-center gap-2">
              <label
                htmlFor="report-to"
                className="text-sm font-medium text-muted-foreground whitespace-nowrap"
              >
                Bis
              </label>
              <input
                id="report-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="flex h-9 w-[160px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <Button onClick={generateReport} disabled={generating}>
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <BarChart3 className="mr-2 h-4 w-4" />
              )}
              Bericht generieren
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Content */}
      {generating && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Bericht wird generiert...</p>
        </div>
      )}

      {!generating && !reportData && (
        <Card>
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <BarChart3 className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                Bericht noch nicht generiert
              </h3>
              <p className="text-muted-foreground max-w-sm">
                Waehlen Sie den gewuenschten Zeitraum und klicken Sie auf
                &quot;Bericht generieren&quot;, um die Auswertung zu starten.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {reportData && (
        <div className="space-y-6">
          {/* Module: KPI Summary */}
          {hasModule("kpiSummary") && reportData.kpiSummary && (
            <KpiSummarySection data={reportData.kpiSummary} />
          )}

          {/* Module: Production Chart */}
          {hasModule("production") && reportData.production && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Produktion</CardTitle>
                <CardDescription>
                  Produktionsverlauf im ausgewaehlten Zeitraum
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reportData.production.length === 0 ? (
                  <EmptyModuleState text="Keine Produktionsdaten verfuegbar" />
                ) : (
                  <ProductionChart
                    data={reportData.production}
                    hasParkFilter={!!config.parkId}
                    interval={config.interval || "day"}
                    chartType="bar"
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Module: Turbine Comparison */}
          {hasModule("turbineComparison") && reportData.turbineComparison && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Anlagenvergleich</CardTitle>
                <CardDescription>
                  Vergleich der einzelnen Windkraftanlagen
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reportData.turbineComparison.length === 0 ? (
                  <EmptyModuleState text="Keine Anlagendaten verfuegbar" />
                ) : (
                  <TurbineComparisonTable
                    data={reportData.turbineComparison}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Module: Power Curve */}
          {hasModule("powerCurve") && reportData.powerCurve && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Leistungskurve</CardTitle>
                <CardDescription>
                  Zusammenhang zwischen Windgeschwindigkeit und elektrischer
                  Leistung
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reportData.powerCurve.scatter.length === 0 &&
                reportData.powerCurve.curve.length === 0 ? (
                  <EmptyModuleState text="Keine Leistungskurvendaten verfuegbar" />
                ) : (
                  <PowerCurveChart
                    scatter={reportData.powerCurve.scatter}
                    curve={reportData.powerCurve.curve}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Module: Wind Rose */}
          {hasModule("windRose") && reportData.windRose && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Windrose</CardTitle>
                <CardDescription>
                  Windrichtungsverteilung nach Geschwindigkeitsbereichen
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!reportData.windRose.data || reportData.windRose.data.length === 0 ? (
                  <EmptyModuleState text="Keine Windrosendaten verfuegbar" />
                ) : (
                  <WindRoseChart
                    data={reportData.windRose.data}
                    meta={reportData.windRose.meta ?? { totalMeasurements: 0, avgWindSpeed: 0, dominantDirection: reportData.windRose.dominantDirection ?? "N" }}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Module: Daily Profile */}
          {hasModule("dailyProfile") && reportData.dailyProfile && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Tagesverlauf</CardTitle>
                <CardDescription>
                  Leistung und Windgeschwindigkeit im Tagesverlauf
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reportData.dailyProfile.length === 0 ? (
                  <EmptyModuleState text="Keine Tagesverlaufsdaten verfuegbar" />
                ) : (
                  <DailyChart
                    data={reportData.dailyProfile}
                    chartType="area"
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* ================================================================= */}
          {/* Analytics Modules (new)                                           */}
          {/* ================================================================= */}

          {/* Module: Performance KPIs */}
          {hasModule("performanceKpis") && reportData.performanceKpis && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Performance-KPIs</CardTitle>
                <CardDescription>Flottenweite Performance-Kennzahlen</CardDescription>
              </CardHeader>
              <CardContent>
                <AnalyticsFleetKpis data={reportData.performanceKpis} />
              </CardContent>
            </Card>
          )}

          {/* Module: Turbine Ranking */}
          {hasModule("turbineRanking") && reportData.turbineRanking && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Turbinen-Ranking</CardTitle>
                <CardDescription>Anlagen sortiert nach Capacity Factor</CardDescription>
              </CardHeader>
              <CardContent>
                <AnalyticsTurbineRanking data={reportData.turbineRanking} />
              </CardContent>
            </Card>
          )}

          {/* Module: Production Heatmap */}
          {hasModule("productionHeatmap") && reportData.productionHeatmap && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Produktions-Heatmap</CardTitle>
                <CardDescription>Monatliche Produktion pro Anlage (kWh)</CardDescription>
              </CardHeader>
              <CardContent>
                <AnalyticsHeatmapTable data={reportData.productionHeatmap} unit="kWh" />
              </CardContent>
            </Card>
          )}

          {/* Module: Year over Year */}
          {hasModule("yearOverYear") && reportData.yearOverYear && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Jahresvergleich</CardTitle>
                <CardDescription>Monatliche Produktion: aktuelles vs. Vorjahr</CardDescription>
              </CardHeader>
              <CardContent>
                <AnalyticsYoyTable data={reportData.yearOverYear} />
              </CardContent>
            </Card>
          )}

          {/* Module: Availability Breakdown */}
          {hasModule("availabilityBreakdown") && reportData.availabilityBreakdown && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Verfuegbarkeit T1-T6</CardTitle>
                <CardDescription>IEC 61400-26 Verfuegbarkeitsklassen pro Anlage</CardDescription>
              </CardHeader>
              <CardContent>
                <AnalyticsAvailTable data={reportData.availabilityBreakdown} />
              </CardContent>
            </Card>
          )}

          {/* Module: Availability Trend */}
          {hasModule("availabilityTrend") && reportData.availabilityTrend && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Verfuegbarkeits-Trend</CardTitle>
                <CardDescription>Monatliche technische Verfuegbarkeit</CardDescription>
              </CardHeader>
              <CardContent>
                <AnalyticsTrendTable data={reportData.availabilityTrend} valueKey="avgAvailability" unit="%" />
              </CardContent>
            </Card>
          )}

          {/* Module: Availability Heatmap */}
          {hasModule("availabilityHeatmap") && reportData.availabilityHeatmap && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Verfuegbarkeits-Heatmap</CardTitle>
                <CardDescription>Monatliche Verfuegbarkeit pro Anlage (%)</CardDescription>
              </CardHeader>
              <CardContent>
                <AnalyticsHeatmapTable data={reportData.availabilityHeatmap} unit="%" />
              </CardContent>
            </Card>
          )}

          {/* Module: Downtime Pareto */}
          {hasModule("downtimePareto") && reportData.downtimePareto && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Ausfallzeiten-Pareto</CardTitle>
                <CardDescription>Ausfallkategorien nach Dauer sortiert</CardDescription>
              </CardHeader>
              <CardContent>
                <AnalyticsParetoTable data={reportData.downtimePareto} durationKey="totalSeconds" />
              </CardContent>
            </Card>
          )}

          {/* Module: Fault Pareto */}
          {hasModule("faultPareto") && reportData.faultPareto && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Stoerungen-Pareto</CardTitle>
                <CardDescription>Top-Zustandscodes nach Gesamtdauer</CardDescription>
              </CardHeader>
              <CardContent>
                <AnalyticsParetoTable data={reportData.faultPareto} durationKey="totalDurationSeconds" />
              </CardContent>
            </Card>
          )}

          {/* Module: Warning Trend */}
          {hasModule("warningTrend") && reportData.warningTrend && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Warnungs-Trend</CardTitle>
                <CardDescription>Monatliche Warnungshaeufigkeit und -dauer</CardDescription>
              </CardHeader>
              <CardContent>
                <AnalyticsWarningTable data={reportData.warningTrend} />
              </CardContent>
            </Card>
          )}

          {/* Module: Wind Distribution */}
          {hasModule("windDistribution") && reportData.windDistribution && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Windverteilung</CardTitle>
                <CardDescription>Haeufigkeitsverteilung der Windgeschwindigkeit</CardDescription>
              </CardHeader>
              <CardContent>
                <AnalyticsWindDistTable data={reportData.windDistribution} />
              </CardContent>
            </Card>
          )}

          {/* Module: Environmental Data */}
          {hasModule("environmentalData") && reportData.environmentalData && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Umweltdaten</CardTitle>
                <CardDescription>Saisonale Muster und Umweltkennwerte</CardDescription>
              </CardHeader>
              <CardContent>
                <AnalyticsEnvironmentTable data={reportData.environmentalData} />
              </CardContent>
            </Card>
          )}

          {/* Module: Financial Overview */}
          {hasModule("financialOverview") && reportData.financialOverview && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Finanz-Uebersicht</CardTitle>
                <CardDescription>Erloese und Finanz-Kennzahlen</CardDescription>
              </CardHeader>
              <CardContent>
                <AnalyticsFinancialTable data={reportData.financialOverview} />
              </CardContent>
            </Card>
          )}

          {/* Module: Revenue Comparison / Lost Revenue */}
          {hasModule("revenueComparison") && reportData.revenueComparison && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Erloesvergleich</CardTitle>
                <CardDescription>Geschaetzter Erloesverlust durch Ausfallzeiten</CardDescription>
              </CardHeader>
              <CardContent>
                <AnalyticsLostRevenue data={reportData.revenueComparison} />
              </CardContent>
            </Card>
          )}

          {/* Module: Power Curve Overlay */}
          {hasModule("powerCurveOverlay") && reportData.powerCurveOverlay && (
            <Card className="print:break-inside-avoid">
              <CardHeader>
                <CardTitle>Leistungskurven-Overlay</CardTitle>
                <CardDescription>Leistungskurven aller Anlagen (Datenpunkte je 0,5 m/s)</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {Array.isArray(reportData.powerCurveOverlay)
                    ? `${reportData.powerCurveOverlay.length} Anlagen mit Leistungskurvendaten`
                    : "Keine Daten"}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub-Components
// =============================================================================

function EmptyModuleState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-[200px] text-muted-foreground">
      {text}
    </div>
  );
}

function KpiSummarySection({ data }: { data: KpiSummary }) {
  const kpis = [
    {
      label: "Gesamtproduktion",
      value: formatNumber(data.totalProductionKwh, 0),
      unit: "kWh",
      icon: Zap,
    },
    {
      label: "Durchschnittsleistung",
      value: formatNumber(data.avgPowerKw, 1),
      unit: "kW",
      icon: Gauge,
    },
    {
      label: "Windgeschwindigkeit",
      value:
        data.avgWindSpeed != null ? formatNumber(data.avgWindSpeed, 1) : "-",
      unit: "m/s",
      icon: Wind,
    },
    {
      label: "Max. Leistung",
      value: formatNumber(data.maxPowerKw, 1),
      unit: "kW",
      icon: Activity,
    },
    {
      label: "Betriebsstunden",
      value: formatInteger(data.operatingHours),
      unit: "h",
      icon: Clock,
    },
    {
      label: "Datenvollstaendigkeit",
      value: formatNumber(data.dataCompleteness, 1),
      unit: "%",
      icon: Database,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="print:break-inside-avoid">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-muted p-2">
                <kpi.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <p className="text-2xl font-bold">
                  {kpi.value}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    {kpi.unit}
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TurbineComparisonTable({ data }: { data: TurbineRow[] }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Anlage</TableHead>
            <TableHead className="text-right">Produktion (kWh)</TableHead>
            <TableHead className="text-right">Leistung (kW)</TableHead>
            <TableHead className="text-right">Wind (m/s)</TableHead>
            <TableHead className="text-right">Datenpunkte</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow key={row.turbineId}>
              <TableCell className="font-medium">
                {row.turbineDesignation}
              </TableCell>
              <TableCell className="text-right">
                {formatNumber(row.productionKwh, 0)}
              </TableCell>
              <TableCell className="text-right">
                {formatNumber(row.avgPowerKw, 1)}
              </TableCell>
              <TableCell className="text-right">
                {row.avgWindSpeed != null
                  ? formatNumber(row.avgWindSpeed, 1)
                  : "-"}
              </TableCell>
              <TableCell className="text-right">
                {formatInteger(row.dataPoints)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// =============================================================================
// Analytics Module Sub-Components
// =============================================================================

const MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function AnalyticsFleetKpis({ data }: { data: any }) {
  const fleet = data?.fleet;
  if (!fleet) return <EmptyModuleState text="Keine Flottendaten" />;

  const kpis = [
    { label: "Gesamtproduktion", value: `${formatNumber(fleet.totalProductionKwh / 1000, 1)} MWh` },
    { label: "Capacity Factor", value: `${formatNumber(fleet.avgCapacityFactor, 2)} %` },
    { label: "Specific Yield", value: `${formatInteger(fleet.avgSpecificYield)} kWh/kW` },
    { label: "Installierte Leistung", value: `${formatInteger(fleet.totalInstalledKw)} kW` },
    { label: "Mittlere Windgeschwindigkeit", value: fleet.avgWindSpeed != null ? `${formatNumber(fleet.avgWindSpeed, 1)} m/s` : "-" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {kpis.map((k) => (
        <div key={k.label} className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{k.label}</p>
          <p className="text-lg font-bold">{k.value}</p>
        </div>
      ))}
    </div>
  );
}

function AnalyticsTurbineRanking({ data }: { data: any[] }) {
  if (!data || data.length === 0) return <EmptyModuleState text="Keine Ranking-Daten" />;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Anlage</TableHead>
            <TableHead className="text-right">Produktion (MWh)</TableHead>
            <TableHead className="text-right">CF (%)</TableHead>
            <TableHead className="text-right">kWh/kW</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data
            .sort((a: any, b: any) => (b.capacityFactor || 0) - (a.capacityFactor || 0))
            .map((t: any, i: number) => (
              <TableRow key={t.turbineId || i}>
                <TableCell>{i + 1}</TableCell>
                <TableCell className="font-medium">{t.designation}</TableCell>
                <TableCell className="text-right">{formatNumber((t.productionKwh || 0) / 1000, 1)}</TableCell>
                <TableCell className="text-right">{formatNumber(t.capacityFactor || 0, 2)}</TableCell>
                <TableCell className="text-right">{formatInteger(t.specificYield || 0)}</TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AnalyticsHeatmapTable({ data, unit }: { data: any[]; unit: string }) {
  if (!data || data.length === 0) return <EmptyModuleState text="Keine Heatmap-Daten" />;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Anlage</TableHead>
            {MONTH_LABELS.map((m) => (
              <TableHead key={m} className="text-right text-xs">{m}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row: any) => {
            const cellMap = new Map((row.months || []).map((c: any) => [c.month, c.value]));
            return (
              <TableRow key={row.turbineId}>
                <TableCell className="font-medium text-xs">{row.designation}</TableCell>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <TableCell key={m} className="text-right text-xs">
                    {cellMap.has(m) ? formatNumber(cellMap.get(m) as number, unit === "%" ? 1 : 0) : "-"}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function AnalyticsYoyTable({ data }: { data: any[] }) {
  if (!data || data.length === 0) return <EmptyModuleState text="Keine Jahresvergleichsdaten" />;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Monat</TableHead>
            <TableHead className="text-right">Aktuelles Jahr (kWh)</TableHead>
            <TableHead className="text-right">Vorjahr (kWh)</TableHead>
            <TableHead className="text-right">Differenz</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row: any) => {
            const diff = (row.currentYear || 0) - (row.previousYear || 0);
            const diffPct = row.previousYear > 0 ? (diff / row.previousYear * 100) : 0;
            return (
              <TableRow key={row.month}>
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell className="text-right">{formatInteger(row.currentYear || 0)}</TableCell>
                <TableCell className="text-right">{formatInteger(row.previousYear || 0)}</TableCell>
                <TableCell className={`text-right ${diff >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {diff >= 0 ? "+" : ""}{formatNumber(diffPct, 1)}%
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function AnalyticsAvailTable({ data }: { data: any[] }) {
  if (!data || data.length === 0) return <EmptyModuleState text="Keine Verfuegbarkeitsdaten" />;

  const tLabels: Record<string, string> = { t1: "Prod.", t2: "Still.", t3: "Umw.", t4: "Wart.", t5: "Stoer.", t6: "Sonst." };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Anlage</TableHead>
            {Object.entries(tLabels).map(([k, v]) => (
              <TableHead key={k} className="text-right text-xs">{v}</TableHead>
            ))}
            <TableHead className="text-right">Verf. %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row: any) => (
            <TableRow key={row.turbineId}>
              <TableCell className="font-medium text-xs">{row.designation}</TableCell>
              {["t1", "t2", "t3", "t4", "t5", "t6"].map((k) => (
                <TableCell key={k} className="text-right text-xs">
                  {formatNumber((row[k] || 0) / 3600, 0)}h
                </TableCell>
              ))}
              <TableCell className="text-right font-medium">
                {formatNumber(row.availabilityPct || 0, 1)}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AnalyticsTrendTable({ data, valueKey, unit }: { data: any[]; valueKey: string; unit: string }) {
  if (!data || data.length === 0) return <EmptyModuleState text="Keine Trenddaten" />;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Monat</TableHead>
            <TableHead className="text-right">Wert ({unit})</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row: any) => (
            <TableRow key={row.month}>
              <TableCell className="font-medium">{row.label}</TableCell>
              <TableCell className="text-right">{formatNumber(row[valueKey] || 0, 2)} {unit}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AnalyticsParetoTable({ data, durationKey }: { data: any[]; durationKey: string }) {
  if (!data || data.length === 0) return <EmptyModuleState text="Keine Pareto-Daten" />;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kategorie</TableHead>
            <TableHead className="text-right">Dauer (h)</TableHead>
            <TableHead className="text-right">Anteil (%)</TableHead>
            <TableHead className="text-right">Kumulativ (%)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row: any, i: number) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{row.label || row.category}</TableCell>
              <TableCell className="text-right">{formatNumber((row[durationKey] || 0) / 3600, 1)}</TableCell>
              <TableCell className="text-right">{formatNumber(row.percentage || 0, 1)}</TableCell>
              <TableCell className="text-right">{formatNumber(row.cumulative || 0, 1)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AnalyticsWarningTable({ data }: { data: any[] }) {
  if (!data || data.length === 0) return <EmptyModuleState text="Keine Warnungsdaten" />;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Monat</TableHead>
            <TableHead className="text-right">Haeufigkeit</TableHead>
            <TableHead className="text-right">Dauer (h)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row: any) => (
            <TableRow key={row.month}>
              <TableCell className="font-medium">{row.label}</TableCell>
              <TableCell className="text-right">{formatInteger(row.totalFrequency || 0)}</TableCell>
              <TableCell className="text-right">{formatNumber((row.totalDurationSeconds || 0) / 3600, 1)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AnalyticsWindDistTable({ data }: { data: any[] }) {
  if (!data || data.length === 0) return <EmptyModuleState text="Keine Windverteilungsdaten" />;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Wind (m/s)</TableHead>
            <TableHead className="text-right">Anzahl</TableHead>
            <TableHead className="text-right">Anteil (%)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row: any) => (
            <TableRow key={row.windSpeedBin}>
              <TableCell className="font-medium">{row.windSpeedBin} - {row.windSpeedBin + 1}</TableCell>
              <TableCell className="text-right">{formatInteger(row.count || 0)}</TableCell>
              <TableCell className="text-right">{formatNumber(row.percentage || 0, 1)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AnalyticsEnvironmentTable({ data }: { data: any }) {
  const seasonal = data?.seasonalPatterns;
  if (!seasonal || seasonal.length === 0) return <EmptyModuleState text="Keine Umweltdaten" />;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Monat</TableHead>
            <TableHead className="text-right">Wind (m/s)</TableHead>
            <TableHead className="text-right">Leistung (kW)</TableHead>
            <TableHead className="text-right">Druck (hPa)</TableHead>
            <TableHead className="text-right">Feuchte (%)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {seasonal.map((row: any) => (
            <TableRow key={row.month}>
              <TableCell className="font-medium">{row.label}</TableCell>
              <TableCell className="text-right">{formatNumber(row.avgWindSpeed || 0, 1)}</TableCell>
              <TableCell className="text-right">{formatNumber(row.avgPowerKw || 0, 0)}</TableCell>
              <TableCell className="text-right">{row.avgAirPressure != null ? formatNumber(row.avgAirPressure, 0) : "-"}</TableCell>
              <TableCell className="text-right">{row.avgHumidity != null ? formatNumber(row.avgHumidity, 0) : "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AnalyticsFinancialTable({ data }: { data: any }) {
  const monthly = data?.monthly;
  const summary = data?.summary;

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Gesamterloese</p>
            <p className="text-lg font-bold">{formatNumber(summary.totalRevenueEur || 0, 2)} EUR</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Gesamtproduktion</p>
            <p className="text-lg font-bold">{formatNumber((summary.totalProductionKwh || 0) / 1000, 1)} MWh</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">EUR/kWh</p>
            <p className="text-lg font-bold">{summary.avgRevenuePerKwh != null ? formatNumber(summary.avgRevenuePerKwh, 4) : "-"}</p>
          </div>
        </div>
      )}
      {monthly && monthly.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Monat</TableHead>
                <TableHead className="text-right">Erloese (EUR)</TableHead>
                <TableHead className="text-right">Produktion (kWh)</TableHead>
                <TableHead className="text-right">EUR/kWh</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthly.map((row: any) => (
                <TableRow key={row.month}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className="text-right">{formatNumber(row.revenueEur || 0, 2)}</TableCell>
                  <TableCell className="text-right">{formatInteger(row.productionKwh || 0)}</TableCell>
                  <TableCell className="text-right">{row.revenuePerKwh != null ? formatNumber(row.revenuePerKwh, 4) : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function AnalyticsLostRevenue({ data }: { data: any }) {
  if (!data) return <EmptyModuleState text="Keine Erloesverlustdaten" />;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">Geschaetzter Produktionsverlust</p>
        <p className="text-lg font-bold">{formatNumber((data.totalLostKwh || 0) / 1000, 1)} MWh</p>
      </div>
      <div className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">Geschaetzter Erloesverlust</p>
        <p className="text-lg font-bold text-red-600">{formatNumber(data.estimatedLostEur || 0, 2)} EUR</p>
      </div>
      <div className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">Durchschnittlicher EUR/kWh</p>
        <p className="text-lg font-bold">{data.avgRevenuePerKwh != null ? formatNumber(data.avgRevenuePerKwh, 4) : "-"}</p>
      </div>
    </div>
  );
}
