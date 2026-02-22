"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { Radio, BarChart3, TrendingUp, Layers } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useParks } from "@/hooks/useParks";
import {
  ProductionChart,
  PowerCurveChart,
  WindRoseChart,
  DailyChart,
} from "@/components/energy/charts-dynamic";

// =============================================================================
// Types
// =============================================================================

interface Turbine {
  id: string;
  designation: string;
  parkId: string;
}

interface ScadaProduction {
  turbineId: string;
  turbineDesignation: string;
  parkName: string;
  periodStart: string;
  productionKwh: number;
  avgPowerKw: number;
  avgWindSpeed: number | null;
  dataPoints: number;
}

interface ProductionsResponse {
  data: ScadaProduction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  aggregations: {
    totalProductionKwh: number;
    avgPowerKw: number;
    avgWindSpeed: number | null;
    totalDataPoints: number;
  };
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

interface WindRoseResponse {
  data: WindRoseDataPoint[];
  meta: {
    totalMeasurements: number;
    avgWindSpeed: number;
    dominantDirection: string;
  };
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

interface PowerCurveResponse {
  scatter: PowerCurveScatter[];
  curve: PowerCurveBinned[];
  meta: {
    totalPoints: number;
  };
}

// =============================================================================
// Chart Options
// =============================================================================

type Interval = "10min" | "hour" | "day" | "month" | "year";
type ChartType = "bar" | "line" | "area";

const INTERVAL_LABELS: Record<Interval, string> = {
  "10min": "10 Min",
  hour: "Stunde",
  day: "Tag",
  month: "Monat",
  year: "Jahr",
};

const CHART_TYPE_OPTIONS: { value: ChartType; label: string; icon: React.ElementType }[] = [
  { value: "bar", label: "Balken", icon: BarChart3 },
  { value: "line", label: "Linie", icon: TrendingUp },
  { value: "area", label: "Flaeche", icon: Layers },
];

const INTERVAL_DESCRIPTIONS: Record<Interval, string> = {
  "10min": "10-Minuten-Messwerte",
  hour: "Stuendliche Aggregation",
  day: "Taegliche Aggregation",
  month: "Monatliche Aggregation",
  year: "Jaehrliche Aggregation",
};

// =============================================================================
// Constants
// =============================================================================

const currentYear = new Date().getFullYear();

function getDefaultFrom(): string {
  return `${currentYear}-01-01`;
}

function getDefaultTo(): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getDefaultDailyDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yyyy = yesterday.getFullYear();
  const mm = String(yesterday.getMonth() + 1).padStart(2, "0");
  const dd = String(yesterday.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// =============================================================================
// Fetcher
// =============================================================================

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ error: "Unbekannter Fehler" }));
    throw new Error(error.error || "Fehler beim Laden");
  }
  return res.json();
};

// =============================================================================
// Component
// =============================================================================

export function DataExplorerTab() {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [activeSubTab, setActiveSubTab] = useState<string>("production");
  const [selectedParkId, setSelectedParkId] = useState<string>("all");
  const [selectedTurbineId, setSelectedTurbineId] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>(getDefaultFrom);
  const [toDate, setToDate] = useState<string>(getDefaultTo);
  const [dailyDate, setDailyDate] = useState<string>(getDefaultDailyDate);

  // Chart options
  const [prodInterval, setProdInterval] = useState<Interval>("month");
  const [prodChartType, setProdChartType] = useState<ChartType>("bar");
  const [dailyChartType, setDailyChartType] = useState<ChartType>("area");

  // ---------------------------------------------------------------------------
  // Parks + Turbines
  // ---------------------------------------------------------------------------

  const { parks, isLoading: parksLoading } = useParks();

  const [turbines, setTurbines] = useState<Turbine[]>([]);
  const [turbinesLoading, setTurbinesLoading] = useState(false);

  useEffect(() => {
    if (selectedParkId && selectedParkId !== "all") {
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
      setSelectedTurbineId("all");
    }
  }, [selectedParkId]);

  // ---------------------------------------------------------------------------
  // API Queries
  // ---------------------------------------------------------------------------

  // -- Production (variable interval) --
  const productionParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("interval", prodInterval);
    if (selectedParkId !== "all") params.set("parkId", selectedParkId);
    if (selectedTurbineId !== "all") params.set("turbineId", selectedTurbineId);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    params.set("limit", "500");
    return params.toString();
  }, [prodInterval, selectedParkId, selectedTurbineId, fromDate, toDate]);

  const {
    data: productionData,
    error: productionError,
    isLoading: productionLoading,
  } = useSWR<ProductionsResponse>(
    activeSubTab === "production"
      ? `/api/energy/scada/productions?${productionParams}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // -- Power Curve --
  const powerCurveParams = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedParkId !== "all") params.set("parkId", selectedParkId);
    if (selectedTurbineId !== "all") params.set("turbineId", selectedTurbineId);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    params.set("limit", "5000");
    return params.toString();
  }, [selectedParkId, selectedTurbineId, fromDate, toDate]);

  const {
    data: powerCurveData,
    error: powerCurveError,
    isLoading: powerCurveLoading,
  } = useSWR<PowerCurveResponse>(
    activeSubTab === "power-curve"
      ? `/api/energy/scada/power-curve?${powerCurveParams}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // -- Wind Rose --
  const windRoseParams = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedParkId !== "all") params.set("parkId", selectedParkId);
    if (selectedTurbineId !== "all") params.set("turbineId", selectedTurbineId);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    return params.toString();
  }, [selectedParkId, selectedTurbineId, fromDate, toDate]);

  const {
    data: windRoseData,
    error: windRoseError,
    isLoading: windRoseLoading,
  } = useSWR<WindRoseResponse>(
    activeSubTab === "wind-rose"
      ? `/api/energy/scada/wind-rose?${windRoseParams}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // -- Daily (10min interval) --
  const dailyNextDay = useMemo(() => {
    const d = new Date(dailyDate);
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, [dailyDate]);

  const dailyParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("interval", "10min");
    if (selectedParkId !== "all") params.set("parkId", selectedParkId);
    if (selectedTurbineId !== "all") params.set("turbineId", selectedTurbineId);
    params.set("from", dailyDate);
    params.set("to", dailyNextDay);
    params.set("limit", "500");
    return params.toString();
  }, [selectedParkId, selectedTurbineId, dailyDate, dailyNextDay]);

  const {
    data: dailyData,
    error: dailyError,
    isLoading: dailyLoading,
  } = useSWR<ProductionsResponse>(
    activeSubTab === "daily"
      ? `/api/energy/scada/productions?${dailyParams}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleParkChange = (value: string) => {
    setSelectedParkId(value);
    setSelectedTurbineId("all");
  };

  const handleTurbineChange = (value: string) => {
    setSelectedTurbineId(value);
  };

  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFromDate(e.target.value);
  };

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setToDate(e.target.value);
  };

  const handleDailyDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDailyDate(e.target.value);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:flex-wrap">
        {/* Park Filter */}
        <Select value={selectedParkId} onValueChange={handleParkChange}>
          <SelectTrigger className="w-[180px]">
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

        {/* Turbine Filter */}
        <Select
          value={selectedTurbineId}
          onValueChange={handleTurbineChange}
          disabled={selectedParkId === "all" || turbinesLoading}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue
              placeholder={
                selectedParkId === "all"
                  ? "Zuerst Park waehlen"
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

        {/* Von Date */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="explorer-filter-from"
            className="text-sm font-medium text-muted-foreground whitespace-nowrap"
          >
            Von
          </label>
          <input
            id="explorer-filter-from"
            type="date"
            value={fromDate}
            onChange={handleFromChange}
            className="flex h-9 w-[150px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {/* Bis Date */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="explorer-filter-to"
            className="text-sm font-medium text-muted-foreground whitespace-nowrap"
          >
            Bis
          </label>
          <input
            id="explorer-filter-to"
            type="date"
            value={toDate}
            onChange={handleToChange}
            className="flex h-9 w-[150px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>

      {/* Chart Sub-Tabs */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList>
          <TabsTrigger value="production">Produktion</TabsTrigger>
          <TabsTrigger value="power-curve">Leistungskurve</TabsTrigger>
          <TabsTrigger value="wind-rose">Windrose</TabsTrigger>
          <TabsTrigger value="daily">Tagesverlauf</TabsTrigger>
        </TabsList>

        {/* Tab 1: Produktion */}
        <TabsContent value="production">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Produktion</CardTitle>
                  <CardDescription>
                    {INTERVAL_DESCRIPTIONS[prodInterval]}
                    {selectedParkId !== "all" ? " - gruppiert nach Anlage" : ""}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  {/* Interval Selector */}
                  <Tabs value={prodInterval} onValueChange={(v) => setProdInterval(v as Interval)}>
                    <TabsList className="h-8">
                      {(Object.entries(INTERVAL_LABELS) as [Interval, string][]).map(([val, label]) => (
                        <TabsTrigger key={val} value={val} className="text-xs px-2 py-1">
                          {label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  {/* Chart Type Selector */}
                  <div className="flex items-center border rounded-md">
                    {CHART_TYPE_OPTIONS.map(({ value, label, icon: Icon }) => (
                      <Button
                        key={value}
                        variant={prodChartType === value ? "default" : "ghost"}
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => setProdChartType(value)}
                        title={label}
                      >
                        <Icon className="h-4 w-4" />
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {productionLoading || parksLoading ? (
                <Skeleton className="h-[400px] w-full" />
              ) : productionError ? (
                <div className="flex items-center justify-center h-[400px] text-destructive">
                  Fehler beim Laden der Produktionsdaten
                </div>
              ) : !productionData?.data || productionData.data.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[400px] gap-2">
                  <Radio className="h-8 w-8 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Keine Produktionsdaten fuer den ausgewaehlten Zeitraum
                  </p>
                </div>
              ) : (
                <ProductionChart
                  data={productionData.data}
                  hasParkFilter={selectedParkId !== "all"}
                  interval={prodInterval}
                  chartType={prodChartType}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Leistungskurve */}
        <TabsContent value="power-curve">
          <Card>
            <CardHeader>
              <CardTitle>Leistungskurve</CardTitle>
              <CardDescription>
                Zusammenhang zwischen Windgeschwindigkeit und elektrischer
                Leistung
              </CardDescription>
            </CardHeader>
            <CardContent>
              {powerCurveLoading || parksLoading ? (
                <Skeleton className="h-[400px] w-full" />
              ) : powerCurveError ? (
                <div className="flex items-center justify-center h-[400px] text-destructive">
                  Fehler beim Laden der Leistungskurvendaten
                </div>
              ) : !powerCurveData ||
                ((!powerCurveData.scatter ||
                  powerCurveData.scatter.length === 0) &&
                  (!powerCurveData.curve ||
                    powerCurveData.curve.length === 0)) ? (
                <div className="flex flex-col items-center justify-center h-[400px] gap-2">
                  <Radio className="h-8 w-8 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Keine Leistungskurvendaten fuer den ausgewaehlten Zeitraum
                  </p>
                </div>
              ) : (
                <PowerCurveChart
                  scatter={powerCurveData.scatter}
                  curve={powerCurveData.curve}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Windrose */}
        <TabsContent value="wind-rose">
          <Card>
            <CardHeader>
              <CardTitle>Windrose</CardTitle>
              <CardDescription>
                Windrichtungsverteilung nach Geschwindigkeitsbereichen
              </CardDescription>
            </CardHeader>
            <CardContent>
              {windRoseLoading || parksLoading ? (
                <Skeleton className="h-[400px] w-full" />
              ) : windRoseError ? (
                <div className="flex items-center justify-center h-[400px] text-destructive">
                  Fehler beim Laden der Windrosendaten
                </div>
              ) : !windRoseData?.data || windRoseData.data.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[400px] gap-2">
                  <Radio className="h-8 w-8 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Keine Windrosendaten fuer den ausgewaehlten Zeitraum
                  </p>
                </div>
              ) : (
                <WindRoseChart
                  data={windRoseData.data}
                  meta={windRoseData.meta}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Tagesverlauf */}
        <TabsContent value="daily">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Tagesverlauf</CardTitle>
                  <CardDescription>
                    Leistung und Windgeschwindigkeit im Tagesverlauf (10-Minuten-Intervall)
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  {/* Day Picker */}
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="explorer-daily-date"
                      className="text-sm font-medium text-muted-foreground whitespace-nowrap"
                    >
                      Tag
                    </label>
                    <input
                      id="explorer-daily-date"
                      type="date"
                      value={dailyDate}
                      onChange={handleDailyDateChange}
                      className="flex h-9 w-[150px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                  {/* Chart Type Selector */}
                  <div className="flex items-center border rounded-md">
                    {CHART_TYPE_OPTIONS.map(({ value, label, icon: Icon }) => (
                      <Button
                        key={value}
                        variant={dailyChartType === value ? "default" : "ghost"}
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => setDailyChartType(value)}
                        title={label}
                      >
                        <Icon className="h-4 w-4" />
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {dailyLoading || parksLoading ? (
                <Skeleton className="h-[400px] w-full" />
              ) : dailyError ? (
                <div className="flex items-center justify-center h-[400px] text-destructive">
                  Fehler beim Laden der Tagesverlaufsdaten
                </div>
              ) : !dailyData?.data || dailyData.data.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[400px] gap-2">
                  <Radio className="h-8 w-8 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Keine Daten fuer den ausgewaehlten Tag
                  </p>
                </div>
              ) : (
                <DailyChart data={dailyData.data} chartType={dailyChartType} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
