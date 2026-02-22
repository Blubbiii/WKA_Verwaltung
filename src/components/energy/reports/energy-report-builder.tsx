"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart3,
  TrendingUp,
  Activity,
  Compass,
  Clock,
  GitCompare,
  Loader2,
  Printer,
  Save,
  FolderOpen,
  FileBarChart,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useParks } from "@/hooks/useParks";
import {
  ProductionChart,
  PowerCurveChart,
  WindRoseChart,
  DailyChart,
} from "@/components/energy/charts-dynamic";
import {
  SaveConfigDialog,
  type ReportConfig,
} from "@/components/energy/reports/save-config-dialog";
import { LoadConfigDialog } from "@/components/energy/reports/load-config-dialog";

// =============================================================================
// Constants
// =============================================================================

const ICON_MAP: Record<string, React.ElementType> = {
  BarChart3,
  TrendingUp,
  GitCompare,
  Activity,
  Compass,
  Clock,
};

const REPORT_MODULES = [
  {
    id: "kpiSummary",
    label: "Kennzahlen-Uebersicht",
    description:
      "Wichtige KPIs wie Gesamtproduktion, Durchschnittsleistung, Windgeschwindigkeit",
    icon: "BarChart3",
  },
  {
    id: "production",
    label: "Produktionsuebersicht",
    description: "Zeitreihe der Energieproduktion nach gewaehltem Intervall",
    icon: "TrendingUp",
  },
  {
    id: "turbineComparison",
    label: "Anlagenvergleich",
    description: "Vergleich der Produktionsdaten aller Anlagen",
    icon: "GitCompare",
  },
  {
    id: "powerCurve",
    label: "Leistungskurve",
    description: "Leistung in Abhaengigkeit der Windgeschwindigkeit",
    icon: "Activity",
  },
  {
    id: "windRose",
    label: "Windrose",
    description: "Windrichtungsverteilung mit Geschwindigkeitsbereichen",
    icon: "Compass",
  },
  {
    id: "dailyProfile",
    label: "Tagesgang",
    description: "Durchschnittlicher Leistungsverlauf ueber den Tag",
    icon: "Clock",
  },
] as const;

type ModuleId = (typeof REPORT_MODULES)[number]["id"];

type Interval = "10min" | "hour" | "day" | "month" | "year";

const INTERVAL_OPTIONS: { value: Interval; label: string }[] = [
  { value: "10min", label: "10 Min" },
  { value: "hour", label: "Stunde" },
  { value: "day", label: "Tag" },
  { value: "month", label: "Monat" },
  { value: "year", label: "Jahr" },
];

// =============================================================================
// Number formatters
// =============================================================================

const fmtInt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const fmtDec1 = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const fmtPercent = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// =============================================================================
// Types
// =============================================================================

interface Turbine {
  id: string;
  designation: string;
}

interface KpiData {
  totalProductionKwh: number;
  avgPowerKw: number;
  avgWindSpeed: number | null;
  maxPowerKw: number;
  operatingHours: number;
  dataCompleteness: number;
  turbineCount: number;
}

interface TurbineComparisonRow {
  turbineId: string;
  designation: string;
  totalProductionKwh: number;
  avgPowerKw: number;
  avgWindSpeed: number | null;
  dataPoints: number;
  availability: number;
}

interface ReportData {
  kpiSummary?: KpiData;
  production?: Array<{
    turbineId: string;
    turbineDesignation: string;
    parkName: string;
    periodStart: string;
    productionKwh: number;
    avgPowerKw: number;
    avgWindSpeed: number | null;
    dataPoints: number;
  }>;
  turbineComparison?: TurbineComparisonRow[];
  powerCurve?: {
    scatter: Array<{ windSpeed: number; powerKw: number; turbineId: string }>;
    curve: Array<{ windSpeed: number; avgPowerKw: number }>;
    meta?: { totalPoints: number };
  };
  windRose?: {
    data: Array<{
      direction: string;
      directionDeg: number;
      total: number;
      speedRanges: Array<{ range: string; count: number }>;
    }>;
    dominantDirection?: string;
    meta?: {
      totalMeasurements: number;
      avgWindSpeed: number;
      dominantDirection: string;
    };
  };
  dailyProfile?: Array<{
    turbineId: string;
    turbineDesignation: string;
    parkName: string;
    periodStart: string;
    productionKwh: number;
    avgPowerKw: number;
    avgWindSpeed: number | null;
    dataPoints: number;
  }>;
  meta?: {
    parkName?: string;
    from: string;
    to: string;
    interval: string;
  };
}

// =============================================================================
// Helpers
// =============================================================================

function getDefaultFrom(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

function getDefaultTo(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// =============================================================================
// Main Component
// =============================================================================

export function EnergyReportBuilder() {
  // ---------------------------------------------------------------------------
  // State: module selection
  // ---------------------------------------------------------------------------

  const [selectedModules, setSelectedModules] = useState<Set<ModuleId>>(
    () => new Set(REPORT_MODULES.map((m) => m.id))
  );

  // ---------------------------------------------------------------------------
  // State: filters
  // ---------------------------------------------------------------------------

  const [selectedParkId, setSelectedParkId] = useState<string>("");
  const [selectedTurbineId, setSelectedTurbineId] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>(getDefaultFrom);
  const [toDate, setToDate] = useState<string>(getDefaultTo);
  const [interval, setInterval] = useState<Interval>("month");

  // ---------------------------------------------------------------------------
  // State: turbines loading
  // ---------------------------------------------------------------------------

  const [turbines, setTurbines] = useState<Turbine[]>([]);
  const [turbinesLoading, setTurbinesLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // State: report data
  // ---------------------------------------------------------------------------

  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [generating, setGenerating] = useState(false);

  // ---------------------------------------------------------------------------
  // State: dialogs
  // ---------------------------------------------------------------------------

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Print ref
  // ---------------------------------------------------------------------------

  const reportRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Parks
  // ---------------------------------------------------------------------------

  const { parks, isLoading: parksLoading } = useParks();

  // ---------------------------------------------------------------------------
  // Load turbines when park changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (selectedParkId) {
      setTurbinesLoading(true);
      fetch(`/api/parks/${selectedParkId}`)
        .then((res) => res.json())
        .then((data) => {
          setTurbines(data.turbines || []);
        })
        .catch(() => setTurbines([]))
        .finally(() => setTurbinesLoading(false));
    } else {
      setTurbines([]);
      setSelectedTurbineId("");
    }
  }, [selectedParkId]);

  // ---------------------------------------------------------------------------
  // Module toggle
  // ---------------------------------------------------------------------------

  const toggleModule = useCallback((moduleId: ModuleId) => {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Generate report
  // ---------------------------------------------------------------------------

  async function handleGenerate() {
    if (selectedModules.size === 0) {
      toast.error("Bitte waehlen Sie mindestens ein Modul aus.");
      return;
    }

    setGenerating(true);
    setReportData(null);

    try {
      const body = {
        modules: Array.from(selectedModules),
        parkId: selectedParkId || undefined,
        turbineId: selectedTurbineId || undefined,
        from: fromDate,
        to: toDate,
        interval,
      };

      const res = await fetch("/api/energy/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: "Unbekannter Fehler" }));
        throw new Error(data.error || "Fehler beim Generieren");
      }

      const data: ReportData = await res.json();
      setReportData(data);
      toast.success("Bericht erfolgreich generiert");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Generieren des Berichts"
      );
    } finally {
      setGenerating(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Config helpers
  // ---------------------------------------------------------------------------

  function getCurrentConfig(): ReportConfig {
    return {
      modules: Array.from(selectedModules),
      parkId: selectedParkId,
      turbineId: selectedTurbineId,
      from: fromDate,
      to: toDate,
      interval,
    };
  }

  function handleLoadConfig(config: ReportConfig) {
    setSelectedModules(new Set(config.modules as ModuleId[]));
    setSelectedParkId(config.parkId || "");
    setSelectedTurbineId(config.turbineId || "");
    setFromDate(config.from);
    setToDate(config.to);
    setInterval((config.interval as Interval) || "month");
  }

  // ---------------------------------------------------------------------------
  // Print handler
  // ---------------------------------------------------------------------------

  function handlePrint() {
    window.print();
  }

  // ---------------------------------------------------------------------------
  // Get park name for print header
  // ---------------------------------------------------------------------------

  const selectedParkName =
    parks?.find((p) => p.id === selectedParkId)?.name || "Alle Parks";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Print styles */}
      <style jsx global>{`
        @media print {
          /* Hide everything except the report */
          body * {
            visibility: hidden;
          }
          .print-area,
          .print-area * {
            visibility: visible;
          }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
          .print-header {
            display: block !important;
          }
          .report-module {
            page-break-inside: avoid;
            break-inside: avoid;
            margin-bottom: 24px;
          }
          .report-module + .report-module {
            page-break-before: auto;
          }
        }
      `}</style>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ================================================================= */}
        {/* Left sidebar - Module selection + Filters + Actions */}
        {/* ================================================================= */}
        <aside className="no-print w-full lg:w-80 shrink-0 space-y-4">
          {/* Module Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Berichtsmodule</CardTitle>
              <CardDescription className="text-xs">
                Waehlen Sie die Module fuer Ihren Bericht
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {REPORT_MODULES.map((mod) => {
                const Icon = ICON_MAP[mod.icon] || BarChart3;
                const isSelected = selectedModules.has(mod.id);
                return (
                  <div key={mod.id} className="flex items-start space-x-3">
                    <Checkbox
                      id={`module-${mod.id}`}
                      checked={isSelected}
                      onCheckedChange={() => toggleModule(mod.id)}
                      className="mt-0.5"
                    />
                    <label
                      htmlFor={`module-${mod.id}`}
                      className="flex-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium">
                          {mod.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {mod.description}
                      </p>
                    </label>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Filter</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Park */}
              <div className="space-y-1.5">
                <Label htmlFor="energy-filter-park" className="text-xs">
                  Windpark
                </Label>
                <Select
                  value={selectedParkId || "all"}
                  onValueChange={(v) => {
                    setSelectedParkId(v === "all" ? "" : v);
                    setSelectedTurbineId("");
                  }}
                  disabled={parksLoading}
                >
                  <SelectTrigger id="energy-filter-park">
                    <SelectValue placeholder="Park waehlen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Parks</SelectItem>
                    {parks?.map((park) => (
                      <SelectItem key={park.id} value={park.id}>
                        {park.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Turbine - only show when park is selected */}
              {selectedParkId && (
                <div className="space-y-1.5">
                  <Label htmlFor="energy-filter-turbine" className="text-xs">
                    Anlage
                  </Label>
                  <Select
                    value={selectedTurbineId || "all"}
                    onValueChange={(v) =>
                      setSelectedTurbineId(v === "all" ? "" : v)
                    }
                    disabled={turbinesLoading}
                  >
                    <SelectTrigger id="energy-filter-turbine">
                      <SelectValue
                        placeholder={
                          turbinesLoading
                            ? "Laden..."
                            : "Anlage waehlen"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Anlagen</SelectItem>
                      {turbines.map((turbine) => (
                        <SelectItem key={turbine.id} value={turbine.id}>
                          {turbine.designation}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Von */}
              <div className="space-y-1.5">
                <Label htmlFor="energy-filter-from" className="text-xs">
                  Von
                </Label>
                <input
                  id="energy-filter-from"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              {/* Bis */}
              <div className="space-y-1.5">
                <Label htmlFor="energy-filter-to" className="text-xs">
                  Bis
                </Label>
                <input
                  id="energy-filter-to"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              {/* Interval */}
              <div className="space-y-1.5">
                <Label htmlFor="energy-filter-interval" className="text-xs">
                  Intervall
                </Label>
                <Select
                  value={interval}
                  onValueChange={(v) => setInterval(v as Interval)}
                >
                  <SelectTrigger id="energy-filter-interval">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVAL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Aktionen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                className="w-full"
                onClick={handleGenerate}
                disabled={generating || selectedModules.size === 0}
              >
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileBarChart className="mr-2 h-4 w-4" />
                )}
                Bericht generieren
              </Button>

              <Separator />

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setSaveDialogOpen(true)}
              >
                <Save className="mr-2 h-4 w-4" />
                Konfiguration speichern
              </Button>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setLoadDialogOpen(true)}
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                Konfiguration laden
              </Button>

              <Button
                variant="outline"
                className="w-full"
                onClick={handlePrint}
                disabled={!reportData}
              >
                <Printer className="mr-2 h-4 w-4" />
                Drucken / PDF
              </Button>
            </CardContent>
          </Card>
        </aside>

        {/* ================================================================= */}
        {/* Main area - Report preview */}
        {/* ================================================================= */}
        <main className="flex-1 min-w-0">
          <div className="print-area" ref={reportRef}>
            {/* Print header (hidden on screen, shown on print) */}
            <div className="print-header hidden mb-6">
              <h1 className="text-2xl font-bold">Energiebericht</h1>
              <p className="text-sm text-muted-foreground">
                {selectedParkName} | {fromDate} bis {toDate}
              </p>
              <Separator className="mt-3" />
            </div>

            {/* Header on screen */}
            <div className="no-print mb-6">
              <h2 className="text-2xl font-bold tracking-tight">
                Energie-Berichtsersteller
              </h2>
              <p className="text-muted-foreground">
                Erstellen Sie individuelle Energieberichte mit konfigurierbaren
                Modulen
              </p>
            </div>

            {/* Content */}
            {generating ? (
              <div className="space-y-6">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-[400px] w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : reportData ? (
              <div className="space-y-6">
                {/* KPI Summary */}
                {selectedModules.has("kpiSummary") &&
                  reportData.kpiSummary && (
                    <section className="report-module">
                      <h2 className="text-xl font-semibold mb-4">
                        Kennzahlen-Uebersicht
                      </h2>
                      <KpiSummaryModule data={reportData.kpiSummary} />
                    </section>
                  )}

                {/* Production Chart */}
                {selectedModules.has("production") &&
                  reportData.production && (
                    <section className="report-module">
                      <h2 className="text-xl font-semibold mb-4">
                        Produktionsuebersicht
                      </h2>
                      <Card>
                        <CardContent className="pt-6">
                          {reportData.production.length === 0 ? (
                            <EmptyState message="Keine Produktionsdaten vorhanden" />
                          ) : (
                            <ProductionChart
                              data={reportData.production}
                              hasParkFilter={!!selectedParkId}
                              interval={interval}
                              chartType="bar"
                            />
                          )}
                        </CardContent>
                      </Card>
                    </section>
                  )}

                {/* Turbine Comparison */}
                {selectedModules.has("turbineComparison") &&
                  reportData.turbineComparison && (
                    <section className="report-module">
                      <h2 className="text-xl font-semibold mb-4">
                        Anlagenvergleich
                      </h2>
                      <TurbineComparisonModule
                        data={reportData.turbineComparison}
                      />
                    </section>
                  )}

                {/* Power Curve */}
                {selectedModules.has("powerCurve") &&
                  reportData.powerCurve && (
                    <section className="report-module">
                      <h2 className="text-xl font-semibold mb-4">
                        Leistungskurve
                      </h2>
                      <Card>
                        <CardContent className="pt-6">
                          {(!reportData.powerCurve.scatter ||
                            reportData.powerCurve.scatter.length === 0) &&
                          (!reportData.powerCurve.curve ||
                            reportData.powerCurve.curve.length === 0) ? (
                            <EmptyState message="Keine Leistungskurvendaten vorhanden" />
                          ) : (
                            <PowerCurveChart
                              scatter={reportData.powerCurve.scatter}
                              curve={reportData.powerCurve.curve}
                            />
                          )}
                        </CardContent>
                      </Card>
                    </section>
                  )}

                {/* Wind Rose */}
                {selectedModules.has("windRose") && reportData.windRose && (
                  <section className="report-module">
                    <h2 className="text-xl font-semibold mb-4">Windrose</h2>
                    <Card>
                      <CardContent className="pt-6">
                        {!reportData.windRose.data ||
                        reportData.windRose.data.length === 0 ? (
                          <EmptyState message="Keine Windrosendaten vorhanden" />
                        ) : (
                          <WindRoseChart
                            data={reportData.windRose.data}
                            meta={reportData.windRose.meta ?? { totalMeasurements: 0, avgWindSpeed: 0, dominantDirection: reportData.windRose.dominantDirection ?? "N" }}
                          />
                        )}
                      </CardContent>
                    </Card>
                  </section>
                )}

                {/* Daily Profile */}
                {selectedModules.has("dailyProfile") &&
                  reportData.dailyProfile && (
                    <section className="report-module">
                      <h2 className="text-xl font-semibold mb-4">
                        Tagesgang
                      </h2>
                      <Card>
                        <CardContent className="pt-6">
                          {reportData.dailyProfile.length === 0 ? (
                            <EmptyState message="Keine Tagesprofildaten vorhanden" />
                          ) : (
                            <DailyChart
                              data={reportData.dailyProfile}
                              chartType="area"
                            />
                          )}
                        </CardContent>
                      </Card>
                    </section>
                  )}
              </div>
            ) : (
              /* Empty state before generating */
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <FileBarChart className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-1">
                    Kein Bericht generiert
                  </h3>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    Waehlen Sie die gewuenschten Module und Filter aus und
                    klicken Sie auf &quot;Bericht generieren&quot;.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>

      {/* Dialogs */}
      <SaveConfigDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        config={getCurrentConfig()}
      />
      <LoadConfigDialog
        open={loadDialogOpen}
        onOpenChange={setLoadDialogOpen}
        onLoad={handleLoadConfig}
      />
    </>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[300px] gap-2">
      <Radio className="h-8 w-8 text-muted-foreground" />
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// KPI Summary Module
// -----------------------------------------------------------------------------

function KpiSummaryModule({ data }: { data: KpiData }) {
  const kpis = [
    {
      label: "Gesamtproduktion",
      value: `${fmtInt.format(data.totalProductionKwh)} kWh`,
    },
    {
      label: "Durchschnittsleistung",
      value: `${fmtDec1.format(data.avgPowerKw)} kW`,
    },
    {
      label: "Durchschn. Windgeschwindigkeit",
      value:
        data.avgWindSpeed != null
          ? `${fmtDec1.format(data.avgWindSpeed)} m/s`
          : "k.A.",
    },
    {
      label: "Maximale Leistung",
      value: `${fmtDec1.format(data.maxPowerKw)} kW`,
    },
    {
      label: "Betriebsstunden",
      value: fmtInt.format(data.operatingHours),
    },
    {
      label: "Datenvollstaendigkeit",
      value: `${fmtPercent.format(data.dataCompleteness)} %`,
    },
    {
      label: "Anzahl Anlagen",
      value: fmtInt.format(data.turbineCount),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <Card key={kpi.label}>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">{kpi.label}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{kpi.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Turbine Comparison Module
// -----------------------------------------------------------------------------

function TurbineComparisonModule({
  data,
}: {
  data: TurbineComparisonRow[];
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState message="Keine Anlagenvergleichsdaten vorhanden" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Anlage</TableHead>
              <TableHead className="text-right">Produktion (kWh)</TableHead>
              <TableHead className="text-right">
                Durchschn. Leistung (kW)
              </TableHead>
              <TableHead className="text-right">
                Durchschn. Wind (m/s)
              </TableHead>
              <TableHead className="text-right">Datenpunkte</TableHead>
              <TableHead className="text-right">
                Verfuegbarkeit (%)
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.turbineId}>
                <TableCell className="font-medium">
                  {row.designation}
                </TableCell>
                <TableCell className="text-right">
                  {fmtInt.format(row.totalProductionKwh)}
                </TableCell>
                <TableCell className="text-right">
                  {fmtDec1.format(row.avgPowerKw)}
                </TableCell>
                <TableCell className="text-right">
                  {row.avgWindSpeed != null
                    ? fmtDec1.format(row.avgWindSpeed)
                    : "k.A."}
                </TableCell>
                <TableCell className="text-right">
                  {fmtInt.format(row.dataPoints)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant={
                      row.availability >= 95
                        ? "default"
                        : row.availability >= 80
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {fmtPercent.format(row.availability)} %
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
