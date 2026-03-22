/**
 * Operational Report PDF Template — Premium Design
 *
 * Supports MONTHLY, QUARTERLY, and ANNUAL period types.
 *
 * Common pages (all period types):
 * - Page 1: Executive summary with KPIs, trend indicators, and YoY comparison
 * - Page 2: Production per turbine table with visual bar chart
 * - Page 3: Availability per turbine with stacked-bar breakdown (IEC 61400-26)
 * - Page 4: Service events with type badges
 *
 * Extra pages for QUARTERLY / ANNUAL:
 * - Monthly production trend table (per turbine × month)
 * - Monthly availability trend table
 */

import { Document, Page, View, Text, Image, StyleSheet, Svg, Circle as SvgCircle, Line as SvgLine, Rect as SvgRect, Path as SvgPath } from "@react-pdf/renderer";
import type { ResolvedLetterhead, ResolvedTemplate } from "../utils/templateResolver";
import { Header } from "./components/Header";
import { Footer, PageNumber } from "./components/Footer";
import { formatNumber, formatDate } from "../utils/formatters";
import { formatCurrency } from "@/lib/format";
import { PdfWindRose, PdfWindRoseLegend } from "../charts/PdfWindRose";
import { PdfWindDistribution } from "../charts/PdfWindDistribution";
import { PdfPowerCurve } from "../charts/PdfPowerCurve";
import { PdfDailyProfile } from "../charts/PdfDailyProfile";

// ===========================================
// DESIGN TOKENS
// ===========================================

const C = {
  // Brand (warm navy)
  navy: "#1E3A5F",
  navyLight: "#335E99",
  navyPale: "#E8EEF5",
  navyDark: "#142940",

  // Semantic
  green: "#16A34A",
  greenLight: "#DCFCE7",
  amber: "#D97706",
  amberLight: "#FEF3C7",
  red: "#DC2626",
  redLight: "#FEE2E2",
  blue: "#2563EB",
  blueLight: "#DBEAFE",

  // Neutrals
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

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.gray800,
  },
  content: { flex: 1 },

  // ---- Title Banner ----
  titleBanner: {
    backgroundColor: C.navy,
    marginHorizontal: -25,
    marginTop: -5,
    paddingHorizontal: 25,
    paddingVertical: 20,
    marginBottom: 18,
  },
  titleText: {
    fontSize: 22,
    fontWeight: "bold",
    color: C.white,
    letterSpacing: 0.5,
  },
  titleSubText: {
    fontSize: 12,
    color: C.navyPale,
    marginTop: 4,
  },
  titleMeta: {
    flexDirection: "row",
    marginTop: 10,
    gap: 20,
  },
  titleMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  titleMetaLabel: {
    fontSize: 7,
    color: C.navyPale,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  titleMetaValue: {
    fontSize: 8,
    color: C.white,
    fontWeight: "bold",
  },

  // ---- Section headers ----
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
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

  // ---- KPI Cards ----
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 18,
  },
  kpiCard: {
    width: "31%",
    backgroundColor: C.white,
    borderTopWidth: 6,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 2,
    borderColor: C.gray200,
    borderRadius: 4,
    padding: 12,
  },
  kpiLabel: {
    fontSize: 7,
    color: C.gray500,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  kpiValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: "bold",
    color: C.navy,
  },
  kpiUnit: {
    fontSize: 8,
    color: C.gray400,
    marginBottom: 2,
  },
  kpiTrend: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 3,
  },
  kpiTrendDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  kpiTrendText: {
    fontSize: 7,
  },

  // ---- Comparison Table ----
  compBox: {
    backgroundColor: C.gray50,
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 4,
    padding: 12,
    marginBottom: 18,
  },
  compTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: C.navy,
    marginBottom: 8,
  },
  compHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.gray300,
    paddingBottom: 4,
    marginBottom: 6,
  },
  compHeaderText: {
    fontSize: 7,
    fontWeight: "bold",
    color: C.gray500,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
  },
  compRow: {
    flexDirection: "row",
    paddingVertical: 3,
  },
  compLabel: {
    fontSize: 9,
    color: C.gray600,
    width: "35%",
  },
  compCurrent: {
    fontSize: 9,
    fontWeight: "bold",
    width: "22%",
    textAlign: "right",
  },
  compPrev: {
    fontSize: 9,
    color: C.gray500,
    width: "22%",
    textAlign: "right",
  },
  compDiff: {
    fontSize: 9,
    fontWeight: "bold",
    width: "21%",
    textAlign: "right",
  },

  // ---- Info Panel ----
  infoPanel: {
    backgroundColor: C.gray50,
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
  },
  infoPanelTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: C.navy,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: C.gray300,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  infoItem: {
    width: "50%",
    flexDirection: "row",
    paddingVertical: 2,
  },
  infoLabel: {
    fontSize: 8,
    color: C.gray500,
    width: 100,
  },
  infoValue: {
    fontSize: 8,
    fontWeight: "bold",
    color: C.gray700,
    flex: 1,
  },

  // ---- Tables ----
  table: {
    marginBottom: 14,
  },
  tHead: {
    flexDirection: "row",
    backgroundColor: C.navy,
    paddingVertical: 7,
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
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: C.gray200,
  },
  tRowAlt: {
    backgroundColor: C.gray50,
  },
  tCell: {
    fontSize: 8,
    color: C.gray700,
  },
  tCellRight: {
    fontSize: 8,
    color: C.gray700,
    textAlign: "right",
  },
  tCellBold: {
    fontSize: 8,
    fontWeight: "bold",
  },
  tFoot: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 8,
    backgroundColor: C.navyDark,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  tFootText: {
    fontSize: 8,
    fontWeight: "bold",
    color: C.white,
  },
  tFootRight: {
    fontSize: 8,
    fontWeight: "bold",
    color: C.white,
    textAlign: "right",
  },

  // ---- Production columns ----
  colTurbine: { width: "22%" },
  colProd: { width: "20%", textAlign: "right" },
  colHours: { width: "18%", textAlign: "right" },
  colAvail: { width: "20%", textAlign: "right" },
  colCf: { width: "20%", textAlign: "right" },

  // ---- Availability columns ----
  colAvTurb: { width: "14%" },
  colAvT1: { width: "11%", textAlign: "right" },
  colAvT2: { width: "11%", textAlign: "right" },
  colAvT3: { width: "11%", textAlign: "right" },
  colAvT4: { width: "11%", textAlign: "right" },
  colAvT5: { width: "11%", textAlign: "right" },
  colAvT6: { width: "11%", textAlign: "right" },
  colAvPct: { width: "20%", textAlign: "right" },

  // ---- Event columns ----
  colEvDate: { width: "14%" },
  colEvType: { width: "16%" },
  colEvTurb: { width: "14%" },
  colEvDesc: { width: "40%" },
  colEvDur: { width: "16%", textAlign: "right" },

  // ---- Bar Chart ----
  chartWrap: {
    marginTop: 14,
    marginBottom: 8,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
  },
  chartLabel: {
    width: 65,
    fontSize: 7,
    color: C.gray600,
  },
  chartTrack: {
    flex: 1,
    height: 16,
    backgroundColor: C.gray100,
    borderRadius: 3,
    overflow: "hidden",
  },
  chartBar: {
    height: 16,
    borderRadius: 3,
  },
  chartValLabel: {
    width: 60,
    fontSize: 7,
    textAlign: "right",
    color: C.gray500,
    paddingLeft: 6,
  },

  // ---- Stacked Availability Bar ----
  stackedBarWrap: {
    marginBottom: 14,
  },
  stackedRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  stackedLabel: {
    width: 65,
    fontSize: 7,
    color: C.gray600,
  },
  stackedTrack: {
    flex: 1,
    height: 14,
    flexDirection: "row",
    borderRadius: 2,
    overflow: "hidden",
  },
  stackedPct: {
    width: 42,
    fontSize: 7,
    textAlign: "right",
    fontWeight: "bold",
    paddingLeft: 4,
  },
  stackedLegend: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 1,
  },
  legendText: {
    fontSize: 6,
    color: C.gray500,
  },

  // ---- Event Type Badge ----
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 2,
    fontSize: 7,
    fontWeight: "bold",
  },

  // ---- Notable downtimes ----
  alertBox: {
    backgroundColor: C.amberLight,
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 4,
    padding: 10,
    marginBottom: 14,
  },
  alertTitle: {
    fontSize: 9,
    fontWeight: "bold",
    color: C.amber,
    marginBottom: 6,
  },
  alertItem: {
    fontSize: 8,
    color: C.gray700,
    marginBottom: 2,
  },

  // ---- No data ----
  noData: {
    padding: 30,
    textAlign: "center",
    color: C.gray400,
    fontSize: 10,
    fontStyle: "italic",
    backgroundColor: C.gray50,
    borderRadius: 4,
  },

  // ---- Footer meta ----
  generatedAt: {
    fontSize: 7,
    color: C.gray400,
    textAlign: "right",
    marginTop: "auto",
    paddingTop: 8,
  },

  // ---- Divider ----
  divider: {
    height: 1,
    backgroundColor: C.gray200,
    marginVertical: 12,
  },

  // ---- Cover Page ----
  coverPage: {
    position: "relative",
    fontFamily: "Helvetica",
  },
  coverImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  coverOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "45%",
    // Gradient simulation: solid overlay at bottom
  },
  coverContent: {
    position: "absolute",
    bottom: 80,
    left: 50,
    right: 50,
  },
  coverTitle: {
    fontSize: 36,
    fontWeight: "bold",
    color: C.white,
    letterSpacing: 1,
    marginBottom: 8,
  },
  coverParkName: {
    fontSize: 20,
    color: C.white,
    opacity: 0.9,
    marginBottom: 24,
  },
  coverDivider: {
    width: 80,
    height: 4,
    backgroundColor: "#C09B4A",
    marginBottom: 20,
  },
  coverMetaRow: {
    flexDirection: "row",
    gap: 30,
    marginBottom: 6,
  },
  coverMetaLabel: {
    fontSize: 8,
    color: C.white,
    opacity: 0.6,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  coverMetaValue: {
    fontSize: 11,
    color: C.white,
    fontWeight: "bold",
    marginTop: 2,
  },
});

// ===========================================
// TYPES
// ===========================================

export interface TurbineProductionRow {
  turbineId: string;
  designation: string;
  productionMwh: number;
  operatingHours: number | null;
  availabilityPct: number | null;
  capacityFactor: number | null;
  ratedPowerKw: number | null;
}

export interface TurbineAvailabilityRow {
  turbineId: string;
  designation: string;
  t1Hours: number;
  t2Hours: number;
  t3Hours: number;
  t4Hours: number;
  t5Hours: number;
  t6Hours: number;
  availabilityPct: number | null;
}

export interface ServiceEventRow {
  id: string;
  eventDate: Date | string;
  eventType: string;
  turbineDesignation: string;
  description: string | null;
  durationHours: number | null;
}

export type ReportPeriodType = "MONTHLY" | "QUARTERLY" | "ANNUAL";

export interface MonthlyTrendEntry {
  month: number;
  monthNameShort: string; // "Jan", "Feb", etc.
  productionMwh: number;
  avgAvailabilityPct: number | null;
  avgWindSpeedMs: number | null;
  revenueEur: number | null;
}

export interface TurbineMonthlyProduction {
  turbineId: string;
  designation: string;
  monthlyMwh: (number | null)[]; // indexed by position (0 = first month in range)
  totalMwh: number;
}

export interface MonthlyReportData {
  parkName: string;
  parkAddress: string | null;
  fundName: string | null;
  operatorName: string | null;
  year: number;
  month: number;
  monthName: string;
  totalProductionMwh: number;
  avgAvailabilityPct: number | null;
  avgWindSpeedMs: number | null;
  specificYieldKwhPerKw: number | null;
  totalRevenueEur: number | null;
  prevYearProductionMwh: number | null;
  prevYearAvailabilityPct: number | null;
  prevYearWindSpeedMs: number | null;
  prevYearRevenueEur: number | null;
  turbineProduction: TurbineProductionRow[];
  turbineAvailability: TurbineAvailabilityRow[];
  serviceEvents: ServiceEventRow[];
  notableDowntimes: string[];
  generatedAt: string;

  // Period support (optional — defaults to MONTHLY if missing)
  periodType?: ReportPeriodType;
  periodLabel?: string; // e.g. "Q4 2025", "Oktober - Dezember 2025"

  // Monthly trend data (only for QUARTERLY/ANNUAL)
  monthlyTrend?: MonthlyTrendEntry[];
  turbineMonthlyProduction?: TurbineMonthlyProduction[];

  // Turbine type info (optional, from Park)
  turbineTypeInfo?: string; // e.g. "3 Windenergieanlagen E82 2,0 MW"

  // Cover page image (optional — signed URL to park cover photo)
  coverImageUrl?: string | null;

  // Section visibility (optional — all sections shown by default)
  sections?: {
    summary?: boolean;
    production?: boolean;
    availability?: boolean;
    service?: boolean;
    monthlyTrend?: boolean;
    windAnalysis?: boolean;
    powerCurve?: boolean;
    dailyProfile?: boolean;
  };

  // Chart data (optional — pages only render when data present)
  windRose?: {
    data: Array<{
      direction: string;
      directionDeg: number;
      total: number;
      speedRanges: Array<{ range: string; count: number }>;
    }>;
    meta: { totalMeasurements: number; avgWindSpeed: number | null; dominantDirection: string | null };
  };
  windDistribution?: Array<{
    binStart: number;
    binEnd: number;
    count: number;
    percentage: number;
  }>;
  powerCurve?: {
    scatter: Array<{ windSpeed: number; powerKw: number }>;
    curve: Array<{ windSpeed: number; avgPowerKw: number; count: number }>;
    ratedPowerKw?: number | null;
  };
  dailyProfile?: Array<{
    timeSlot: string;
    avgPowerKw: number;
    avgWindSpeed: number | null;
  }>;
}

interface MonthlyReportTemplateProps {
  data: MonthlyReportData;
  template: ResolvedTemplate;
  letterhead: ResolvedLetterhead;
}

// ===========================================
// HELPERS
// ===========================================

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "k.A.";
  return `${formatNumber(v, 1)} %`;
}

function fmtMwh(v: number | null | undefined): string {
  if (v == null) return "k.A.";
  return `${formatNumber(v, 2)} MWh`;
}

function fmtHours(v: number | null | undefined): string {
  if (v == null) return "k.A.";
  return `${formatNumber(v, 0)} h`;
}

function fmtWind(v: number | null | undefined): string {
  if (v == null) return "k.A.";
  return `${formatNumber(v, 1)} m/s`;
}

function diffPct(cur: number | null, prev: number | null): { text: string; positive: boolean | null } {
  if (cur == null || prev == null || prev === 0) return { text: "-", positive: null };
  const diff = ((cur - prev) / prev) * 100;
  const sign = diff >= 0 ? "+" : "";
  return { text: `${sign}${formatNumber(diff, 1)} %`, positive: diff >= 0 };
}

const EVENT_LABELS: Record<string, string> = {
  MAINTENANCE: "Wartung",
  REPAIR: "Reparatur",
  INSPECTION: "Inspektion",
  COMMISSIONING: "IBN",
  DECOMMISSIONING: "Stilllegung",
  INCIDENT: "Vorfall",
  GRID_OUTAGE: "Netzausfall",
  CURTAILMENT: "Abregelung",
  OTHER: "Sonstiges",
};

const EVENT_COLORS: Record<string, { bg: string; fg: string }> = {
  MAINTENANCE: { bg: C.blueLight, fg: C.blue },
  REPAIR: { bg: C.redLight, fg: C.red },
  INSPECTION: { bg: C.navyPale, fg: C.navy },
  INCIDENT: { bg: C.amberLight, fg: C.amber },
  GRID_OUTAGE: { bg: C.redLight, fg: C.red },
  CURTAILMENT: { bg: C.amberLight, fg: C.amber },
};

// IEC 61400-26 availability category colors
const T_COLORS = {
  t1: "#16A34A", // Production - green
  t2: "#60A5FA", // Waiting for wind - sky blue
  t3: "#A78BFA", // Environmental stop - violet
  t4: "#F59E0B", // Routine maintenance - amber
  t5: "#EF4444", // Equipment failure - red
  t6: "#9CA3AF", // Other downtime - gray
};

// ===========================================
// SUB-COMPONENTS
// ===========================================

function PageWrap({
  children,
  letterhead,
  layout,
  template,
  companyName,
}: {
  children: React.ReactNode;
  letterhead: ResolvedLetterhead;
  layout: ResolvedTemplate["layout"];
  template: ResolvedTemplate;
  companyName?: string;
}) {
  const hasBg = !!letterhead.backgroundPdfKey;
  return (
    <Page
      size="A4"
      style={[
        s.page,
        hasBg ? {} : { backgroundColor: C.white },
        {
          paddingTop: letterhead.marginTop,
          paddingBottom: hasBg
            ? letterhead.marginBottom
            : letterhead.marginBottom + letterhead.footerHeight,
          paddingLeft: letterhead.marginLeft,
          paddingRight: letterhead.marginRight,
        },
      ]}
    >
      {!hasBg && <Header letterhead={letterhead} layout={layout} companyName={companyName} />}
      <View style={s.content}>{children}</View>
      {!hasBg && <Footer letterhead={letterhead} layout={layout} customText={template.footerText} />}
      <PageNumber />
    </Page>
  );
}

function SectionHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: 12, marginTop: 4 }}>
      <View style={s.sectionHeader}>
        <View style={s.sectionAccent} />
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle && <Text style={s.sectionSubtitle}>{subtitle}</Text>}
        <View style={{ flex: 1, height: 0.5, backgroundColor: C.gray200, marginLeft: 8, alignSelf: "center" }} />
      </View>
    </View>
  );
}

function KpiCard({
  label,
  value,
  unit,
  color,
  trend,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
  trend?: { text: string; positive: boolean | null };
}) {
  return (
    <View style={[s.kpiCard, { borderTopColor: color, borderLeftColor: color }]}>
      <Text style={s.kpiLabel}>{label}</Text>
      <View style={s.kpiValueRow}>
        <Text style={s.kpiValue}>{value}</Text>
        <Text style={s.kpiUnit}>{unit}</Text>
      </View>
      {trend && trend.positive !== null && (
        <View style={s.kpiTrend}>
          <View
            style={[
              s.kpiTrendDot,
              { backgroundColor: trend.positive ? C.green : C.red },
            ]}
          />
          <Text
            style={[
              s.kpiTrendText,
              { color: trend.positive ? C.green : C.red },
            ]}
          >
            {trend.text} gg. Vorjahr
          </Text>
        </View>
      )}
    </View>
  );
}

function ProductionChart({ turbines }: { turbines: TurbineProductionRow[] }) {
  if (turbines.length === 0) return null;
  const maxProd = Math.max(...turbines.map((t) => t.productionMwh), 1);

  return (
    <View style={s.chartWrap}>
      <SectionHead title="Produktion nach Anlage" />
      {turbines.map((t, i) => {
        const pct = Math.max((t.productionMwh / maxProd) * 100, 2);
        // Alternate between navy and lighter blue
        const barColor = i % 2 === 0 ? C.navyLight : C.navy;
        return (
          <View key={t.turbineId} style={s.chartRow}>
            <Text style={s.chartLabel}>{t.designation}</Text>
            <View style={s.chartTrack}>
              <View style={[s.chartBar, { width: `${pct}%`, backgroundColor: barColor }]} />
            </View>
            <Text style={s.chartValLabel}>{formatNumber(t.productionMwh, 1)} MWh</Text>
          </View>
        );
      })}
    </View>
  );
}

function AvailabilityStackedBars({ rows }: { rows: TurbineAvailabilityRow[] }) {
  if (rows.length === 0) return null;

  return (
    <View style={s.stackedBarWrap}>
      <SectionHead title="Verfügbarkeitsverteilung (IEC 61400-26)" />

      {/* Legend */}
      <View style={s.stackedLegend}>
        {[
          { color: T_COLORS.t1, label: "T1 Produktion" },
          { color: T_COLORS.t2, label: "T2 Wind" },
          { color: T_COLORS.t3, label: "T3 Umwelt" },
          { color: T_COLORS.t4, label: "T4 Wartung" },
          { color: T_COLORS.t5, label: "T5 Störung" },
          { color: T_COLORS.t6, label: "T6 Sonstige" },
        ].map((item) => (
          <View key={item.label} style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: item.color }]} />
            <Text style={s.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>

      {rows.map((r) => {
        const total = r.t1Hours + r.t2Hours + r.t3Hours + r.t4Hours + r.t5Hours + r.t6Hours;
        if (total === 0) return null;
        const pcts = [
          { color: T_COLORS.t1, val: r.t1Hours },
          { color: T_COLORS.t2, val: r.t2Hours },
          { color: T_COLORS.t3, val: r.t3Hours },
          { color: T_COLORS.t4, val: r.t4Hours },
          { color: T_COLORS.t5, val: r.t5Hours },
          { color: T_COLORS.t6, val: r.t6Hours },
        ];
        const availColor =
          r.availabilityPct != null && r.availabilityPct < 90
            ? C.red
            : r.availabilityPct != null && r.availabilityPct >= 97
            ? C.green
            : C.gray700;

        return (
          <View key={r.turbineId} style={s.stackedRow}>
            <Text style={s.stackedLabel}>{r.designation}</Text>
            <View style={s.stackedTrack}>
              {pcts.map((p, i) => {
                const w = (p.val / total) * 100;
                if (w < 0.5) return null;
                return (
                  <View
                    key={i}
                    style={{ width: `${w}%`, height: 14, backgroundColor: p.color }}
                  />
                );
              })}
            </View>
            <Text style={[s.stackedPct, { color: availColor }]}>
              {fmtPct(r.availabilityPct)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function EventBadge({ type }: { type: string }) {
  const colors = EVENT_COLORS[type] || { bg: C.gray100, fg: C.gray600 };
  return (
    <View style={[s.badge, { backgroundColor: colors.bg }]}>
      <Text style={{ fontSize: 7, fontWeight: "bold", color: colors.fg }}>
        {EVENT_LABELS[type] || type}
      </Text>
    </View>
  );
}

// ===========================================
// COVER PAGE
// ===========================================

function CoverPage({
  data,
  reportTitle,
  periodSubtitle,
}: {
  data: MonthlyReportData;
  reportTitle: string;
  periodSubtitle: string;
}) {
  return (
    <Page size="A4" style={s.coverPage}>
      {/* Background image */}
      {data.coverImageUrl && (
        <Image src={data.coverImageUrl} style={s.coverImage} />
      )}

      {/* Dark overlay gradient (bottom half) */}
      <View
        style={[
          s.coverOverlay,
          {
            backgroundColor: C.navyDark,
            opacity: data.coverImageUrl ? 0.75 : 1,
          },
        ]}
      />

      {/* If no cover image, fill entire page with navy */}
      {!data.coverImageUrl && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: C.navy,
          }}
        />
      )}

      {/* SVG geometric decoration — only shown without photo */}
      {!data.coverImageUrl && (
        <Svg
          width={595}
          height={841}
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          {/* Large amber circle — top right, partially off-page */}
          <SvgCircle cx={530} cy={-30} r={210} fill="#C09B4A" fillOpacity={0.13} />
          {/* Medium ghost circle */}
          <SvgCircle cx={490} cy={210} r={110} fill="#FFFFFF" fillOpacity={0.04} />
          {/* Small accent circle bottom left */}
          <SvgCircle cx={-20} cy={780} r={120} fill="#FFFFFF" fillOpacity={0.04} />
          {/* Diagonal accent lines */}
          <SvgLine x1={0} y1={620} x2={180} y2={841} stroke="#FFFFFF" strokeWidth={0.5} strokeOpacity={0.18} />
          <SvgLine x1={80} y1={620} x2={260} y2={841} stroke="#FFFFFF" strokeWidth={0.5} strokeOpacity={0.12} />
          <SvgLine x1={160} y1={620} x2={340} y2={841} stroke="#FFFFFF" strokeWidth={0.5} strokeOpacity={0.08} />
          {/* Horizontal separator rule */}
          <SvgLine x1={50} y1={690} x2={545} y2={690} stroke="#FFFFFF" strokeWidth={0.4} strokeOpacity={0.2} />
        </Svg>
      )}

      {/* Content overlay */}
      <View style={s.coverContent}>
        <Text style={s.coverTitle}>{reportTitle}</Text>
        <Text style={s.coverParkName}>{data.parkName}</Text>
        <View style={s.coverDivider} />

        <View style={s.coverMetaRow}>
          <View>
            <Text style={s.coverMetaLabel}>Zeitraum</Text>
            <Text style={s.coverMetaValue}>{periodSubtitle}</Text>
          </View>
          <View>
            <Text style={s.coverMetaLabel}>Anlagen</Text>
            <Text style={s.coverMetaValue}>{data.turbineProduction.length}</Text>
          </View>
          {data.fundName && (
            <View>
              <Text style={s.coverMetaLabel}>Gesellschaft</Text>
              <Text style={s.coverMetaValue}>{data.fundName}</Text>
            </View>
          )}
        </View>

        {data.operatorName && (
          <View style={{ marginTop: 8 }}>
            <Text style={s.coverMetaRow}>
              <Text style={s.coverMetaLabel}>Betriebsführung  </Text>
              <Text style={[s.coverMetaValue, { fontSize: 10 }]}>{data.operatorName}</Text>
            </Text>
          </View>
        )}

        {data.parkAddress && (
          <View style={{ marginTop: 4 }}>
            <Text style={s.coverMetaRow}>
              <Text style={s.coverMetaLabel}>Standort  </Text>
              <Text style={[s.coverMetaValue, { fontSize: 10 }]}>{data.parkAddress}</Text>
            </Text>
          </View>
        )}
      </View>
    </Page>
  );
}

// ===========================================
// MAIN TEMPLATE
// ===========================================

export function MonthlyReportTemplate({
  data,
  template,
  letterhead,
}: MonthlyReportTemplateProps) {
  const layout = template.layout;
  const periodType = data.periodType ?? "MONTHLY";
  const hasPrevYear =
    data.prevYearProductionMwh != null || data.prevYearAvailabilityPct != null;
  const hasRevenue = data.totalRevenueEur != null;
  const hasAvailData = data.turbineAvailability.length > 0;

  // Section visibility (all shown by default)
  const sec = {
    summary: data.sections?.summary ?? true,
    production: data.sections?.production ?? true,
    availability: data.sections?.availability ?? true,
    service: data.sections?.service ?? true,
    monthlyTrend: data.sections?.monthlyTrend ?? true,
    windAnalysis: data.sections?.windAnalysis ?? true,
    powerCurve: data.sections?.powerCurve ?? true,
    dailyProfile: data.sections?.dailyProfile ?? true,
  };
  const hasEvents = data.serviceEvents.length > 0;
  const hasTrend = (periodType === "QUARTERLY" || periodType === "ANNUAL") &&
    data.monthlyTrend && data.monthlyTrend.length > 0;
  const hasTurbineTrend = hasTrend && data.turbineMonthlyProduction &&
    data.turbineMonthlyProduction.length > 0;

  const totalHours = data.turbineProduction.reduce(
    (sum, t) => sum + (t.operatingHours ?? 0),
    0
  );

  // Report title based on period type
  const reportTitle = periodType === "ANNUAL"
    ? `Jahresbericht ${data.year}`
    : periodType === "QUARTERLY"
    ? `Quartalsbericht ${data.periodLabel || data.monthName + " " + data.year}`
    : `Monatsbericht ${data.monthName} ${data.year}`;

  const periodSubtitle = data.periodLabel || `${data.monthName} ${data.year}`;

  // Trend calculations
  const prodTrend = diffPct(data.totalProductionMwh, data.prevYearProductionMwh);
  const availTrend = diffPct(data.avgAvailabilityPct, data.prevYearAvailabilityPct);
  const windTrend = diffPct(data.avgWindSpeedMs, data.prevYearWindSpeedMs);
  const revTrend = diffPct(data.totalRevenueEur, data.prevYearRevenueEur);

  return (
    <Document>
      {/* ========== COVER PAGE ========== */}
      <CoverPage data={data} reportTitle={reportTitle} periodSubtitle={periodSubtitle} />

      {/* ========== PAGE 1: EXECUTIVE SUMMARY ========== */}
      {sec.summary && (
      <PageWrap
        letterhead={letterhead}
        layout={layout}
        template={template}
        companyName={data.operatorName ?? undefined}
      >
        {/* Title Banner */}
        <View style={s.titleBanner}>
          {/* Decorative circles in banner */}
          <Svg width={595} height={80} style={{ position: "absolute", top: 0, right: 0 }}>
            <SvgCircle cx={560} cy={40} r={55} fill="#FFFFFF" fillOpacity={0.05} />
            <SvgCircle cx={510} cy={20} r={30} fill="#FFFFFF" fillOpacity={0.04} />
          </Svg>
          {/* Gold accent bar above title */}
          <View style={{ width: 40, height: 3, backgroundColor: "#C09B4A", marginBottom: 6 }} />
          <Text style={s.titleText}>{reportTitle}</Text>
          <Text style={s.titleSubText}>{data.parkName}</Text>
          <View style={s.titleMeta}>
            <View style={s.titleMetaItem}>
              <Text style={s.titleMetaLabel}>Anlagen </Text>
              <Text style={s.titleMetaValue}>{data.turbineProduction.length}</Text>
            </View>
            {data.fundName && (
              <View style={s.titleMetaItem}>
                <Text style={s.titleMetaLabel}>Gesellschaft </Text>
                <Text style={s.titleMetaValue}>{data.fundName}</Text>
              </View>
            )}
            {data.parkAddress && (
              <View style={s.titleMetaItem}>
                <Text style={s.titleMetaLabel}>Standort </Text>
                <Text style={s.titleMetaValue}>{data.parkAddress}</Text>
              </View>
            )}
          </View>
        </View>

        {/* KPI Cards */}
        <SectionHead title="Kennzahlen" subtitle={periodSubtitle} />

        <View style={s.kpiGrid}>
          <KpiCard
            label="Gesamtproduktion"
            value={formatNumber(data.totalProductionMwh, 1)}
            unit="MWh"
            color={C.navyLight}
            trend={hasPrevYear ? prodTrend : undefined}
          />
          <KpiCard
            label="Verfügbarkeit"
            value={data.avgAvailabilityPct != null ? formatNumber(data.avgAvailabilityPct, 1) : "k.A."}
            unit="%"
            color={C.green}
            trend={hasPrevYear ? availTrend : undefined}
          />
          <KpiCard
            label="Windgeschwindigkeit"
            value={data.avgWindSpeedMs != null ? formatNumber(data.avgWindSpeedMs, 1) : "k.A."}
            unit="m/s"
            color={C.blue}
            trend={hasPrevYear ? windTrend : undefined}
          />
          <KpiCard
            label="Specific Yield"
            value={data.specificYieldKwhPerKw != null ? formatNumber(data.specificYieldKwhPerKw, 0) : "k.A."}
            unit="kWh/kW"
            color={C.amber}
          />
          {hasRevenue && (
            <KpiCard
              label="Erlöse"
              value={formatCurrency(data.totalRevenueEur!)}
              unit=""
              color={C.green}
              trend={hasPrevYear ? revTrend : undefined}
            />
          )}
          <KpiCard
            label="Betriebsstunden"
            value={formatNumber(totalHours, 0)}
            unit="h"
            color={C.gray400}
          />
        </View>

        {/* Year-over-year comparison */}
        {hasPrevYear && (
          <View style={s.compBox}>
            <Text style={s.compTitle}>
              Vergleich Vorjahreszeitraum ({data.year - 1})
            </Text>
            <View style={s.compHeader}>
              <Text style={[s.compHeaderText, { width: "35%" }]}>Kennzahl</Text>
              <Text style={[s.compHeaderText, { width: "22%", textAlign: "right" }]}>Aktuell</Text>
              <Text style={[s.compHeaderText, { width: "22%", textAlign: "right" }]}>Vorjahr</Text>
              <Text style={[s.compHeaderText, { width: "21%", textAlign: "right" }]}>Abweichung</Text>
            </View>

            <View style={s.compRow}>
              <Text style={s.compLabel}>Produktion</Text>
              <Text style={s.compCurrent}>{fmtMwh(data.totalProductionMwh)}</Text>
              <Text style={s.compPrev}>{fmtMwh(data.prevYearProductionMwh)}</Text>
              <Text style={[s.compDiff, { color: prodTrend.positive ? C.green : C.red }]}>
                {prodTrend.text}
              </Text>
            </View>
            <View style={s.compRow}>
              <Text style={s.compLabel}>Verfügbarkeit</Text>
              <Text style={s.compCurrent}>{fmtPct(data.avgAvailabilityPct)}</Text>
              <Text style={s.compPrev}>{fmtPct(data.prevYearAvailabilityPct)}</Text>
              <Text style={[s.compDiff, { color: availTrend.positive ? C.green : C.red }]}>
                {availTrend.text}
              </Text>
            </View>
            <View style={s.compRow}>
              <Text style={s.compLabel}>Windgeschwindigkeit</Text>
              <Text style={s.compCurrent}>{fmtWind(data.avgWindSpeedMs)}</Text>
              <Text style={s.compPrev}>{fmtWind(data.prevYearWindSpeedMs)}</Text>
              <Text style={[s.compDiff, { color: windTrend.positive ? C.green : C.red }]}>
                {windTrend.text}
              </Text>
            </View>
            {hasRevenue && data.prevYearRevenueEur != null && (
              <View style={s.compRow}>
                <Text style={s.compLabel}>Erlöse</Text>
                <Text style={s.compCurrent}>{formatCurrency(data.totalRevenueEur!)}</Text>
                <Text style={s.compPrev}>{formatCurrency(data.prevYearRevenueEur)}</Text>
                <Text style={[s.compDiff, { color: revTrend.positive ? C.green : C.red }]}>
                  {revTrend.text}
                </Text>
              </View>
            )}
          </View>
        )}

        <Text style={s.generatedAt}>
          Erstellt am {formatDate(new Date(data.generatedAt))}
        </Text>
      </PageWrap>
      )}

      {/* ========== PAGE 2: PRODUKTION ========== */}
      {sec.production && (
      <PageWrap
        letterhead={letterhead}
        layout={layout}
        template={template}
        companyName={data.operatorName ?? undefined}
      >
        <SectionHead
          title="Produktion"
          subtitle={`${data.parkName} — ${periodSubtitle}`}
        />

        {data.turbineProduction.length > 0 ? (
          <>
            <View style={s.table}>
              <View style={s.tHead}>
                <Text style={[s.tHeadText, s.colTurbine]}>Anlage</Text>
                <Text style={[s.tHeadText, s.colProd]}>Produktion</Text>
                <Text style={[s.tHeadText, s.colHours]}>Betriebsstd.</Text>
                <Text style={[s.tHeadText, s.colAvail]}>Verfügbarkeit</Text>
                <Text style={[s.tHeadText, s.colCf]}>Capacity Factor</Text>
              </View>

              {data.turbineProduction.map((t, i) => (
                <View key={t.turbineId} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                  <Text style={[s.tCellBold, s.colTurbine]}>{t.designation}</Text>
                  <Text style={[s.tCellRight, s.colProd]}>
                    {formatNumber(t.productionMwh, 2)} MWh
                  </Text>
                  <Text style={[s.tCellRight, s.colHours]}>{fmtHours(t.operatingHours)}</Text>
                  <Text
                    style={[
                      s.tCellRight,
                      s.colAvail,
                      {
                        color:
                          t.availabilityPct != null && t.availabilityPct < 90
                            ? C.red
                            : t.availabilityPct != null && t.availabilityPct >= 97
                            ? C.green
                            : C.gray700,
                        fontWeight: "bold",
                      },
                    ]}
                  >
                    {fmtPct(t.availabilityPct)}
                  </Text>
                  <Text style={[s.tCellRight, s.colCf]}>{fmtPct(t.capacityFactor)}</Text>
                </View>
              ))}

              <View style={s.tFoot}>
                <Text style={[s.tFootText, s.colTurbine]}>GESAMT / DURCHSCHNITT</Text>
                <Text style={[s.tFootRight, s.colProd]}>
                  {formatNumber(data.totalProductionMwh, 2)} MWh
                </Text>
                <Text style={[s.tFootRight, s.colHours]}>{fmtHours(totalHours)}</Text>
                <Text style={[s.tFootRight, s.colAvail]}>{fmtPct(data.avgAvailabilityPct)}</Text>
                <Text style={[s.tFootRight, s.colCf]}>-</Text>
              </View>
            </View>

            <ProductionChart turbines={data.turbineProduction} />
          </>
        ) : (
          <Text style={s.noData}>Keine Produktionsdaten für diesen Monat vorhanden.</Text>
        )}
      </PageWrap>
      )}

      {/* ========== PAGE 3: VERFÜGBARKEIT ========== */}
      {hasAvailData && sec.availability && (
        <PageWrap
          letterhead={letterhead}
          layout={layout}
          template={template}
          companyName={data.operatorName ?? undefined}
        >
          <SectionHead
            title="Verfügbarkeit"
            subtitle={`${data.parkName} — ${periodSubtitle}`}
          />

          {/* Stacked availability bars */}
          <AvailabilityStackedBars rows={data.turbineAvailability} />

          {/* Detailed table */}
          <View style={s.table}>
            <View style={s.tHead}>
              <Text style={[s.tHeadText, s.colAvTurb]}>Anlage</Text>
              <Text style={[s.tHeadText, s.colAvT1]}>T1 Prod.</Text>
              <Text style={[s.tHeadText, s.colAvT2]}>T2 Wind</Text>
              <Text style={[s.tHeadText, s.colAvT3]}>T3 Umwelt</Text>
              <Text style={[s.tHeadText, s.colAvT4]}>T4 Wart.</Text>
              <Text style={[s.tHeadText, s.colAvT5]}>T5 Stör.</Text>
              <Text style={[s.tHeadText, s.colAvT6]}>T6 Sonst.</Text>
              <Text style={[s.tHeadText, s.colAvPct]}>Verfüg.</Text>
            </View>

            {data.turbineAvailability.map((t, i) => (
              <View key={t.turbineId} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                <Text style={[s.tCellBold, s.colAvTurb]}>{t.designation}</Text>
                <Text style={[s.tCellRight, s.colAvT1]}>{formatNumber(t.t1Hours, 0)} h</Text>
                <Text style={[s.tCellRight, s.colAvT2]}>{formatNumber(t.t2Hours, 0)} h</Text>
                <Text style={[s.tCellRight, s.colAvT3]}>{formatNumber(t.t3Hours, 0)} h</Text>
                <Text style={[s.tCellRight, s.colAvT4]}>{formatNumber(t.t4Hours, 0)} h</Text>
                <Text style={[s.tCellRight, s.colAvT5]}>
                  <Text
                    style={{
                      color: t.t5Hours > 24 ? C.red : C.gray700,
                      fontWeight: t.t5Hours > 24 ? "bold" : "normal",
                    }}
                  >
                    {formatNumber(t.t5Hours, 0)} h
                  </Text>
                </Text>
                <Text style={[s.tCellRight, s.colAvT6]}>{formatNumber(t.t6Hours, 0)} h</Text>
                <Text
                  style={[
                    s.tCellRight,
                    s.colAvPct,
                    {
                      fontWeight: "bold",
                      color:
                        t.availabilityPct != null && t.availabilityPct < 90
                          ? C.red
                          : t.availabilityPct != null && t.availabilityPct >= 97
                          ? C.green
                          : C.gray700,
                    },
                  ]}
                >
                  {fmtPct(t.availabilityPct)}
                </Text>
              </View>
            ))}

            <View style={s.tFoot}>
              <Text style={[s.tFootText, s.colAvTurb]}>PARK ∅</Text>
              <Text style={[s.tFootRight, s.colAvT1]}>
                {formatNumber(
                  data.turbineAvailability.reduce((sum, t) => sum + t.t1Hours, 0) /
                    Math.max(data.turbineAvailability.length, 1),
                  0
                )} h
              </Text>
              <Text style={[s.tFootRight, s.colAvT2]}>
                {formatNumber(
                  data.turbineAvailability.reduce((sum, t) => sum + t.t2Hours, 0) /
                    Math.max(data.turbineAvailability.length, 1),
                  0
                )} h
              </Text>
              <Text style={[s.tFootRight, s.colAvT3]}>-</Text>
              <Text style={[s.tFootRight, s.colAvT4]}>-</Text>
              <Text style={[s.tFootRight, s.colAvT5]}>-</Text>
              <Text style={[s.tFootRight, s.colAvT6]}>-</Text>
              <Text style={[s.tFootRight, s.colAvPct]}>{fmtPct(data.avgAvailabilityPct)}</Text>
            </View>
          </View>

          {/* Notable downtimes */}
          {data.notableDowntimes.length > 0 && (
            <View style={s.alertBox}>
              <Text style={s.alertTitle}>
                Auffällige Anlagen (Verfügbarkeit &lt; 90%)
              </Text>
              {data.notableDowntimes.map((note, i) => (
                <Text key={i} style={s.alertItem}>
                  {"\u2022"} {note}
                </Text>
              ))}
            </View>
          )}
        </PageWrap>
      )}

      {/* ========== PAGE 4: EREIGNISSE ========== */}
      {sec.service && (
      <PageWrap
        letterhead={letterhead}
        layout={layout}
        template={template}
        companyName={data.operatorName ?? undefined}
      >
        <SectionHead
          title="Ereignisse"
          subtitle={`${data.parkName} — ${periodSubtitle}`}
        />

        {hasEvents ? (
          <>
            {/* Summary badges */}
            <View style={[s.infoPanel, { marginBottom: 12 }]}>
              <View style={{ flexDirection: "row", gap: 16 }}>
                <View>
                  <Text style={{ fontSize: 7, color: C.gray500, marginBottom: 2 }}>Ereignisse</Text>
                  <Text style={{ fontSize: 16, fontWeight: "bold", color: C.navy }}>
                    {data.serviceEvents.length}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 7, color: C.gray500, marginBottom: 2 }}>
                    Gesamtdauer
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: "bold", color: C.navy }}>
                    {formatNumber(
                      data.serviceEvents.reduce((sum, e) => sum + (e.durationHours ?? 0), 0),
                      1
                    )} h
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 7, color: C.gray500, marginBottom: 2 }}>
                    Betroffene Anlagen
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: "bold", color: C.navy }}>
                    {new Set(data.serviceEvents.map((e) => e.turbineDesignation)).size}
                  </Text>
                </View>
              </View>
            </View>

            {/* Events table */}
            <View style={s.table}>
              <View style={s.tHead}>
                <Text style={[s.tHeadText, s.colEvDate]}>Datum</Text>
                <Text style={[s.tHeadText, s.colEvType]}>Typ</Text>
                <Text style={[s.tHeadText, s.colEvTurb]}>Anlage</Text>
                <Text style={[s.tHeadText, s.colEvDesc]}>Beschreibung</Text>
                <Text style={[s.tHeadText, s.colEvDur]}>Dauer</Text>
              </View>

              {data.serviceEvents.map((ev, i) => (
                <View key={ev.id} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                  <Text style={[s.tCell, s.colEvDate]}>{formatDate(ev.eventDate)}</Text>
                  <View style={s.colEvType}>
                    <EventBadge type={ev.eventType} />
                  </View>
                  <Text style={[s.tCellBold, s.colEvTurb]}>{ev.turbineDesignation}</Text>
                  <Text style={[s.tCell, s.colEvDesc]}>{ev.description || "-"}</Text>
                  <Text style={[s.tCellRight, s.colEvDur]}>
                    {ev.durationHours != null ? `${formatNumber(ev.durationHours, 1)} h` : "-"}
                  </Text>
                </View>
              ))}

              <View style={s.tFoot}>
                <Text style={[s.tFootText, { width: "70%" }]}>
                  {data.serviceEvents.length} Ereignisse
                </Text>
                <Text style={[s.tFootRight, { width: "30%" }]}>
                  {formatNumber(
                    data.serviceEvents.reduce((sum, e) => sum + (e.durationHours ?? 0), 0),
                    1
                  )} h
                </Text>
              </View>
            </View>
          </>
        ) : (
          <View style={s.infoPanel}>
            <Text style={{ fontSize: 10, textAlign: "center", color: C.gray400 }}>
              Keine besonderen Ereignisse im Berichtszeitraum.
            </Text>
          </View>
        )}

        <Text style={s.generatedAt}>
          Erstellt am {formatDate(new Date(data.generatedAt))}
        </Text>
      </PageWrap>
      )}

      {/* ========== EXTRA: MONTHLY TREND (QUARTERLY/ANNUAL) ========== */}
      {hasTrend && data.monthlyTrend && sec.monthlyTrend && (
        <PageWrap
          letterhead={letterhead}
          layout={layout}
          template={template}
          companyName={data.operatorName ?? undefined}
        >
          <SectionHead
            title="Monatliche Entwicklung"
            subtitle={`${data.parkName} — ${periodSubtitle}`}
          />

          {/* Monthly KPI trend table */}
          <View style={s.table}>
            <View style={s.tHead}>
              <Text style={[s.tHeadText, { width: "20%" }]}>Monat</Text>
              <Text style={[s.tHeadText, { width: "20%", textAlign: "right" }]}>Produktion</Text>
              <Text style={[s.tHeadText, { width: "20%", textAlign: "right" }]}>Verfüg.</Text>
              <Text style={[s.tHeadText, { width: "20%", textAlign: "right" }]}>Wind</Text>
              <Text style={[s.tHeadText, { width: "20%", textAlign: "right" }]}>Erlöse</Text>
            </View>

            {data.monthlyTrend.map((m, i) => (
              <View key={m.month} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                <Text style={[s.tCellBold, { width: "20%" }]}>{m.monthNameShort}</Text>
                <Text style={[s.tCellRight, { width: "20%" }]}>
                  {formatNumber(m.productionMwh, 1)} MWh
                </Text>
                <Text
                  style={[
                    s.tCellRight,
                    { width: "20%" },
                    {
                      color:
                        m.avgAvailabilityPct != null && m.avgAvailabilityPct < 90
                          ? C.red
                          : m.avgAvailabilityPct != null && m.avgAvailabilityPct >= 97
                          ? C.green
                          : C.gray700,
                      fontWeight: "bold",
                    },
                  ]}
                >
                  {fmtPct(m.avgAvailabilityPct)}
                </Text>
                <Text style={[s.tCellRight, { width: "20%" }]}>{fmtWind(m.avgWindSpeedMs)}</Text>
                <Text style={[s.tCellRight, { width: "20%" }]}>
                  {m.revenueEur != null ? formatCurrency(m.revenueEur) : "-"}
                </Text>
              </View>
            ))}

            <View style={s.tFoot}>
              <Text style={[s.tFootText, { width: "20%" }]}>GESAMT</Text>
              <Text style={[s.tFootRight, { width: "20%" }]}>
                {formatNumber(data.totalProductionMwh, 1)} MWh
              </Text>
              <Text style={[s.tFootRight, { width: "20%" }]}>
                {fmtPct(data.avgAvailabilityPct)}
              </Text>
              <Text style={[s.tFootRight, { width: "20%" }]}>
                {fmtWind(data.avgWindSpeedMs)}
              </Text>
              <Text style={[s.tFootRight, { width: "20%" }]}>
                {data.totalRevenueEur != null ? formatCurrency(data.totalRevenueEur) : "-"}
              </Text>
            </View>
          </View>

          {/* Monthly production bar chart */}
          <View style={s.chartWrap}>
            <SectionHead title="Produktion pro Monat" />
            {(() => {
              const maxMwh = Math.max(...data.monthlyTrend.map((m) => m.productionMwh), 1);
              return data.monthlyTrend.map((m, i) => {
                const pct = Math.max((m.productionMwh / maxMwh) * 100, 2);
                return (
                  <View key={m.month} style={s.chartRow}>
                    <Text style={s.chartLabel}>{m.monthNameShort}</Text>
                    <View style={s.chartTrack}>
                      <View
                        style={[
                          s.chartBar,
                          {
                            width: `${pct}%`,
                            backgroundColor: i % 2 === 0 ? C.navyLight : C.navy,
                          },
                        ]}
                      />
                    </View>
                    <Text style={s.chartValLabel}>
                      {formatNumber(m.productionMwh, 0)} MWh
                    </Text>
                  </View>
                );
              });
            })()}
          </View>
        </PageWrap>
      )}

      {/* ========== PAGE: WIND ANALYSIS (Windrose + Distribution) ========== */}
      {data.windRose && data.windRose.meta.totalMeasurements > 0 && sec.windAnalysis && (
        <PageWrap
          letterhead={letterhead}
          layout={layout}
          template={template}
          companyName={data.operatorName ?? undefined}
        >
          <SectionHead
            title="Windanalyse"
            subtitle={`${data.parkName} — ${periodSubtitle}`}
          />

          <View style={{ flexDirection: "row", gap: 20, marginBottom: 16 }}>
            {/* Wind rose */}
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ fontSize: 9, fontWeight: "bold", color: C.navy, marginBottom: 8 }}>
                Windrose
              </Text>
              <PdfWindRose
                data={data.windRose.data}
                meta={data.windRose.meta}
                size={240}
              />
              <View style={{ marginTop: 6 }}>
                <PdfWindRoseLegend />
              </View>
              {data.windRose.meta.dominantDirection && (
                <Text style={{ fontSize: 7, color: C.gray500, marginTop: 4 }}>
                  Hauptwindrichtung: {data.windRose.meta.dominantDirection}
                  {data.windRose.meta.avgWindSpeed != null &&
                    ` | \u00D8 ${formatNumber(data.windRose.meta.avgWindSpeed, 1)} m/s`}
                </Text>
              )}
            </View>

            {/* Wind distribution */}
            {data.windDistribution && data.windDistribution.length > 0 && (
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 9, fontWeight: "bold", color: C.navy, marginBottom: 8 }}>
                  Windgeschwindigkeitsverteilung
                </Text>
                <PdfWindDistribution data={data.windDistribution} width={260} height={200} />
              </View>
            )}
          </View>
        </PageWrap>
      )}

      {/* ========== PAGE: POWER CURVE ========== */}
      {data.powerCurve && (data.powerCurve.scatter.length > 0 || data.powerCurve.curve.length > 0) && sec.powerCurve && (
        <PageWrap
          letterhead={letterhead}
          layout={layout}
          template={template}
          companyName={data.operatorName ?? undefined}
        >
          <SectionHead
            title="Leistungskurve"
            subtitle={`${data.parkName} — ${periodSubtitle}`}
          />

          <View style={{ alignItems: "center", marginBottom: 12 }}>
            <PdfPowerCurve
              scatter={data.powerCurve.scatter}
              curve={data.powerCurve.curve}
              ratedPowerKw={data.powerCurve.ratedPowerKw}
              width={500}
              height={280}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 16, paddingHorizontal: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 12, height: 3, backgroundColor: "#1d4ed8" }} />
              <Text style={{ fontSize: 7, color: C.gray500 }}>Mittelwert (0,5 m/s Bins)</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#93c5fd", opacity: 0.6 }} />
              <Text style={{ fontSize: 7, color: C.gray500 }}>Messpunkte (Stichprobe)</Text>
            </View>
            {data.powerCurve.ratedPowerKw && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={{ width: 12, height: 0, borderTop: "1pt dashed #ef4444" }} />
                <Text style={{ fontSize: 7, color: C.gray500 }}>Nennleistung</Text>
              </View>
            )}
          </View>
        </PageWrap>
      )}

      {/* ========== PAGE: DAILY PROFILE ========== */}
      {data.dailyProfile && data.dailyProfile.length > 0 && sec.dailyProfile && (
        <PageWrap
          letterhead={letterhead}
          layout={layout}
          template={template}
          companyName={data.operatorName ?? undefined}
        >
          <SectionHead
            title="Tagesgang"
            subtitle={`${data.parkName} — ${periodSubtitle}`}
          />

          <View style={{ alignItems: "center", marginBottom: 12 }}>
            <PdfDailyProfile
              data={data.dailyProfile}
              width={500}
              height={250}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 16, paddingHorizontal: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 12, height: 3, backgroundColor: "#3b82f6" }} />
              <Text style={{ fontSize: 7, color: C.gray500 }}>Durchschnittliche Leistung (kW)</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 12, height: 3, backgroundColor: "#f59e0b" }} />
              <Text style={{ fontSize: 7, color: C.gray500 }}>Durchschnittliche Windgeschwindigkeit (m/s)</Text>
            </View>
          </View>

          <Text style={{ fontSize: 7, color: C.gray400, marginTop: 8, textAlign: "center" }}>
            Gemittelt ueber alle Tage des Berichtszeitraums in 10-Minuten-Intervallen
          </Text>
        </PageWrap>
      )}

      {/* ========== EXTRA: TURBINE × MONTH PRODUCTION (QUARTERLY/ANNUAL) ========== */}
      {hasTurbineTrend && data.turbineMonthlyProduction && data.monthlyTrend && sec.monthlyTrend && (
        <PageWrap
          letterhead={letterhead}
          layout={layout}
          template={template}
          companyName={data.operatorName ?? undefined}
        >
          <SectionHead
            title="Produktion pro Anlage und Monat"
            subtitle={`${data.parkName} — ${periodSubtitle}`}
          />

          <View style={s.table}>
            {/* Header row with month names */}
            <View style={s.tHead}>
              <Text style={[s.tHeadText, { width: "16%" }]}>Anlage</Text>
              {data.monthlyTrend.map((m) => (
                <Text
                  key={m.month}
                  style={[
                    s.tHeadText,
                    {
                      width: `${Math.floor(68 / data.monthlyTrend!.length)}%`,
                      textAlign: "right",
                    },
                  ]}
                >
                  {m.monthNameShort}
                </Text>
              ))}
              <Text style={[s.tHeadText, { width: "16%", textAlign: "right" }]}>Summe</Text>
            </View>

            {/* Turbine rows */}
            {data.turbineMonthlyProduction.map((t, i) => (
              <View key={t.turbineId} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                <Text style={[s.tCellBold, { width: "16%" }]}>{t.designation}</Text>
                {t.monthlyMwh.map((mwh, mi) => (
                  <Text
                    key={mi}
                    style={[
                      s.tCellRight,
                      {
                        width: `${Math.floor(68 / data.monthlyTrend!.length)}%`,
                        fontSize: 7,
                      },
                    ]}
                  >
                    {mwh != null ? formatNumber(mwh, 0) : "-"}
                  </Text>
                ))}
                <Text style={[s.tCellRight, { width: "16%", fontWeight: "bold" }]}>
                  {formatNumber(t.totalMwh, 0)}
                </Text>
              </View>
            ))}

            {/* Sum row */}
            <View style={s.tFoot}>
              <Text style={[s.tFootText, { width: "16%" }]}>Summe</Text>
              {data.monthlyTrend.map((m) => (
                <Text
                  key={m.month}
                  style={[
                    s.tFootRight,
                    {
                      width: `${Math.floor(68 / data.monthlyTrend!.length)}%`,
                      fontSize: 7,
                    },
                  ]}
                >
                  {formatNumber(m.productionMwh, 0)}
                </Text>
              ))}
              <Text style={[s.tFootRight, { width: "16%" }]}>
                {formatNumber(data.totalProductionMwh, 0)}
              </Text>
            </View>
          </View>

          <Text style={{ fontSize: 7, color: C.gray400, marginTop: 4 }}>
            Alle Werte in MWh
          </Text>
        </PageWrap>
      )}

    </Document>
  );
}
