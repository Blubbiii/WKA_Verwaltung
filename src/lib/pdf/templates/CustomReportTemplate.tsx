/**
 * Custom Report PDF Template
 *
 * Renders modular analytics pages based on selected modules.
 * Each selected module gets its own Page in the Document.
 */

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Svg,
  Rect as SvgRect,
} from "@react-pdf/renderer";
import { formatNumber, formatDate } from "../utils/formatters";
import { formatCurrency } from "@/lib/format";
import { PdfPowerCurve } from "../charts/PdfPowerCurve";
import { PdfWindDistribution } from "../charts/PdfWindDistribution";
import { PageNumber } from "./components/Footer";
import type {
  TurbinePerformanceKpi,
  FleetPerformanceSummary,
  HeatmapData,
  YearOverYearData,
  AvailabilityBreakdown,
  AvailabilityTrendPoint,
  ParetoItem,
  TurbineComparisonResponse,
  FaultParetoItem,
  WarningTrendPoint,
  WindDistributionBin,
  DirectionEfficiency,
  MonthlyRevenuePoint,
} from "@/types/analytics";
import { ANALYTICS_MODULES } from "@/types/analytics";

// =============================================================================
// Design Tokens (same as MonthlyReportTemplate)
// =============================================================================

const C = {
  navy: "#1E3A5F",
  navyLight: "#335E99",
  navyPale: "#E8EEF5",
  navyDark: "#142940",
  green: "#16A34A",
  greenLight: "#DCFCE7",
  amber: "#D97706",
  amberLight: "#FEF3C7",
  red: "#DC2626",
  redLight: "#FEE2E2",
  blue: "#2563EB",
  blueLight: "#DBEAFE",
  white: "#FFFFFF",
  gray50: "#F9FAFB",
  gray100: "#F3F4F6",
  gray200: "#E5E7EB",
  gray300: "#D1D5DB",
  gray400: "#9CA3AF",
  gray500: "#6B7280",
  gray600: "#4B5563",
  gray700: "#374151",
  gray800: "#1F2937",
  gray900: "#111827",
};

// =============================================================================
// StyleSheet
// =============================================================================

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.gray800,
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 35,
  },
  content: { flex: 1 },

  // ---- Section Header ----
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    marginTop: 4,
  },
  sectionAccent: {
    width: 3,
    height: 16,
    backgroundColor: C.navyLight,
    borderRadius: 1,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: C.navy,
  },
  sectionSubtitle: {
    fontSize: 8,
    color: C.gray500,
    marginLeft: "auto",
  },

  // ---- Page header bar ----
  pageHeaderBar: {
    backgroundColor: C.navy,
    marginHorizontal: -35,
    marginTop: -40,
    paddingHorizontal: 35,
    paddingVertical: 12,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pageHeaderTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: C.white,
  },
  pageHeaderMeta: {
    fontSize: 8,
    color: C.navyPale,
  },

  // ---- Cover Page ----
  coverPage: {
    fontFamily: "Helvetica",
    backgroundColor: C.navyDark,
  },
  coverBanner: {
    backgroundColor: C.navy,
    paddingHorizontal: 50,
    paddingTop: 80,
    paddingBottom: 40,
    marginBottom: 0,
  },
  coverLabel: {
    fontSize: 9,
    color: C.navyPale,
    textTransform: "uppercase" as const,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  coverTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: C.white,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  coverParkName: {
    fontSize: 18,
    color: C.navyPale,
    marginBottom: 24,
  },
  coverDivider: {
    width: 60,
    height: 3,
    backgroundColor: "#C09B4A",
    marginBottom: 20,
  },
  coverMetaRow: {
    flexDirection: "row",
    gap: 40,
    marginBottom: 10,
  },
  coverMetaItem: {},
  coverMetaLabel: {
    fontSize: 7,
    color: C.navyPale,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  coverMetaValue: {
    fontSize: 11,
    fontWeight: "bold",
    color: C.white,
  },
  coverModulesSection: {
    paddingHorizontal: 50,
    paddingTop: 30,
    paddingBottom: 50,
  },
  coverModulesTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: C.navyPale,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  coverModulesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  coverModuleBadge: {
    backgroundColor: C.navyLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 3,
  },
  coverModuleBadgeText: {
    fontSize: 8,
    color: C.white,
    fontWeight: "bold",
  },
  coverGeneratedAt: {
    fontSize: 7,
    color: C.gray500,
    paddingHorizontal: 50,
    paddingBottom: 20,
  },

  // ---- KPI Row ----
  kpiGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: C.white,
    borderTopWidth: 4,
    borderTopColor: C.navyLight,
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 3,
    padding: 10,
  },
  kpiLabel: {
    fontSize: 7,
    color: C.gray500,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: C.navy,
  },
  kpiUnit: {
    fontSize: 7,
    color: C.gray400,
    marginTop: 2,
  },

  // ---- Tables ----
  table: { marginBottom: 12 },
  tHead: {
    flexDirection: "row",
    backgroundColor: C.navy,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  tHeadText: {
    fontSize: 7,
    fontWeight: "bold",
    color: C.white,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
  },
  tRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: C.gray200,
  },
  tRowAlt: { backgroundColor: C.gray50 },
  tCell: { fontSize: 8, color: C.gray700 },
  tCellRight: { fontSize: 8, color: C.gray700, textAlign: "right" },
  tCellBold: { fontSize: 8, fontWeight: "bold", color: C.gray800 },
  tCellGreen: { fontSize: 8, fontWeight: "bold", color: C.green },
  tCellAmber: { fontSize: 8, fontWeight: "bold", color: C.amber },
  tCellRed: { fontSize: 8, fontWeight: "bold", color: C.red },
  tFoot: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: C.navyDark,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  tFootText: { fontSize: 8, fontWeight: "bold", color: C.white },
  tFootRight: { fontSize: 8, fontWeight: "bold", color: C.white, textAlign: "right" },

  // ---- No data ----
  noData: {
    padding: 24,
    textAlign: "center",
    color: C.gray400,
    fontSize: 9,
    fontStyle: "italic",
    backgroundColor: C.gray50,
    borderRadius: 4,
    marginBottom: 12,
  },

  // ---- Divider ----
  divider: { height: 1, backgroundColor: C.gray200, marginVertical: 10 },

  // ---- Summary box ----
  summaryBox: {
    backgroundColor: C.navyPale,
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 4,
    padding: 10,
    marginBottom: 12,
    flexDirection: "row",
    gap: 20,
    flexWrap: "wrap",
  },
  summaryItem: {},
  summaryLabel: { fontSize: 7, color: C.gray500, marginBottom: 2 },
  summaryValue: { fontSize: 10, fontWeight: "bold", color: C.navy },
});

// =============================================================================
// Data Interface
// =============================================================================

export interface CustomReportData {
  parkName: string;
  year: number;
  month?: number;
  generatedAt: string;
  tenantName: string;
  selectedModules: string[];

  performanceKpis?: { turbines: TurbinePerformanceKpi[]; fleet: FleetPerformanceSummary };
  productionHeatmap?: HeatmapData[];
  yearOverYear?: YearOverYearData[];
  availabilityBreakdown?: AvailabilityBreakdown[];
  availabilityTrend?: AvailabilityTrendPoint[];
  availabilityHeatmap?: HeatmapData[];
  downtimePareto?: ParetoItem[];
  turbineComparison?: TurbineComparisonResponse;
  faultPareto?: FaultParetoItem[];
  warningTrend?: WarningTrendPoint[];
  windDistribution?: WindDistributionBin[];
  environmentalData?: DirectionEfficiency[];
  financialOverview?: { totalRevenueEur: number; totalProductionKwh: number; avgRevenuePerKwh: number | null };
  revenueComparison?: MonthlyRevenuePoint[];
}

// =============================================================================
// Helper Functions
// =============================================================================

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function fmtNum(v: number | null | undefined, dec = 2): string {
  if (v == null) return "k.A.";
  return formatNumber(v, dec);
}

function fmtMwh(v: number | null | undefined): string {
  if (v == null) return "k.A.";
  return `${formatNumber(v / 1000, 2)} MWh`;
}

function fmtHours(seconds: number): string {
  return `${formatNumber(seconds / 3600, 1)} h`;
}

function cfColor(cf: number): string {
  if (cf >= 30) return C.green;
  if (cf >= 15) return C.amber;
  return C.red;
}

function heatmapCellBg(normalized: number): string {
  // normalized: 0-1, map to navy intensity
  const alpha = Math.round(normalized * 200);
  const r = Math.round(30 + (1 - normalized) * 200);
  const g = Math.round(58 + (1 - normalized) * 160);
  const b = Math.round(95 + (1 - normalized) * 120);
  return `rgb(${r},${g},${b})`;
}

function availHeatmapCellBg(normalized: number): string {
  // green for high, red for low
  if (normalized > 0.9) return C.greenLight;
  if (normalized > 0.7) return C.amberLight;
  return C.redLight;
}

function availHeatmapCellTextColor(normalized: number): string {
  if (normalized > 0.9) return C.green;
  if (normalized > 0.7) return C.amber;
  return C.red;
}

function getModuleLabel(key: string): string {
  if (key in ANALYTICS_MODULES) {
    return ANALYTICS_MODULES[key as keyof typeof ANALYTICS_MODULES].label;
  }
  const classic: Record<string, string> = {
    kpiSummary: "KPI-Zusammenfassung",
    production: "Produktion",
    powerCurve: "Leistungskurve",
    windRose: "Windrose",
    dailyProfile: "Tagesprofil",
  };
  return classic[key] ?? key;
}

// =============================================================================
// Sub-components
// =============================================================================

function PageHeader({ title, parkName, year }: { title: string; parkName: string; year: number }) {
  return (
    <View style={s.pageHeaderBar} fixed>
      <Text style={s.pageHeaderTitle}>{title}</Text>
      <Text style={s.pageHeaderMeta}>{parkName} | {year}</Text>
    </View>
  );
}

function SectionHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={s.sectionHeader}>
      <View style={s.sectionAccent} />
      <Text style={s.sectionTitle}>{title}</Text>
      {subtitle && <Text style={s.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

function NoData() {
  return <Text style={s.noData}>Keine Daten verfügbar</Text>;
}

// Simple horizontal bar using SVG
function HBar({ fraction, color, height = 10 }: { fraction: number; color: string; height?: number }) {
  const w = 120;
  const filled = Math.max(0, Math.min(1, fraction)) * w;
  return (
    <Svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
      <SvgRect x={0} y={0} width={w} height={height} fill={C.gray100} rx={2} />
      <SvgRect x={0} y={0} width={filled} height={height} fill={color} rx={2} />
    </Svg>
  );
}

// =============================================================================
// Cover Page
// =============================================================================

function CoverPage({ data }: { data: CustomReportData }) {
  const periodLabel = data.month
    ? `${MONTH_NAMES[data.month - 1]} ${data.year}`
    : String(data.year);

  return (
    <Page size="A4" style={s.coverPage}>
      <View style={s.coverBanner}>
        <Text style={s.coverLabel}>Windpark Analytics</Text>
        <Text style={s.coverTitle}>Benutzerdefinierter Bericht</Text>
        <Text style={s.coverParkName}>{data.parkName}</Text>
        <View style={s.coverDivider} />
        <View style={s.coverMetaRow}>
          <View style={s.coverMetaItem}>
            <Text style={s.coverMetaLabel}>Berichtszeitraum</Text>
            <Text style={s.coverMetaValue}>{periodLabel}</Text>
          </View>
          <View style={s.coverMetaItem}>
            <Text style={s.coverMetaLabel}>Mandant</Text>
            <Text style={s.coverMetaValue}>{data.tenantName}</Text>
          </View>
          <View style={s.coverMetaItem}>
            <Text style={s.coverMetaLabel}>Module</Text>
            <Text style={s.coverMetaValue}>{data.selectedModules.length}</Text>
          </View>
        </View>
      </View>

      <View style={s.coverModulesSection}>
        <Text style={s.coverModulesTitle}>Enthaltene Module</Text>
        <View style={s.coverModulesGrid}>
          {data.selectedModules.map((key) => (
            <View key={key} style={s.coverModuleBadge}>
              <Text style={s.coverModuleBadgeText}>{getModuleLabel(key)}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={s.coverGeneratedAt}>
        Erstellt am {formatDate(data.generatedAt)} | WindparkManager
      </Text>

      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Performance KPIs Page
// =============================================================================

function PerformanceKpisPage({ data }: { data: CustomReportData }) {
  const kpis = data.performanceKpis;
  const park = data.parkName;
  const year = data.year;

  if (!kpis) return null;

  const { fleet, turbines } = kpis;

  return (
    <Page size="A4" style={s.page}>
      <PageHeader title="Performance-KPIs" parkName={park} year={year} />
      <SectionHead title="Fleet-Übersicht" subtitle={String(year)} />

      {/* Fleet KPI row */}
      <View style={s.kpiGrid} wrap={false}>
        <View style={s.kpiCard}>
          <Text style={s.kpiLabel}>Gesamtproduktion</Text>
          <Text style={s.kpiValue}>{formatNumber(fleet.totalProductionKwh / 1000, 1)}</Text>
          <Text style={s.kpiUnit}>MWh</Text>
        </View>
        <View style={s.kpiCard}>
          <Text style={s.kpiLabel}>Ø Kapazitätsfaktor</Text>
          <Text style={s.kpiValue}>{formatNumber(fleet.avgCapacityFactor, 1)}</Text>
          <Text style={s.kpiUnit}>%</Text>
        </View>
        <View style={s.kpiCard}>
          <Text style={s.kpiLabel}>Ø Spezifischer Ertrag</Text>
          <Text style={s.kpiValue}>{formatNumber(fleet.avgSpecificYield, 0)}</Text>
          <Text style={s.kpiUnit}>kWh/kW</Text>
        </View>
        <View style={s.kpiCard}>
          <Text style={s.kpiLabel}>Installierte Leistung</Text>
          <Text style={s.kpiValue}>{formatNumber(fleet.totalInstalledKw / 1000, 2)}</Text>
          <Text style={s.kpiUnit}>MW</Text>
        </View>
      </View>

      <View style={s.divider} />
      <SectionHead title="Turbinen-Detail" />

      <View style={s.table}>
        <View style={s.tHead}>
          <Text style={[s.tHeadText, { width: "20%" }]}>Anlage</Text>
          <Text style={[s.tHeadText, { width: "20%", textAlign: "right" }]}>Produktion</Text>
          <Text style={[s.tHeadText, { width: "18%", textAlign: "right" }]}>Kap.faktor</Text>
          <Text style={[s.tHeadText, { width: "22%", textAlign: "right" }]}>Sp. Ertrag</Text>
          <Text style={[s.tHeadText, { width: "12%", textAlign: "right" }]}>Wind</Text>
          <Text style={[s.tHeadText, { width: "8%", textAlign: "right" }]}>Vollst.</Text>
        </View>
        {turbines.map((t, i) => (
          <View key={t.turbineId} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
            <Text style={[s.tCell, { width: "20%" }]}>{t.designation}</Text>
            <Text style={[s.tCellRight, { width: "20%" }]}>
              {fmtNum(t.productionKwh / 1000, 1)} MWh
            </Text>
            <Text style={[
              s.tCellRight,
              { width: "18%", color: cfColor(t.capacityFactor), fontWeight: "bold" },
            ]}>
              {fmtNum(t.capacityFactor, 1)} %
            </Text>
            <Text style={[s.tCellRight, { width: "22%" }]}>
              {fmtNum(t.specificYield, 0)} kWh/kW
            </Text>
            <Text style={[s.tCellRight, { width: "12%" }]}>
              {t.avgWindSpeed != null ? `${fmtNum(t.avgWindSpeed, 1)} m/s` : "k.A."}
            </Text>
            <Text style={[s.tCellRight, { width: "8%" }]}>
              {fmtNum(t.dataCompleteness, 0)} %
            </Text>
          </View>
        ))}
        <View style={s.tFoot}>
          <Text style={[s.tFootText, { width: "20%" }]}>Gesamt</Text>
          <Text style={[s.tFootRight, { width: "20%" }]}>
            {formatNumber(fleet.totalProductionKwh / 1000, 1)} MWh
          </Text>
          <Text style={[s.tFootRight, { width: "18%" }]}>
            {formatNumber(fleet.avgCapacityFactor, 1)} %
          </Text>
          <Text style={[s.tFootRight, { width: "22%" }]}>
            {formatNumber(fleet.avgSpecificYield, 0)} kWh/kW
          </Text>
          <Text style={[s.tFootRight, { width: "12%" }]}>
            {fleet.avgWindSpeed != null ? `${formatNumber(fleet.avgWindSpeed, 1)} m/s` : "k.A."}
          </Text>
          <Text style={[s.tFootRight, { width: "8%" }]}></Text>
        </View>
      </View>

      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Production Heatmap Page
// =============================================================================

const MONTH_LABELS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function ProductionHeatmapPage({ data }: { data: CustomReportData }) {
  const heatmap = data.productionHeatmap;
  if (!heatmap || heatmap.length === 0) return null;

  return (
    <Page size="A4" style={s.page}>
      <PageHeader title="Produktions-Heatmap" parkName={data.parkName} year={data.year} />
      <SectionHead title="Monatliche Produktion pro Turbine" subtitle={String(data.year)} />

      <View style={s.table}>
        <View style={s.tHead}>
          <Text style={[s.tHeadText, { width: "14%" }]}>Anlage</Text>
          {MONTH_LABELS_SHORT.map((m) => (
            <Text key={m} style={[s.tHeadText, { width: "6%", textAlign: "center" }]}>{m}</Text>
          ))}
          <Text style={[s.tHeadText, { width: "8%", textAlign: "right" }]}>Gesamt</Text>
        </View>

        {heatmap.map((row, i) => {
          const monthMap = new Map(row.months.map((c) => [c.month, c]));
          const total = row.months.reduce((s, c) => s + c.value, 0);

          return (
            <View key={row.turbineId} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
              <Text style={[s.tCell, { width: "14%" }]}>{row.designation}</Text>
              {Array.from({ length: 12 }, (_, idx) => {
                const cell = monthMap.get(idx + 1);
                const normalized = cell?.normalized ?? 0;
                const bg = cell ? heatmapCellBg(normalized) : C.gray100;
                const textColor = normalized > 0.5 ? C.white : C.gray800;
                return (
                  <View key={idx} style={{ width: "6%", alignItems: "center" }}>
                    <Text style={{
                      fontSize: 6,
                      color: textColor,
                      backgroundColor: bg,
                      paddingVertical: 2,
                      paddingHorizontal: 1,
                      textAlign: "center",
                      width: "100%",
                    }}>
                      {cell ? formatNumber(cell.value / 1000, 0) : "-"}
                    </Text>
                  </View>
                );
              })}
              <Text style={[s.tCellRight, { width: "8%", fontWeight: "bold" }]}>
                {formatNumber(total / 1000, 0)}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={{ fontSize: 7, color: C.gray400, marginTop: 4 }}>
        Werte in MWh. Farbintensität: höhere Produktion = dunklere Farbe.
      </Text>

      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Turbine Ranking Page
// =============================================================================

function TurbineRankingPage({ data }: { data: CustomReportData }) {
  const kpis = data.performanceKpis;
  if (!kpis || kpis.turbines.length === 0) return null;

  const sorted = [...kpis.turbines].sort((a, b) => b.productionKwh - a.productionKwh);
  const maxProd = sorted[0]?.productionKwh ?? 1;

  return (
    <Page size="A4" style={s.page}>
      <PageHeader title="Turbinen-Ranking" parkName={data.parkName} year={data.year} />
      <SectionHead title="Ranking nach Produktion" subtitle={String(data.year)} />

      <View style={s.table}>
        <View style={s.tHead}>
          <Text style={[s.tHeadText, { width: "8%" }]}>Rang</Text>
          <Text style={[s.tHeadText, { width: "20%" }]}>Anlage</Text>
          <Text style={[s.tHeadText, { width: "20%", textAlign: "right" }]}>Produktion (MWh)</Text>
          <Text style={[s.tHeadText, { width: "52%" }]}>Relative Performance</Text>
        </View>

        {sorted.map((t, i) => {
          const fraction = maxProd > 0 ? t.productionKwh / maxProd : 0;
          return (
            <View key={t.turbineId} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
              <Text style={[s.tCell, { width: "8%", fontWeight: "bold", color: C.navyLight }]}>
                {i + 1}.
              </Text>
              <Text style={[s.tCellBold, { width: "20%" }]}>{t.designation}</Text>
              <Text style={[s.tCellRight, { width: "20%" }]}>
                {formatNumber(t.productionKwh / 1000, 2)}
              </Text>
              <View style={{ width: "52%", paddingLeft: 8, justifyContent: "center" }}>
                <HBar fraction={fraction} color={C.navyLight} height={10} />
              </View>
            </View>
          );
        })}
      </View>

      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Year-over-Year Page
// =============================================================================

function YearOverYearPage({ data }: { data: CustomReportData }) {
  const yoy = data.yearOverYear;
  if (!yoy || yoy.length === 0) return null;

  const totalCurrent = yoy.reduce((s, r) => s + r.currentYear, 0);
  const totalPrev = yoy.reduce((s, r) => s + r.previousYear, 0);
  const totalDiff = totalCurrent - totalPrev;
  const totalDiffPct = totalPrev > 0 ? (totalDiff / totalPrev) * 100 : 0;

  return (
    <Page size="A4" style={s.page}>
      <PageHeader title="Jahresvergleich" parkName={data.parkName} year={data.year} />
      <SectionHead title="Produktion: Jahresvergleich" subtitle={`${data.year} vs. ${data.year - 1}`} />

      <View style={s.table}>
        <View style={s.tHead}>
          <Text style={[s.tHeadText, { width: "12%" }]}>Monat</Text>
          <Text style={[s.tHeadText, { width: "26%", textAlign: "right" }]}>{data.year} (MWh)</Text>
          <Text style={[s.tHeadText, { width: "26%", textAlign: "right" }]}>{data.year - 1} (MWh)</Text>
          <Text style={[s.tHeadText, { width: "18%", textAlign: "right" }]}>Differenz</Text>
          <Text style={[s.tHeadText, { width: "18%", textAlign: "right" }]}>Delta %</Text>
        </View>

        {yoy.map((row, i) => {
          const diff = row.currentYear - row.previousYear;
          const pct = row.previousYear > 0 ? (diff / row.previousYear) * 100 : 0;
          const positive = diff >= 0;
          return (
            <View key={row.month} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
              <Text style={[s.tCell, { width: "12%" }]}>{row.label}</Text>
              <Text style={[s.tCellRight, { width: "26%", fontWeight: "bold" }]}>
                {formatNumber(row.currentYear / 1000, 2)}
              </Text>
              <Text style={[s.tCellRight, { width: "26%", color: C.gray500 }]}>
                {formatNumber(row.previousYear / 1000, 2)}
              </Text>
              <Text style={[s.tCellRight, {
                width: "18%",
                fontWeight: "bold",
                color: positive ? C.green : C.red,
              }]}>
                {diff >= 0 ? "+" : ""}{formatNumber(diff / 1000, 2)}
              </Text>
              <Text style={[s.tCellRight, {
                width: "18%",
                color: positive ? C.green : C.red,
              }]}>
                {row.previousYear > 0 ? `${pct >= 0 ? "+" : ""}${formatNumber(pct, 1)} %` : "k.A."}
              </Text>
            </View>
          );
        })}

        <View style={s.tFoot}>
          <Text style={[s.tFootText, { width: "12%" }]}>Gesamt</Text>
          <Text style={[s.tFootRight, { width: "26%" }]}>
            {formatNumber(totalCurrent / 1000, 2)} MWh
          </Text>
          <Text style={[s.tFootRight, { width: "26%" }]}>
            {formatNumber(totalPrev / 1000, 2)} MWh
          </Text>
          <Text style={[s.tFootRight, { width: "18%" }]}>
            {totalDiff >= 0 ? "+" : ""}{formatNumber(totalDiff / 1000, 2)}
          </Text>
          <Text style={[s.tFootRight, { width: "18%" }]}>
            {totalPrev > 0 ? `${totalDiffPct >= 0 ? "+" : ""}${formatNumber(totalDiffPct, 1)} %` : "k.A."}
          </Text>
        </View>
      </View>

      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Availability Breakdown Page
// =============================================================================

function AvailabilityBreakdownPage({ data }: { data: CustomReportData }) {
  const breakdown = data.availabilityBreakdown;
  if (!breakdown || breakdown.length === 0) return null;

  return (
    <Page size="A4" style={s.page}>
      <PageHeader title="Verfügbarkeit T1-T6" parkName={data.parkName} year={data.year} />
      <SectionHead title="Verfügbarkeit nach IEC 61400-26" subtitle={String(data.year)} />

      <View style={s.table}>
        <View style={s.tHead}>
          <Text style={[s.tHeadText, { width: "14%" }]}>Anlage</Text>
          <Text style={[s.tHeadText, { width: "12%", textAlign: "right" }]}>T1 Prod.</Text>
          <Text style={[s.tHeadText, { width: "12%", textAlign: "right" }]}>T2 Wind</Text>
          <Text style={[s.tHeadText, { width: "12%", textAlign: "right" }]}>T3 Umwelt</Text>
          <Text style={[s.tHeadText, { width: "12%", textAlign: "right" }]}>T4 Wartg.</Text>
          <Text style={[s.tHeadText, { width: "12%", textAlign: "right" }]}>T5 Störg.</Text>
          <Text style={[s.tHeadText, { width: "12%", textAlign: "right" }]}>T6 Sonst.</Text>
          <Text style={[s.tHeadText, { width: "14%", textAlign: "right" }]}>Verfügb. %</Text>
        </View>

        {breakdown.map((row, i) => (
          <View key={row.turbineId} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
            <Text style={[s.tCell, { width: "14%" }]}>{row.designation}</Text>
            <Text style={[s.tCellRight, { width: "12%" }]}>{fmtHours(row.t1)}</Text>
            <Text style={[s.tCellRight, { width: "12%" }]}>{fmtHours(row.t2)}</Text>
            <Text style={[s.tCellRight, { width: "12%" }]}>{fmtHours(row.t3)}</Text>
            <Text style={[s.tCellRight, { width: "12%" }]}>{fmtHours(row.t4)}</Text>
            <Text style={[s.tCellRight, { width: "12%", color: C.red, fontWeight: "bold" }]}>
              {fmtHours(row.t5)}
            </Text>
            <Text style={[s.tCellRight, { width: "12%" }]}>{fmtHours(row.t6)}</Text>
            <Text style={[s.tCellRight, {
              width: "14%",
              fontWeight: "bold",
              color: cfColor(row.availabilityPct),
            }]}>
              {formatNumber(row.availabilityPct, 1)} %
            </Text>
          </View>
        ))}

        {breakdown.length > 0 && (() => {
          const avgAvail = breakdown.reduce((s, r) => s + r.availabilityPct, 0) / breakdown.length;
          return (
            <View style={s.tFoot}>
              <Text style={[s.tFootText, { width: "14%" }]}>Flotte Ø</Text>
              <Text style={[s.tFootRight, { width: "72%" }]}></Text>
              <Text style={[s.tFootRight, { width: "14%" }]}>{formatNumber(avgAvail, 1)} %</Text>
            </View>
          );
        })()}
      </View>

      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Availability Trend Page
// =============================================================================

function AvailabilityTrendPage({ data }: { data: CustomReportData }) {
  const trend = data.availabilityTrend;
  if (!trend || trend.length === 0) return null;

  return (
    <Page size="A4" style={s.page}>
      <PageHeader title="Verfügbarkeits-Trend" parkName={data.parkName} year={data.year} />
      <SectionHead title="Monatlicher Verfügbarkeits-Trend" subtitle={String(data.year)} />

      <View style={s.table}>
        <View style={s.tHead}>
          <Text style={[s.tHeadText, { width: "20%" }]}>Monat</Text>
          <Text style={[s.tHeadText, { width: "30%", textAlign: "right" }]}>Ø Verfügbarkeit</Text>
          <Text style={[s.tHeadText, { width: "25%", textAlign: "right" }]}>Anzahl Turbinen</Text>
          <Text style={[s.tHeadText, { width: "25%" }]}>Verlauf</Text>
        </View>

        {trend.map((point, i) => (
          <View key={`${point.year}-${point.month}`} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
            <Text style={[s.tCell, { width: "20%" }]}>{point.label} {point.year}</Text>
            <Text style={[s.tCellRight, {
              width: "30%",
              fontWeight: "bold",
              color: cfColor(point.avgAvailability),
            }]}>
              {formatNumber(point.avgAvailability, 1)} %
            </Text>
            <Text style={[s.tCellRight, { width: "25%" }]}>{point.turbineCount}</Text>
            <View style={{ width: "25%", justifyContent: "center" }}>
              <HBar fraction={point.avgAvailability / 100} color={C.navyLight} height={8} />
            </View>
          </View>
        ))}
      </View>

      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Availability Heatmap Page
// =============================================================================

function AvailabilityHeatmapPage({ data }: { data: CustomReportData }) {
  const heatmap = data.availabilityHeatmap;
  if (!heatmap || heatmap.length === 0) return null;

  return (
    <Page size="A4" style={s.page}>
      <PageHeader title="Verfügbarkeits-Heatmap" parkName={data.parkName} year={data.year} />
      <SectionHead title="Monatliche Verfügbarkeit pro Turbine" subtitle={String(data.year)} />

      <View style={s.table}>
        <View style={s.tHead}>
          <Text style={[s.tHeadText, { width: "14%" }]}>Anlage</Text>
          {MONTH_LABELS_SHORT.map((m) => (
            <Text key={m} style={[s.tHeadText, { width: "6%", textAlign: "center" }]}>{m}</Text>
          ))}
          <Text style={[s.tHeadText, { width: "8%", textAlign: "right" }]}>Ø</Text>
        </View>

        {heatmap.map((row, i) => {
          const monthMap = new Map(row.months.map((c) => [c.month, c]));
          const values = row.months.map((c) => c.value);
          const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;

          return (
            <View key={row.turbineId} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
              <Text style={[s.tCell, { width: "14%" }]}>{row.designation}</Text>
              {Array.from({ length: 12 }, (_, idx) => {
                const cell = monthMap.get(idx + 1);
                const normalized = cell ? cell.value / 100 : 0;
                const bg = cell ? availHeatmapCellBg(normalized) : C.gray100;
                const textCol = cell ? availHeatmapCellTextColor(normalized) : C.gray400;
                return (
                  <View key={idx} style={{ width: "6%", alignItems: "center" }}>
                    <Text style={{
                      fontSize: 6,
                      color: textCol,
                      backgroundColor: bg,
                      paddingVertical: 2,
                      paddingHorizontal: 1,
                      textAlign: "center",
                      width: "100%",
                      fontWeight: "bold",
                    }}>
                      {cell ? formatNumber(cell.value, 0) : "-"}
                    </Text>
                  </View>
                );
              })}
              <Text style={[s.tCellRight, { width: "8%", fontWeight: "bold", color: cfColor(avg) }]}>
                {formatNumber(avg, 0)} %
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={{ fontSize: 7, color: C.gray400, marginTop: 4 }}>
        Werte in %. Farbe: grün &gt; 90 %, gelb &gt; 70 %, rot &lt; 70 %.
      </Text>

      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Downtime Pareto Page
// =============================================================================

function DowntimeParetoPage({ data }: { data: CustomReportData }) {
  const pareto = data.downtimePareto;
  if (!pareto || pareto.length === 0) return null;

  const maxSeconds = pareto[0]?.totalSeconds ?? 1;

  const catColors: Record<string, string> = {
    t2: "#60a5fa",
    t3: "#f59e0b",
    t4: "#a855f7",
    t5: C.red,
    t6: C.gray400,
  };

  return (
    <Page size="A4" style={s.page}>
      <PageHeader title="Ausfallzeiten-Pareto" parkName={data.parkName} year={data.year} />
      <SectionHead title="Ausfallzeiten nach Kategorie (Pareto)" subtitle={String(data.year)} />

      <View style={s.table}>
        <View style={s.tHead}>
          <Text style={[s.tHeadText, { width: "6%" }]}>Rang</Text>
          <Text style={[s.tHeadText, { width: "24%" }]}>Kategorie</Text>
          <Text style={[s.tHeadText, { width: "20%", textAlign: "right" }]}>Dauer (h)</Text>
          <Text style={[s.tHeadText, { width: "12%", textAlign: "right" }]}>Anteil %</Text>
          <Text style={[s.tHeadText, { width: "12%", textAlign: "right" }]}>Kumuliert</Text>
          <Text style={[s.tHeadText, { width: "26%" }]}>Balken</Text>
        </View>

        {pareto.map((item, i) => {
          const fraction = maxSeconds > 0 ? item.totalSeconds / maxSeconds : 0;
          const color = catColors[item.category] ?? C.navyLight;
          return (
            <View key={item.category} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
              <Text style={[s.tCell, { width: "6%" }]}>{i + 1}</Text>
              <Text style={[s.tCell, { width: "24%" }]}>{item.label}</Text>
              <Text style={[s.tCellRight, { width: "20%" }]}>
                {formatNumber(item.totalSeconds / 3600, 1)}
              </Text>
              <Text style={[s.tCellRight, { width: "12%", fontWeight: "bold" }]}>
                {formatNumber(item.percentage, 1)} %
              </Text>
              <Text style={[s.tCellRight, { width: "12%", color: C.gray500 }]}>
                {formatNumber(item.cumulative, 1)} %
              </Text>
              <View style={{ width: "26%", justifyContent: "center", paddingLeft: 4 }}>
                <HBar fraction={fraction} color={color} height={8} />
              </View>
            </View>
          );
        })}
      </View>

      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Turbine Comparison Page
// =============================================================================

function TurbineComparisonPage({ data }: { data: CustomReportData }) {
  const comparison = data.turbineComparison;
  if (!comparison || comparison.comparison.length === 0) return null;

  return (
    <Page size="A4" style={s.page}>
      <PageHeader title="Turbinen-Vergleich" parkName={data.parkName} year={data.year} />
      <SectionHead title="Turbinen-Vergleich" subtitle={String(data.year)} />

      <View style={s.table}>
        <View style={s.tHead}>
          <Text style={[s.tHeadText, { width: "6%" }]}>Rang</Text>
          <Text style={[s.tHeadText, { width: "18%" }]}>Anlage</Text>
          <Text style={[s.tHeadText, { width: "20%", textAlign: "right" }]}>Produktion (MWh)</Text>
          <Text style={[s.tHeadText, { width: "18%", textAlign: "right" }]}>Kap.faktor %</Text>
          <Text style={[s.tHeadText, { width: "18%", textAlign: "right" }]}>Sp. Ertrag</Text>
          <Text style={[s.tHeadText, { width: "12%", textAlign: "right" }]}>Wind m/s</Text>
          <Text style={[s.tHeadText, { width: "8%", textAlign: "right" }]}>Delta%</Text>
        </View>

        {comparison.comparison.map((entry, i) => (
          <View key={entry.turbineId} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
            <Text style={[s.tCell, { width: "6%", fontWeight: "bold", color: C.navyLight }]}>
              {entry.rank}.
            </Text>
            <Text style={[s.tCellBold, { width: "18%" }]}>{entry.designation}</Text>
            <Text style={[s.tCellRight, { width: "20%" }]}>
              {formatNumber(entry.productionKwh / 1000, 2)}
            </Text>
            <Text style={[s.tCellRight, {
              width: "18%",
              fontWeight: "bold",
              color: cfColor(entry.capacityFactor),
            }]}>
              {formatNumber(entry.capacityFactor, 1)} %
            </Text>
            <Text style={[s.tCellRight, { width: "18%" }]}>
              {formatNumber(entry.specificYield, 0)} kWh/kW
            </Text>
            <Text style={[s.tCellRight, { width: "12%" }]}>
              {entry.avgWindSpeed != null ? formatNumber(entry.avgWindSpeed, 1) : "k.A."}
            </Text>
            <Text style={[s.tCellRight, {
              width: "8%",
              color: entry.deviationFromFleetPct >= 0 ? C.green : C.red,
              fontWeight: "bold",
            }]}>
              {entry.deviationFromFleetPct >= 0 ? "+" : ""}
              {formatNumber(entry.deviationFromFleetPct, 1)}
            </Text>
          </View>
        ))}
      </View>

      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Power Curve Overlay Page
// =============================================================================

function PowerCurveOverlayPage({ data }: { data: CustomReportData }) {
  const tc = data.turbineComparison;
  if (!tc || tc.powerCurves.length === 0) return null;

  // Build combined scatter + curve from all turbines
  // Use first turbine's curve as the "mean curve" and all points as scatter
  const allCurvePoints = tc.powerCurves.flatMap((pc) =>
    pc.curve.map((p) => ({ windSpeed: p.windSpeed, avgPowerKw: p.avgPowerKw, count: 1 }))
  );

  if (allCurvePoints.length === 0) return null;

  return (
    <Page size="A4" style={s.page}>
      <PageHeader title="Leistungskurven-Overlay" parkName={data.parkName} year={data.year} />
      <SectionHead title="Leistungskurven aller Turbinen" subtitle={String(data.year)} />

      {tc.powerCurves.map((pc) => (
        <View key={pc.turbineId} style={{ marginBottom: 8 }} wrap={false}>
          <Text style={{ fontSize: 8, fontWeight: "bold", color: C.navy, marginBottom: 4 }}>
            {pc.designation}
          </Text>
          <PdfPowerCurve
            scatter={[]}
            curve={pc.curve.map((p) => ({ windSpeed: p.windSpeed, avgPowerKw: p.avgPowerKw, count: 1 }))}
            width={500}
            height={160}
          />
        </View>
      ))}

      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Fault Pareto Page
// =============================================================================

function FaultParetoPage({ data }: { data: CustomReportData }) {
  const pareto = data.faultPareto;
  if (!pareto || pareto.length === 0) return null;

  const maxDuration = pareto[0]?.totalDurationSeconds ?? 1;

  return (
    <Page size="A4" style={s.page}>
      <PageHeader title="Störungen-Pareto" parkName={data.parkName} year={data.year} />
      <SectionHead title="Top-20 Störungsursachen" subtitle={String(data.year)} />

      <View style={s.table}>
        <View style={s.tHead}>
          <Text style={[s.tHeadText, { width: "16%" }]}>Code</Text>
          <Text style={[s.tHeadText, { width: "34%" }]}>Beschreibung</Text>
          <Text style={[s.tHeadText, { width: "16%", textAlign: "right" }]}>Dauer (h)</Text>
          <Text style={[s.tHeadText, { width: "10%", textAlign: "right" }]}>Anzahl</Text>
          <Text style={[s.tHeadText, { width: "10%", textAlign: "right" }]}>Anteil</Text>
          <Text style={[s.tHeadText, { width: "14%" }]}>Balken</Text>
        </View>

        {pareto.map((item, i) => {
          const fraction = maxDuration > 0 ? item.totalDurationSeconds / maxDuration : 0;
          const bg = item.isFault ? { backgroundColor: C.redLight } : {};
          return (
            <View key={`${item.state}-${item.subState}`} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}, bg]} wrap={false}>
              <Text style={[s.tCell, { width: "16%", color: item.isFault ? C.red : C.gray700 }]}>
                {item.state}.{item.subState}
              </Text>
              <Text style={[s.tCell, { width: "34%", fontSize: 7 }]}>
                {item.label}
              </Text>
              <Text style={[s.tCellRight, { width: "16%" }]}>
                {formatNumber(item.totalDurationSeconds / 3600, 1)}
              </Text>
              <Text style={[s.tCellRight, { width: "10%" }]}>
                {item.totalFrequency}
              </Text>
              <Text style={[s.tCellRight, { width: "10%", fontWeight: "bold" }]}>
                {formatNumber(item.percentage, 1)} %
              </Text>
              <View style={{ width: "14%", justifyContent: "center", paddingLeft: 4 }}>
                <HBar fraction={fraction} color={item.isFault ? C.red : C.navyLight} height={7} />
              </View>
            </View>
          );
        })}
      </View>

      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Warning Trend Page
// =============================================================================

function WarningTrendPage({ data }: { data: CustomReportData }) {
  const trend = data.warningTrend;
  if (!trend || trend.length === 0) return null;

  const maxFreq = Math.max(...trend.map((t) => t.totalFrequency), 1);

  return (
    <Page size="A4" style={s.page}>
      <PageHeader title="Warnungs-Trend" parkName={data.parkName} year={data.year} />
      <SectionHead title="Monatlicher Warnungs-Trend" subtitle={String(data.year)} />

      <View style={s.table}>
        <View style={s.tHead}>
          <Text style={[s.tHeadText, { width: "18%" }]}>Monat</Text>
          <Text style={[s.tHeadText, { width: "22%", textAlign: "right" }]}>Anzahl Warnungen</Text>
          <Text style={[s.tHeadText, { width: "22%", textAlign: "right" }]}>Gesamtdauer (h)</Text>
          <Text style={[s.tHeadText, { width: "38%" }]}>Verlauf</Text>
        </View>

        {trend.map((point, i) => {
          const fraction = maxFreq > 0 ? point.totalFrequency / maxFreq : 0;
          return (
            <View key={`${point.year}-${point.month}`} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
              <Text style={[s.tCell, { width: "18%" }]}>{point.label} {point.year}</Text>
              <Text style={[s.tCellRight, { width: "22%", fontWeight: "bold" }]}>
                {point.totalFrequency}
              </Text>
              <Text style={[s.tCellRight, { width: "22%" }]}>
                {formatNumber(point.totalDurationSeconds / 3600, 1)}
              </Text>
              <View style={{ width: "38%", justifyContent: "center", paddingLeft: 8 }}>
                <HBar fraction={fraction} color={C.amber} height={8} />
              </View>
            </View>
          );
        })}
      </View>

      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Wind Distribution Page
// =============================================================================

function WindDistributionPage({ data }: { data: CustomReportData }) {
  const dist = data.windDistribution;
  if (!dist || dist.length === 0) return null;

  // Convert WindDistributionBin to PdfWindDistribution format
  const chartData = dist.map((bin) => ({
    binStart: bin.windSpeedBin,
    binEnd: bin.windSpeedBin + 1,
    count: bin.count,
    percentage: bin.percentage,
  }));

  return (
    <Page size="A4" style={s.page}>
      <PageHeader title="Windverteilung" parkName={data.parkName} year={data.year} />
      <SectionHead title="Windgeschwindigkeits-Verteilung" subtitle={String(data.year)} />

      <PdfWindDistribution data={chartData} width={500} height={200} />

      <View style={s.divider} />

      <View style={s.table}>
        <View style={s.tHead}>
          <Text style={[s.tHeadText, { width: "30%" }]}>Windklasse (m/s)</Text>
          <Text style={[s.tHeadText, { width: "30%", textAlign: "right" }]}>Anzahl Messungen</Text>
          <Text style={[s.tHeadText, { width: "20%", textAlign: "right" }]}>Anteil %</Text>
          <Text style={[s.tHeadText, { width: "20%" }]}>Häufigkeit</Text>
        </View>
        {dist.slice(0, 20).map((bin, i) => (
          <View key={bin.windSpeedBin} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
            <Text style={[s.tCell, { width: "30%" }]}>
              {bin.windSpeedBin} – {bin.windSpeedBin + 1} m/s
            </Text>
            <Text style={[s.tCellRight, { width: "30%" }]}>
              {bin.count.toLocaleString("de-DE")}
            </Text>
            <Text style={[s.tCellRight, { width: "20%", fontWeight: "bold" }]}>
              {formatNumber(bin.percentage, 1)} %
            </Text>
            <View style={{ width: "20%", justifyContent: "center" }}>
              <HBar fraction={bin.percentage / 25} color={C.blue} height={7} />
            </View>
          </View>
        ))}
      </View>

      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Environmental Data Page
// =============================================================================

function EnvironmentalDataPage({ data }: { data: CustomReportData }) {
  const env = data.environmentalData;
  if (!env || env.length === 0) return null;

  const totalCount = env.reduce((s, d) => s + d.count, 0);
  const dominant = env.reduce((best, d) => (d.count > best.count ? d : best), env[0]);
  const avgWind = totalCount > 0
    ? env.reduce((s, d) => s + d.avgWindSpeed * d.count, 0) / totalCount
    : 0;

  return (
    <Page size="A4" style={s.page}>
      <PageHeader title="Umweltdaten" parkName={data.parkName} year={data.year} />
      <SectionHead title="Richtungs-Effizienz (Umweltdaten)" subtitle={String(data.year)} />

      <View style={s.summaryBox} wrap={false}>
        <View style={s.summaryItem}>
          <Text style={s.summaryLabel}>Dominante Windrichtung</Text>
          <Text style={s.summaryValue}>{dominant.direction}</Text>
        </View>
        <View style={s.summaryItem}>
          <Text style={s.summaryLabel}>Ø Windgeschwindigkeit</Text>
          <Text style={s.summaryValue}>{formatNumber(avgWind, 1)} m/s</Text>
        </View>
        <View style={s.summaryItem}>
          <Text style={s.summaryLabel}>Messpunkte</Text>
          <Text style={s.summaryValue}>{totalCount.toLocaleString("de-DE")}</Text>
        </View>
      </View>

      <View style={s.table}>
        <View style={s.tHead}>
          <Text style={[s.tHeadText, { width: "20%" }]}>Richtung</Text>
          <Text style={[s.tHeadText, { width: "25%", textAlign: "right" }]}>Ø Wind (m/s)</Text>
          <Text style={[s.tHeadText, { width: "25%", textAlign: "right" }]}>Ø Leistung (kW)</Text>
          <Text style={[s.tHeadText, { width: "15%", textAlign: "right" }]}>Häufigkeit</Text>
          <Text style={[s.tHeadText, { width: "15%", textAlign: "right" }]}>Anteil %</Text>
        </View>

        {env.map((entry, i) => {
          const pct = totalCount > 0 ? (entry.count / totalCount) * 100 : 0;
          return (
            <View key={entry.direction} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
              <Text style={[s.tCellBold, { width: "20%" }]}>{entry.direction}</Text>
              <Text style={[s.tCellRight, { width: "25%" }]}>
                {formatNumber(entry.avgWindSpeed, 1)}
              </Text>
              <Text style={[s.tCellRight, { width: "25%" }]}>
                {formatNumber(entry.avgPowerKw, 0)}
              </Text>
              <Text style={[s.tCellRight, { width: "15%" }]}>
                {entry.count.toLocaleString("de-DE")}
              </Text>
              <Text style={[s.tCellRight, { width: "15%" }]}>
                {formatNumber(pct, 1)} %
              </Text>
            </View>
          );
        })}
      </View>

      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Financial Overview Page
// =============================================================================

function FinancialOverviewPage({ data }: { data: CustomReportData }) {
  const fin = data.financialOverview;
  if (!fin) return null;

  return (
    <Page size="A4" style={s.page}>
      <PageHeader title="Finanz-Übersicht" parkName={data.parkName} year={data.year} />
      <SectionHead title="Finanzielle Übersicht" subtitle={String(data.year)} />

      <View style={s.kpiGrid} wrap={false}>
        <View style={s.kpiCard}>
          <Text style={s.kpiLabel}>Gesamterlös</Text>
          <Text style={s.kpiValue}>{formatCurrency(fin.totalRevenueEur)}</Text>
          <Text style={s.kpiUnit}>EUR</Text>
        </View>
        <View style={s.kpiCard}>
          <Text style={s.kpiLabel}>Gesamtproduktion</Text>
          <Text style={s.kpiValue}>{formatNumber(fin.totalProductionKwh / 1000, 1)}</Text>
          <Text style={s.kpiUnit}>MWh</Text>
        </View>
        <View style={s.kpiCard}>
          <Text style={s.kpiLabel}>Ø Erlös / kWh</Text>
          <Text style={s.kpiValue}>
            {fin.avgRevenuePerKwh != null ? formatNumber(fin.avgRevenuePerKwh * 100, 2) : "k.A."}
          </Text>
          <Text style={s.kpiUnit}>ct/kWh</Text>
        </View>
      </View>

      <Text style={{ fontSize: 8, color: C.gray500, marginTop: 8 }}>
        Daten aus abgerechneten Einspeiseverträgen (Status: CALCULATED, INVOICED, CLOSED).
      </Text>

      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Revenue Comparison Page
// =============================================================================

function RevenueComparisonPage({ data }: { data: CustomReportData }) {
  const revenue = data.revenueComparison;
  if (!revenue || revenue.length === 0) return null;

  const totalRevenue = revenue.reduce((s, r) => s + r.revenueEur, 0);
  const totalProduction = revenue.reduce((s, r) => s + r.productionKwh, 0);

  return (
    <Page size="A4" style={s.page}>
      <PageHeader title="Erlösvergleich" parkName={data.parkName} year={data.year} />
      <SectionHead title="Monatlicher Erlösvergleich" subtitle={String(data.year)} />

      <View style={s.table}>
        <View style={s.tHead}>
          <Text style={[s.tHeadText, { width: "18%" }]}>Monat</Text>
          <Text style={[s.tHeadText, { width: "28%", textAlign: "right" }]}>Erlös (€)</Text>
          <Text style={[s.tHeadText, { width: "24%", textAlign: "right" }]}>Produktion (MWh)</Text>
          <Text style={[s.tHeadText, { width: "30%", textAlign: "right" }]}>Erlös / kWh (ct)</Text>
        </View>

        {revenue.map((point, i) => (
          <View key={`${point.year}-${point.month}`} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
            <Text style={[s.tCell, { width: "18%" }]}>{point.label}</Text>
            <Text style={[s.tCellRight, { width: "28%", fontWeight: "bold" }]}>
              {formatCurrency(point.revenueEur)}
            </Text>
            <Text style={[s.tCellRight, { width: "24%" }]}>
              {formatNumber(point.productionKwh / 1000, 2)}
            </Text>
            <Text style={[s.tCellRight, { width: "30%" }]}>
              {point.revenuePerKwh != null ? formatNumber(point.revenuePerKwh * 100, 2) : "k.A."}
            </Text>
          </View>
        ))}

        <View style={s.tFoot}>
          <Text style={[s.tFootText, { width: "18%" }]}>Gesamt</Text>
          <Text style={[s.tFootRight, { width: "28%" }]}>{formatCurrency(totalRevenue)}</Text>
          <Text style={[s.tFootRight, { width: "24%" }]}>
            {formatNumber(totalProduction / 1000, 2)} MWh
          </Text>
          <Text style={[s.tFootRight, { width: "30%" }]}>
            {totalProduction > 0 ? formatNumber((totalRevenue / totalProduction) * 100, 2) : "k.A."} ct/kWh
          </Text>
        </View>
      </View>

      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Daily Profile Page (classic module)
// =============================================================================

function DailyProfilePage({ data }: { data: CustomReportData }) {
  const tc = data.turbineComparison;
  if (!tc) return null;

  // Note: turbineComparison doesn't have dailyProfile in the analytics type
  // This page renders a placeholder if turbineComparison data exists
  return (
    <Page size="A4" style={s.page}>
      <PageHeader title="Tagesprofil" parkName={data.parkName} year={data.year} />
      <SectionHead title="Tagesprofil (aus Turbinen-Vergleich)" subtitle={String(data.year)} />
      <Text style={s.noData}>
        Tagesprofil-Daten werden über das klassische Monatsbericht-Modul bereitgestellt.
        Bitte den Monatsbericht für detaillierte Tagesprofile verwenden.
      </Text>
      <PageNumber />
    </Page>
  );
}

// =============================================================================
// Main Template Component
// =============================================================================

interface CustomReportTemplateProps {
  data: CustomReportData;
}

export function CustomReportTemplate({ data }: CustomReportTemplateProps) {
  const modules = data.selectedModules;

  const has = (key: string) => modules.includes(key);

  return (
    <Document
      title={`Benutzerdefinierter Bericht - ${data.parkName} ${data.year}`}
      author="WindparkManager"
      creator="WPM Custom Report Generator"
    >
      {/* Cover Page — always included */}
      <CoverPage data={data} />

      {/* Analytics modules */}
      {has("performanceKpis") && data.performanceKpis && (
        <PerformanceKpisPage data={data} />
      )}

      {has("productionHeatmap") && data.productionHeatmap && (
        <ProductionHeatmapPage data={data} />
      )}

      {has("turbineRanking") && data.performanceKpis && (
        <TurbineRankingPage data={data} />
      )}

      {has("yearOverYear") && data.yearOverYear && (
        <YearOverYearPage data={data} />
      )}

      {has("availabilityBreakdown") && data.availabilityBreakdown && (
        <AvailabilityBreakdownPage data={data} />
      )}

      {has("availabilityTrend") && data.availabilityTrend && (
        <AvailabilityTrendPage data={data} />
      )}

      {has("availabilityHeatmap") && data.availabilityHeatmap && (
        <AvailabilityHeatmapPage data={data} />
      )}

      {has("downtimePareto") && data.downtimePareto && (
        <DowntimeParetoPage data={data} />
      )}

      {has("turbineComparison") && data.turbineComparison && (
        <TurbineComparisonPage data={data} />
      )}

      {has("powerCurveOverlay") && data.turbineComparison && (
        <PowerCurveOverlayPage data={data} />
      )}

      {has("faultPareto") && data.faultPareto && (
        <FaultParetoPage data={data} />
      )}

      {has("warningTrend") && data.warningTrend && (
        <WarningTrendPage data={data} />
      )}

      {has("windDistribution") && data.windDistribution && (
        <WindDistributionPage data={data} />
      )}

      {has("environmentalData") && data.environmentalData && (
        <EnvironmentalDataPage data={data} />
      )}

      {has("financialOverview") && data.financialOverview && (
        <FinancialOverviewPage data={data} />
      )}

      {has("revenueComparison") && data.revenueComparison && (
        <RevenueComparisonPage data={data} />
      )}

      {/* Classic modules */}
      {(has("kpiSummary") || has("production")) && data.performanceKpis && (
        <PerformanceKpisPage data={data} />
      )}

      {has("dailyProfile") && data.turbineComparison && (
        <DailyProfilePage data={data} />
      )}
    </Document>
  );
}
