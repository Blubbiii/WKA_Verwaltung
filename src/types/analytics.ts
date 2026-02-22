// =============================================================================
// Windpark Analytics - Shared TypeScript Interfaces
// =============================================================================

// Turbine metadata for analytics context
export interface AnalyticsTurbineMeta {
  id: string;
  designation: string;
  parkId: string;
  parkName: string;
  ratedPowerKw: number;
}

// --- Performance ---

export interface TurbinePerformanceKpi {
  turbineId: string;
  designation: string;
  parkName: string;
  ratedPowerKw: number;
  productionKwh: number;
  hoursInPeriod: number;
  capacityFactor: number;   // (actualKwh / (ratedKw * hours)) * 100
  specificYield: number;    // kWh / kW installed
  avgWindSpeed: number | null;
  dataPoints: number;
  dataCompleteness: number; // percentage 0-100
}

export interface FleetPerformanceSummary {
  totalProductionKwh: number;
  avgCapacityFactor: number;
  avgSpecificYield: number;
  totalInstalledKw: number;
  avgWindSpeed: number | null;
}

export interface PerformanceOverviewResponse {
  turbines: TurbinePerformanceKpi[];
  fleet: FleetPerformanceSummary;
  heatmap: HeatmapData[];
  yearOverYear: YearOverYearData[];
}

// --- Heatmap (reusable) ---

export interface HeatmapCell {
  month: number;  // 1-12
  year: number;
  value: number;
  normalized: number; // 0-1 for color scale
}

export interface HeatmapData {
  turbineId: string;
  designation: string;
  months: HeatmapCell[];
}

// --- Year over Year ---

export interface YearOverYearData {
  month: number;  // 1-12
  label: string;  // "Jan", "Feb", etc.
  currentYear: number;
  previousYear: number;
}

// --- Availability (IEC 61400-26) ---

export interface AvailabilityBreakdown {
  turbineId: string;
  designation: string;
  t1: number;  // Production (seconds)
  t2: number;  // Waiting / Standstill
  t3: number;  // Environmental stop
  t4: number;  // Maintenance
  t5: number;  // Failure
  t6: number;  // Other
  t5_1: number; // External: Grid
  t5_2: number; // External: Remote shutdown
  t5_3: number; // External: Other
  availabilityPct: number;
  totalSeconds: number;
}

export interface AvailabilityTrendPoint {
  month: number;
  year: number;
  label: string;
  avgAvailability: number;
  turbineCount: number;
}

export interface ParetoItem {
  category: string;  // "t2", "t3", "t4", "t5", "t6"
  label: string;     // German label
  totalSeconds: number;
  percentage: number;   // of total downtime
  cumulative: number;   // cumulative percentage
}

export interface AvailabilityResponse {
  breakdown: AvailabilityBreakdown[];
  trend: AvailabilityTrendPoint[];
  heatmap: HeatmapData[];
  pareto: ParetoItem[];
  fleet: {
    avgAvailability: number;
    totalProductionHours: number;
    totalDowntimeHours: number;
    totalMaintenanceHours: number;
  };
}

// --- Turbine Comparison ---

export interface TurbineComparisonEntry {
  turbineId: string;
  designation: string;
  parkName: string;
  ratedPowerKw: number;
  productionKwh: number;
  capacityFactor: number;
  specificYield: number;
  avgWindSpeed: number | null;
  avgPowerKw: number;
  deviationFromFleetPct: number;
  rank: number;
}

export interface PowerCurvePoint {
  windSpeed: number;
  avgPowerKw: number;
}

export interface TurbineComparisonResponse {
  comparison: TurbineComparisonEntry[];
  powerCurves: Array<{
    turbineId: string;
    designation: string;
    curve: PowerCurvePoint[];
  }>;
}

// --- Faults & Warnings ---

export interface FaultParetoItem {
  state: number;
  subState: number;
  isFault: boolean;
  label: string;
  totalFrequency: number;
  totalDurationSeconds: number;
  percentage: number;
  cumulative: number;
}

export interface WarningTrendPoint {
  month: number;
  year: number;
  label: string;
  totalFrequency: number;
  totalDurationSeconds: number;
}

export interface FaultsResponse {
  statePareto: FaultParetoItem[];
  warningTrend: WarningTrendPoint[];
  perTurbine: Array<{
    turbineId: string;
    designation: string;
    totalFaultDuration: number;
    totalFaultCount: number;
    productionLossEstimateKwh: number;
  }>;
}

// --- Environment ---

export interface WindDistributionBin {
  windSpeedBin: number;  // 0, 1, 2, ... m/s
  count: number;
  percentage: number;
}

export interface SeasonalPatternPoint {
  month: number;
  label: string;
  avgWindSpeed: number;
  avgPowerKw: number;
  avgAirPressure: number | null;
  avgHumidity: number | null;
  avgRain: number | null;
}

export interface DirectionEfficiency {
  direction: string;
  directionDeg: number;
  avgPowerKw: number;
  avgWindSpeed: number;
  count: number;
}

export interface EnvironmentResponse {
  windDistribution: WindDistributionBin[];
  seasonalPatterns: SeasonalPatternPoint[];
  directionEfficiency: DirectionEfficiency[];
  summary: {
    avgWindSpeed: number;
    avgAirPressure: number | null;
    avgHumidity: number | null;
    totalRain: number | null;
  };
}

// --- Financial ---

export interface MonthlyRevenuePoint {
  month: number;
  year: number;
  label: string;
  revenueEur: number;
  productionKwh: number;
  revenuePerKwh: number | null;
}

export interface FinancialResponse {
  monthly: MonthlyRevenuePoint[];
  lostRevenue: {
    totalLostKwh: number;
    estimatedLostEur: number;
    avgRevenuePerKwh: number | null;
  };
  summary: {
    totalRevenueEur: number;
    totalProductionKwh: number;
    avgRevenuePerKwh: number | null;
  };
}

// --- Portal Analytics ---

export interface PortalAnalyticsKpis {
  monthlyProductionMwh: number;
  previousYearMonthlyMwh: number;
  capacityFactor: number;
  availabilityPct: number;
  specificYield: number;
  trendIndicator: "green" | "yellow" | "red";
}

export interface PortalTurbineOverview {
  designation: string;
  productionMwh: number;
  availabilityPct: number;
  status: "good" | "warning" | "poor";
}

export interface PortalAnalyticsResponse {
  kpis: PortalAnalyticsKpis;
  productionChart: YearOverYearData[];
  availabilityTrend: AvailabilityTrendPoint[];
  turbineOverview: PortalTurbineOverview[];
  windSummary: {
    avgWindSpeed: number;
    dominantDirection: string;
  };
}

// --- Analytics Module Types (for report configuration) ---

export const ANALYTICS_MODULES = {
  // Performance modules
  performanceKpis: { label: "Performance-KPIs", group: "Performance" },
  productionHeatmap: { label: "Produktions-Heatmap", group: "Performance" },
  turbineRanking: { label: "Turbinen-Ranking", group: "Performance" },
  yearOverYear: { label: "Jahresvergleich", group: "Performance" },
  // Availability modules
  availabilityBreakdown: { label: "Verfuegbarkeit T1-T6", group: "Verfuegbarkeit" },
  availabilityTrend: { label: "Verfuegbarkeits-Trend", group: "Verfuegbarkeit" },
  availabilityHeatmap: { label: "Verfuegbarkeits-Heatmap", group: "Verfuegbarkeit" },
  downtimePareto: { label: "Ausfallzeiten-Pareto", group: "Verfuegbarkeit" },
  // Comparison modules
  turbineComparison: { label: "Turbinen-Vergleich", group: "Vergleich" },
  powerCurveOverlay: { label: "Leistungskurven-Overlay", group: "Vergleich" },
  // Fault modules
  faultPareto: { label: "Stoerungen-Pareto", group: "Stoerungen" },
  warningTrend: { label: "Warnungs-Trend", group: "Stoerungen" },
  // Environment modules
  windDistribution: { label: "Windverteilung", group: "Wind & Umwelt" },
  environmentalData: { label: "Umweltdaten", group: "Wind & Umwelt" },
  // Financial modules
  financialOverview: { label: "Finanz-Uebersicht", group: "Finanzen" },
  revenueComparison: { label: "Erloesvergleich", group: "Finanzen" },
} as const;

export type AnalyticsModuleType = keyof typeof ANALYTICS_MODULES;

// --- IEC 61400-26 T-Category Colors ---

export const T_CATEGORIES = {
  t1: { label: "Produktion", color: "#22c55e" },
  t2: { label: "Windstille", color: "#60a5fa" },
  t3: { label: "Umweltstopp", color: "#f59e0b" },
  t4: { label: "Wartung", color: "#a855f7" },
  t5: { label: "Stoerung", color: "#ef4444" },
  t6: { label: "Sonstige", color: "#6b7280" },
} as const;

export type TCategory = keyof typeof T_CATEGORIES;

// --- German month labels ---

export const MONTH_LABELS = [
  "Jan", "Feb", "M\u00e4r", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
] as const;
