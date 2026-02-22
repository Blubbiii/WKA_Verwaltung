/**
 * Annual Report (Jahresbericht) PDF Template
 *
 * Generates a multi-page annual report for a wind park containing:
 * - Page 1: Cover page (Deckblatt)
 * - Page 2: Annual KPI summary with year comparison
 * - Page 3: Monthly production trend table (12 months)
 * - Page 4: Per-turbine annual performance
 * - Page 5: Financial overview (if revenue data available)
 * - Page 6: Service & maintenance summary
 */

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ResolvedLetterhead, ResolvedTemplate } from "../utils/templateResolver";
import { Header } from "./components/Header";
import { Footer, PageNumber } from "./components/Footer";
import { PdfNetworkTopology, type TopologyTurbine } from "./components/PdfNetworkTopology";
import { formatNumber, formatDate } from "../utils/formatters";
import { formatCurrency } from "@/lib/format";

// ===========================================
// STYLES
// ===========================================

const COLORS = {
  primary: "#1E3A5F",
  secondary: "#3B82F6",
  accent: "#10B981",
  warning: "#F59E0B",
  danger: "#DC2626",
  muted: "#666666",
  light: "#F5F5F5",
  border: "#E0E0E0",
  white: "#FFFFFF",
  text: "#333333",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: COLORS.text,
  },
  content: {
    flex: 1,
  },

  // Cover page
  coverContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  coverTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 10,
  },
  coverYear: {
    fontSize: 48,
    fontWeight: "bold",
    color: COLORS.secondary,
    marginBottom: 30,
  },
  coverParkName: {
    fontSize: 18,
    color: COLORS.primary,
    marginBottom: 8,
  },
  coverInfo: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 4,
  },
  coverDivider: {
    width: 80,
    height: 3,
    backgroundColor: COLORS.secondary,
    marginVertical: 20,
  },
  coverDate: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 40,
  },

  // Section title
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 10,
    marginTop: 5,
  },
  subSectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 8,
    marginTop: 10,
  },

  // KPI Cards
  kpiRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 15,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: COLORS.light,
    padding: 12,
    borderRadius: 3,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.secondary,
  },
  kpiCardAccent: {
    borderLeftColor: COLORS.accent,
  },
  kpiCardWarning: {
    borderLeftColor: COLORS.warning,
  },
  kpiLabel: {
    fontSize: 8,
    color: COLORS.muted,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  kpiUnit: {
    fontSize: 8,
    color: COLORS.muted,
    marginTop: 2,
  },

  // Year comparison
  comparisonBox: {
    backgroundColor: COLORS.light,
    padding: 15,
    borderRadius: 3,
    marginBottom: 15,
  },
  comparisonTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 10,
    color: COLORS.primary,
  },
  comparisonRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  comparisonLabel: {
    fontSize: 9,
    color: COLORS.muted,
    width: 180,
  },
  comparisonCurrent: {
    fontSize: 9,
    fontWeight: "bold",
    width: 120,
    textAlign: "right",
  },
  comparisonPrev: {
    fontSize: 9,
    color: COLORS.muted,
    width: 120,
    textAlign: "right",
  },
  comparisonDiff: {
    fontSize: 9,
    width: 80,
    textAlign: "right",
  },
  comparisonHeader: {
    flexDirection: "row",
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  comparisonHeaderText: {
    fontSize: 8,
    fontWeight: "bold",
    color: COLORS.muted,
  },

  // Tables
  table: {
    marginTop: 5,
    marginBottom: 15,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 5,
  },
  tableHeaderText: {
    fontSize: 7,
    fontWeight: "bold",
    color: COLORS.white,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  tableRowAlt: {
    backgroundColor: "#FAFAFA",
  },
  tableCell: {
    fontSize: 7,
  },
  tableCellRight: {
    fontSize: 7,
    textAlign: "right",
  },
  tableCellBold: {
    fontSize: 7,
    fontWeight: "bold",
  },
  summaryRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 5,
    backgroundColor: COLORS.primary,
    marginTop: 2,
  },
  summaryText: {
    fontSize: 8,
    fontWeight: "bold",
    color: COLORS.white,
  },
  summaryTextRight: {
    fontSize: 8,
    fontWeight: "bold",
    color: COLORS.white,
    textAlign: "right",
  },

  // Monthly trend columns
  colMonth: { width: "14%" },
  colMProd: { width: "18%", textAlign: "right" },
  colMWind: { width: "16%", textAlign: "right" },
  colMAvail: { width: "16%", textAlign: "right" },
  colMHours: { width: "18%", textAlign: "right" },
  colMRevenue: { width: "18%", textAlign: "right" },

  // Turbine performance columns
  colTurbine: { width: "16%" },
  colTProd: { width: "14%", textAlign: "right" },
  colTHours: { width: "14%", textAlign: "right" },
  colTAvail: { width: "14%", textAlign: "right" },
  colTCf: { width: "14%", textAlign: "right" },
  colTRated: { width: "14%", textAlign: "right" },
  colTYield: { width: "14%", textAlign: "right" },

  // Financial columns
  colFMonth: { width: "16%" },
  colFRevenue: { width: "21%", textAlign: "right" },
  colFProduction: { width: "21%", textAlign: "right" },
  colFRevPerKwh: { width: "21%", textAlign: "right" },
  colFCumulative: { width: "21%", textAlign: "right" },

  // Service columns
  colSType: { width: "25%" },
  colSCount: { width: "15%", textAlign: "right" },
  colSDuration: { width: "20%", textAlign: "right" },
  colSCost: { width: "20%", textAlign: "right" },
  colSPct: { width: "20%", textAlign: "right" },

  // Event list columns
  colEvDate: { width: "12%" },
  colEvType: { width: "13%" },
  colEvTurbine: { width: "13%" },
  colEvDesc: { width: "47%" },
  colEvDuration: { width: "15%", textAlign: "right" },

  // Bar chart
  chartContainer: {
    marginTop: 10,
    marginBottom: 10,
  },
  chartTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 8,
  },
  chartBarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },
  chartLabel: {
    width: 35,
    fontSize: 6,
    color: COLORS.muted,
  },
  chartBarContainer: {
    flex: 1,
    height: 12,
    backgroundColor: "#E8E8E8",
    borderRadius: 2,
    overflow: "hidden",
  },
  chartBar: {
    height: 12,
    borderRadius: 2,
  },
  chartValue: {
    width: 50,
    fontSize: 6,
    textAlign: "right",
    color: COLORS.muted,
    paddingLeft: 4,
  },

  // Info box
  infoBox: {
    backgroundColor: COLORS.light,
    padding: 15,
    borderRadius: 3,
    marginBottom: 15,
  },

  // Status indicators
  positiveValue: { color: "#16A34A" },
  negativeValue: { color: COLORS.danger },

  // Highlight box
  highlightBox: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 15,
  },
  highlightItem: {
    flex: 1,
    padding: 10,
    borderRadius: 3,
    backgroundColor: "#FAFAFA",
    borderLeftWidth: 3,
  },
  highlightLabel: {
    fontSize: 8,
    color: COLORS.muted,
    marginBottom: 3,
  },
  highlightValue: {
    fontSize: 10,
    fontWeight: "bold",
    color: COLORS.primary,
  },

  // No data
  noData: {
    padding: 30,
    textAlign: "center",
    color: COLORS.muted,
    fontSize: 10,
    fontStyle: "italic",
  },

  // Generated at
  generatedAt: {
    fontSize: 7,
    color: COLORS.muted,
    textAlign: "right",
    marginTop: 10,
  },
});

// ===========================================
// TYPES
// ===========================================

export interface MonthlyTrendRow {
  month: number;
  monthName: string;
  productionMwh: number;
  avgWindSpeedMs: number | null;
  avgAvailabilityPct: number | null;
  operatingHours: number | null;
  revenueEur: number | null;
}

export interface TurbineAnnualRow {
  turbineId: string;
  designation: string;
  totalProductionMwh: number;
  totalOperatingHours: number | null;
  avgAvailabilityPct: number | null;
  capacityFactor: number | null;
  ratedPowerKw: number | null;
  specificYield: number | null; // kWh/kW
}

export interface ServiceEventSummaryRow {
  eventType: string;
  eventTypeLabel: string;
  count: number;
  totalDurationHours: number;
  totalCost: number | null;
  percentageOfTotal: number;
}

export interface NotableEventRow {
  id: string;
  eventDate: Date | string;
  eventType: string;
  turbineDesignation: string;
  description: string | null;
  durationHours: number | null;
}

export interface AnnualReportData {
  // Park info
  parkName: string;
  parkAddress: string | null;
  fundName: string | null;
  operatorName: string | null;

  // Period
  year: number;

  // Annual KPI summary
  totalProductionMwh: number;
  avgAvailabilityPct: number | null;
  avgWindSpeedMs: number | null;
  totalOperatingHours: number | null;
  specificYieldKwhPerKw: number | null;
  totalRevenueEur: number | null;
  avgRevenuePerKwh: number | null;

  // Previous year comparison
  prevYear: {
    totalProductionMwh: number | null;
    avgAvailabilityPct: number | null;
    avgWindSpeedMs: number | null;
    totalRevenueEur: number | null;
  } | null;

  // Monthly trend (12 months)
  monthlyTrend: MonthlyTrendRow[];

  // Per-turbine performance
  turbinePerformance: TurbineAnnualRow[];

  // Best/worst turbines
  bestTurbine: { designation: string; productionMwh: number } | null;
  worstTurbine: { designation: string; productionMwh: number } | null;

  // Financial data per month
  hasFinancialData: boolean;

  // Service events
  serviceEventSummary: ServiceEventSummaryRow[];
  notableEvents: NotableEventRow[];
  totalServiceEvents: number;
  totalServiceDurationHours: number;
  totalServiceCost: number | null;

  // Generated timestamp
  generatedAt: string;

  // Topology (Gesellschafts-Struktur)
  topologyTurbines?: TopologyTurbine[];
  billingEntityName?: string | null;
}

interface AnnualReportTemplateProps {
  data: AnnualReportData;
  template: ResolvedTemplate;
  letterhead: ResolvedLetterhead;
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

const MONTH_NAMES = [
  "Januar",
  "Februar",
  "Maerz",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

function formatPercent1(value: number | null | undefined): string {
  if (value == null) return "k.A.";
  return `${formatNumber(value, 1)} %`;
}

function formatMwh(value: number | null | undefined): string {
  if (value == null) return "k.A.";
  return `${formatNumber(value, 2)} MWh`;
}

function formatDiffPercent(current: number | null, previous: number | null): string {
  if (current == null || previous == null || previous === 0) return "-";
  const diff = ((current - previous) / previous) * 100;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${formatNumber(diff, 1)} %`;
}

function translateEventType(type: string): string {
  const translations: Record<string, string> = {
    MAINTENANCE: "Wartung",
    REPAIR: "Reparatur",
    INSPECTION: "Inspektion",
    COMMISSIONING: "Inbetriebnahme",
    DECOMMISSIONING: "Stilllegung",
    INCIDENT: "Vorfall",
    GRID_OUTAGE: "Netzausfall",
    CURTAILMENT: "Abregelung",
    OTHER: "Sonstiges",
  };
  return translations[type] || type;
}

// ===========================================
// SUB-COMPONENTS
// ===========================================

function PageWrapper({
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
  // When a background PDF is configured, the letterhead already contains
  // header/footer graphics, so we skip rendering them and leave the page
  // background transparent so the letterhead shows through.
  const hasBackground = !!letterhead.backgroundPdfKey;

  return (
    <Page
      size="A4"
      style={[
        styles.page,
        hasBackground ? {} : { backgroundColor: COLORS.white },
        {
          paddingTop: letterhead.marginTop,
          paddingBottom: hasBackground
            ? letterhead.marginBottom
            : letterhead.marginBottom + letterhead.footerHeight,
          paddingLeft: letterhead.marginLeft,
          paddingRight: letterhead.marginRight,
        },
      ]}
    >
      {!hasBackground && (
        <Header letterhead={letterhead} layout={layout} companyName={companyName} />
      )}
      <View style={styles.content}>{children}</View>
      {!hasBackground && (
        <Footer letterhead={letterhead} layout={layout} customText={template.footerText} />
      )}
      <PageNumber />
    </Page>
  );
}

function MonthlyProductionChart({ data }: { data: MonthlyTrendRow[] }) {
  if (data.length === 0) return null;
  const maxProd = Math.max(...data.map((m) => m.productionMwh), 1);

  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartTitle}>Monatliche Produktion (MWh)</Text>
      {data.map((m) => {
        const barWidth = Math.max((m.productionMwh / maxProd) * 100, 1);
        return (
          <View key={m.month} style={styles.chartBarRow}>
            <Text style={styles.chartLabel}>{MONTH_SHORT[m.month - 1]}</Text>
            <View style={styles.chartBarContainer}>
              <View
                style={[
                  styles.chartBar,
                  {
                    width: `${barWidth}%`,
                    backgroundColor: COLORS.secondary,
                  },
                ]}
              />
            </View>
            <Text style={styles.chartValue}>{formatNumber(m.productionMwh, 0)} MWh</Text>
          </View>
        );
      })}
    </View>
  );
}

// ===========================================
// MAIN TEMPLATE
// ===========================================

export function AnnualReportTemplate({
  data,
  template,
  letterhead,
}: AnnualReportTemplateProps) {
  const layout = template.layout;
  const hasPrevYear = data.prevYear != null;
  const hasRevenue = data.totalRevenueEur != null;
  const hasFinancialData = data.hasFinancialData;
  const hasServiceData = data.serviceEventSummary.length > 0 || data.notableEvents.length > 0;
  const hasTopology = data.topologyTurbines && data.topologyTurbines.length > 0;

  return (
    <Document>
      {/* ========== PAGE 1: DECKBLATT ========== */}
      <PageWrapper
        letterhead={letterhead}
        layout={layout}
        template={template}
        companyName={data.operatorName ?? undefined}
      >
        <View style={styles.coverContent}>
          <Text style={styles.coverTitle}>Jahresbericht</Text>
          <Text style={styles.coverYear}>{data.year}</Text>
          <View style={styles.coverDivider} />
          <Text style={styles.coverParkName}>{data.parkName}</Text>
          {data.operatorName && (
            <Text style={styles.coverInfo}>Betreiber: {data.operatorName}</Text>
          )}
          {data.fundName && (
            <Text style={styles.coverInfo}>Gesellschaft: {data.fundName}</Text>
          )}
          {data.parkAddress && (
            <Text style={styles.coverInfo}>Standort: {data.parkAddress}</Text>
          )}
          <Text style={styles.coverDate}>
            Erstellt am {formatDate(new Date(data.generatedAt))}
          </Text>
        </View>
      </PageWrapper>

      {/* ========== PAGE 2: NETZ-TOPOLOGIE (optional) ========== */}
      {hasTopology && (
        <PageWrapper
          letterhead={letterhead}
          layout={layout}
          template={template}
          companyName={data.operatorName ?? undefined}
        >
          <Text style={styles.title}>Netz-Topologie</Text>
          <Text style={styles.subtitle}>
            Gesellschaftsstruktur {data.parkName}
          </Text>

          <PdfNetworkTopology
            parkName={data.parkName}
            turbines={data.topologyTurbines!}
            billingEntityName={data.billingEntityName}
          />
        </PageWrapper>
      )}

      {/* ========== JAHRESUEBERSICHT ========== */}
      <PageWrapper
        letterhead={letterhead}
        layout={layout}
        template={template}
        companyName={data.operatorName ?? undefined}
      >
        <Text style={styles.title}>Jahresuebersicht {data.year}</Text>
        <Text style={styles.subtitle}>{data.parkName}</Text>

        {/* Annual KPIs */}
        <Text style={styles.sectionTitle}>Kennzahlen</Text>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Gesamtproduktion</Text>
            <Text style={styles.kpiValue}>{formatNumber(data.totalProductionMwh, 1)}</Text>
            <Text style={styles.kpiUnit}>MWh</Text>
          </View>
          <View style={[styles.kpiCard, styles.kpiCardAccent]}>
            <Text style={styles.kpiLabel}>Verfuegbarkeit (Mittel)</Text>
            <Text style={styles.kpiValue}>
              {data.avgAvailabilityPct != null
                ? formatNumber(data.avgAvailabilityPct, 1)
                : "k.A."}
            </Text>
            <Text style={styles.kpiUnit}>%</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Mittl. Windgeschwindigkeit</Text>
            <Text style={styles.kpiValue}>
              {data.avgWindSpeedMs != null
                ? formatNumber(data.avgWindSpeedMs, 1)
                : "k.A."}
            </Text>
            <Text style={styles.kpiUnit}>m/s</Text>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, styles.kpiCardWarning]}>
            <Text style={styles.kpiLabel}>Specific Yield</Text>
            <Text style={styles.kpiValue}>
              {data.specificYieldKwhPerKw != null
                ? formatNumber(data.specificYieldKwhPerKw, 0)
                : "k.A."}
            </Text>
            <Text style={styles.kpiUnit}>kWh/kW</Text>
          </View>
          {hasRevenue && (
            <View style={[styles.kpiCard, styles.kpiCardAccent]}>
              <Text style={styles.kpiLabel}>Gesamterloese</Text>
              <Text style={styles.kpiValue}>{formatCurrency(data.totalRevenueEur!)}</Text>
              <Text style={styles.kpiUnit}>EUR</Text>
            </View>
          )}
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Betriebsstunden</Text>
            <Text style={styles.kpiValue}>
              {data.totalOperatingHours != null
                ? formatNumber(data.totalOperatingHours, 0)
                : "k.A."}
            </Text>
            <Text style={styles.kpiUnit}>h</Text>
          </View>
        </View>

        {/* Year comparison */}
        {hasPrevYear && data.prevYear && (
          <View style={styles.comparisonBox}>
            <Text style={styles.comparisonTitle}>
              Jahresvergleich {data.year} vs. {data.year - 1}
            </Text>
            <View style={styles.comparisonHeader}>
              <Text style={[styles.comparisonHeaderText, { width: 180 }]}>Kennzahl</Text>
              <Text style={[styles.comparisonHeaderText, { width: 120, textAlign: "right" }]}>
                {data.year}
              </Text>
              <Text style={[styles.comparisonHeaderText, { width: 120, textAlign: "right" }]}>
                {data.year - 1}
              </Text>
              <Text style={[styles.comparisonHeaderText, { width: 80, textAlign: "right" }]}>
                Abweichung
              </Text>
            </View>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>Produktion</Text>
              <Text style={styles.comparisonCurrent}>
                {formatMwh(data.totalProductionMwh)}
              </Text>
              <Text style={styles.comparisonPrev}>
                {formatMwh(data.prevYear.totalProductionMwh)}
              </Text>
              <Text
                style={[
                  styles.comparisonDiff,
                  data.prevYear.totalProductionMwh != null &&
                  data.totalProductionMwh >= data.prevYear.totalProductionMwh
                    ? styles.positiveValue
                    : styles.negativeValue,
                ]}
              >
                {formatDiffPercent(
                  data.totalProductionMwh,
                  data.prevYear.totalProductionMwh
                )}
              </Text>
            </View>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>Verfuegbarkeit</Text>
              <Text style={styles.comparisonCurrent}>
                {formatPercent1(data.avgAvailabilityPct)}
              </Text>
              <Text style={styles.comparisonPrev}>
                {formatPercent1(data.prevYear.avgAvailabilityPct)}
              </Text>
              <Text
                style={[
                  styles.comparisonDiff,
                  data.prevYear.avgAvailabilityPct != null &&
                  (data.avgAvailabilityPct ?? 0) >= data.prevYear.avgAvailabilityPct
                    ? styles.positiveValue
                    : styles.negativeValue,
                ]}
              >
                {formatDiffPercent(
                  data.avgAvailabilityPct,
                  data.prevYear.avgAvailabilityPct
                )}
              </Text>
            </View>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>Windgeschwindigkeit</Text>
              <Text style={styles.comparisonCurrent}>
                {data.avgWindSpeedMs != null
                  ? `${formatNumber(data.avgWindSpeedMs, 1)} m/s`
                  : "k.A."}
              </Text>
              <Text style={styles.comparisonPrev}>
                {data.prevYear.avgWindSpeedMs != null
                  ? `${formatNumber(data.prevYear.avgWindSpeedMs, 1)} m/s`
                  : "k.A."}
              </Text>
              <Text
                style={[
                  styles.comparisonDiff,
                  data.prevYear.avgWindSpeedMs != null &&
                  (data.avgWindSpeedMs ?? 0) >= data.prevYear.avgWindSpeedMs
                    ? styles.positiveValue
                    : styles.negativeValue,
                ]}
              >
                {formatDiffPercent(data.avgWindSpeedMs, data.prevYear.avgWindSpeedMs)}
              </Text>
            </View>
            {hasRevenue && data.prevYear.totalRevenueEur != null && (
              <View style={styles.comparisonRow}>
                <Text style={styles.comparisonLabel}>Erloese</Text>
                <Text style={styles.comparisonCurrent}>
                  {formatCurrency(data.totalRevenueEur!)}
                </Text>
                <Text style={styles.comparisonPrev}>
                  {formatCurrency(data.prevYear.totalRevenueEur)}
                </Text>
                <Text
                  style={[
                    styles.comparisonDiff,
                    data.totalRevenueEur! >= data.prevYear.totalRevenueEur
                      ? styles.positiveValue
                      : styles.negativeValue,
                  ]}
                >
                  {formatDiffPercent(
                    data.totalRevenueEur,
                    data.prevYear.totalRevenueEur
                  )}
                </Text>
              </View>
            )}
          </View>
        )}

        <Text style={styles.generatedAt}>
          Erstellt am {formatDate(new Date(data.generatedAt))}
        </Text>
      </PageWrapper>

      {/* ========== PAGE 3: MONATSVERLAUF ========== */}
      <PageWrapper
        letterhead={letterhead}
        layout={layout}
        template={template}
        companyName={data.operatorName ?? undefined}
      >
        <Text style={styles.sectionTitle}>Monatsverlauf {data.year}</Text>

        {data.monthlyTrend.length > 0 ? (
          <>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, styles.colMonth]}>Monat</Text>
                <Text style={[styles.tableHeaderText, styles.colMProd]}>Produktion</Text>
                <Text style={[styles.tableHeaderText, styles.colMWind]}>Wind (m/s)</Text>
                <Text style={[styles.tableHeaderText, styles.colMAvail]}>Verfueg. %</Text>
                <Text style={[styles.tableHeaderText, styles.colMHours]}>Betriebsstd.</Text>
                {hasRevenue && (
                  <Text style={[styles.tableHeaderText, styles.colMRevenue]}>Erloese</Text>
                )}
              </View>

              {data.monthlyTrend.map((m, index) => (
                <View
                  key={m.month}
                  style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
                >
                  <Text style={[styles.tableCell, styles.colMonth]}>
                    {MONTH_NAMES[m.month - 1]}
                  </Text>
                  <Text style={[styles.tableCellRight, styles.colMProd]}>
                    {formatNumber(m.productionMwh, 2)} MWh
                  </Text>
                  <Text style={[styles.tableCellRight, styles.colMWind]}>
                    {m.avgWindSpeedMs != null ? formatNumber(m.avgWindSpeedMs, 1) : "k.A."}
                  </Text>
                  <Text style={[styles.tableCellRight, styles.colMAvail]}>
                    {formatPercent1(m.avgAvailabilityPct)}
                  </Text>
                  <Text style={[styles.tableCellRight, styles.colMHours]}>
                    {m.operatingHours != null ? `${formatNumber(m.operatingHours, 0)} h` : "k.A."}
                  </Text>
                  {hasRevenue && (
                    <Text style={[styles.tableCellRight, styles.colMRevenue]}>
                      {m.revenueEur != null ? formatCurrency(m.revenueEur) : "k.A."}
                    </Text>
                  )}
                </View>
              ))}

              {/* Totals/averages */}
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryText, styles.colMonth]}>GESAMT</Text>
                <Text style={[styles.summaryTextRight, styles.colMProd]}>
                  {formatNumber(data.totalProductionMwh, 2)} MWh
                </Text>
                <Text style={[styles.summaryTextRight, styles.colMWind]}>
                  {data.avgWindSpeedMs != null
                    ? `${formatNumber(data.avgWindSpeedMs, 1)} m/s`
                    : "k.A."}
                </Text>
                <Text style={[styles.summaryTextRight, styles.colMAvail]}>
                  {formatPercent1(data.avgAvailabilityPct)}
                </Text>
                <Text style={[styles.summaryTextRight, styles.colMHours]}>
                  {data.totalOperatingHours != null
                    ? `${formatNumber(data.totalOperatingHours, 0)} h`
                    : "k.A."}
                </Text>
                {hasRevenue && (
                  <Text style={[styles.summaryTextRight, styles.colMRevenue]}>
                    {data.totalRevenueEur != null
                      ? formatCurrency(data.totalRevenueEur)
                      : "k.A."}
                  </Text>
                )}
              </View>
            </View>

            {/* Monthly bar chart */}
            <MonthlyProductionChart data={data.monthlyTrend} />
          </>
        ) : (
          <Text style={styles.noData}>
            Keine Monatsdaten fuer dieses Jahr vorhanden.
          </Text>
        )}
      </PageWrapper>

      {/* ========== PAGE 4: ANLAGEN-PERFORMANCE ========== */}
      <PageWrapper
        letterhead={letterhead}
        layout={layout}
        template={template}
        companyName={data.operatorName ?? undefined}
      >
        <Text style={styles.sectionTitle}>Anlagen-Performance {data.year}</Text>

        {data.turbinePerformance.length > 0 ? (
          <>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, styles.colTurbine]}>Anlage</Text>
                <Text style={[styles.tableHeaderText, styles.colTProd]}>Produktion</Text>
                <Text style={[styles.tableHeaderText, styles.colTHours]}>Betr.Std.</Text>
                <Text style={[styles.tableHeaderText, styles.colTAvail]}>Verfueg. %</Text>
                <Text style={[styles.tableHeaderText, styles.colTCf]}>CF %</Text>
                <Text style={[styles.tableHeaderText, styles.colTRated]}>Nennleistung</Text>
                <Text style={[styles.tableHeaderText, styles.colTYield]}>Sp. Yield</Text>
              </View>

              {data.turbinePerformance.map((t, index) => (
                <View
                  key={t.turbineId}
                  style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
                >
                  <Text style={[styles.tableCell, styles.colTurbine]}>{t.designation}</Text>
                  <Text style={[styles.tableCellRight, styles.colTProd]}>
                    {formatNumber(t.totalProductionMwh, 1)} MWh
                  </Text>
                  <Text style={[styles.tableCellRight, styles.colTHours]}>
                    {t.totalOperatingHours != null
                      ? `${formatNumber(t.totalOperatingHours, 0)} h`
                      : "k.A."}
                  </Text>
                  <Text style={[styles.tableCellRight, styles.colTAvail]}>
                    {formatPercent1(t.avgAvailabilityPct)}
                  </Text>
                  <Text style={[styles.tableCellRight, styles.colTCf]}>
                    {formatPercent1(t.capacityFactor)}
                  </Text>
                  <Text style={[styles.tableCellRight, styles.colTRated]}>
                    {t.ratedPowerKw != null
                      ? `${formatNumber(t.ratedPowerKw, 0)} kW`
                      : "k.A."}
                  </Text>
                  <Text style={[styles.tableCellRight, styles.colTYield]}>
                    {t.specificYield != null
                      ? `${formatNumber(t.specificYield, 0)} kWh/kW`
                      : "k.A."}
                  </Text>
                </View>
              ))}

              {/* Totals */}
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryText, styles.colTurbine]}>PARK</Text>
                <Text style={[styles.summaryTextRight, styles.colTProd]}>
                  {formatNumber(data.totalProductionMwh, 1)} MWh
                </Text>
                <Text style={[styles.summaryTextRight, styles.colTHours]}>
                  {data.totalOperatingHours != null
                    ? `${formatNumber(data.totalOperatingHours, 0)} h`
                    : "k.A."}
                </Text>
                <Text style={[styles.summaryTextRight, styles.colTAvail]}>
                  {formatPercent1(data.avgAvailabilityPct)}
                </Text>
                <Text style={[styles.summaryTextRight, styles.colTCf]}>-</Text>
                <Text style={[styles.summaryTextRight, styles.colTRated]}>-</Text>
                <Text style={[styles.summaryTextRight, styles.colTYield]}>
                  {data.specificYieldKwhPerKw != null
                    ? `${formatNumber(data.specificYieldKwhPerKw, 0)} kWh/kW`
                    : "k.A."}
                </Text>
              </View>
            </View>

            {/* Best/worst turbines */}
            {(data.bestTurbine || data.worstTurbine) && (
              <View style={styles.highlightBox}>
                {data.bestTurbine && (
                  <View style={[styles.highlightItem, { borderLeftColor: COLORS.accent }]}>
                    <Text style={styles.highlightLabel}>Beste Anlage</Text>
                    <Text style={styles.highlightValue}>
                      {data.bestTurbine.designation} -{" "}
                      {formatNumber(data.bestTurbine.productionMwh, 1)} MWh
                    </Text>
                  </View>
                )}
                {data.worstTurbine && (
                  <View style={[styles.highlightItem, { borderLeftColor: COLORS.warning }]}>
                    <Text style={styles.highlightLabel}>Schwachste Anlage</Text>
                    <Text style={styles.highlightValue}>
                      {data.worstTurbine.designation} -{" "}
                      {formatNumber(data.worstTurbine.productionMwh, 1)} MWh
                    </Text>
                  </View>
                )}
              </View>
            )}
          </>
        ) : (
          <Text style={styles.noData}>
            Keine Anlagen-Performance-Daten fuer dieses Jahr vorhanden.
          </Text>
        )}
      </PageWrapper>

      {/* ========== PAGE 5: FINANZEN (optional) ========== */}
      {hasFinancialData && hasRevenue && (
        <PageWrapper
          letterhead={letterhead}
          layout={layout}
          template={template}
          companyName={data.operatorName ?? undefined}
        >
          <Text style={styles.sectionTitle}>Finanzen {data.year}</Text>

          {/* Revenue KPIs */}
          <View style={styles.kpiRow}>
            <View style={[styles.kpiCard, styles.kpiCardAccent]}>
              <Text style={styles.kpiLabel}>Gesamterloese</Text>
              <Text style={styles.kpiValue}>{formatCurrency(data.totalRevenueEur!)}</Text>
              <Text style={styles.kpiUnit}>EUR</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Erloese pro kWh</Text>
              <Text style={styles.kpiValue}>
                {data.avgRevenuePerKwh != null
                  ? `${formatNumber(data.avgRevenuePerKwh * 100, 2)} ct`
                  : "k.A."}
              </Text>
              <Text style={styles.kpiUnit}>ct/kWh</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Produktion</Text>
              <Text style={styles.kpiValue}>
                {formatNumber(data.totalProductionMwh, 1)}
              </Text>
              <Text style={styles.kpiUnit}>MWh</Text>
            </View>
          </View>

          {/* Revenue per month table */}
          <Text style={styles.subSectionTitle}>Monatliche Erloese</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colFMonth]}>Monat</Text>
              <Text style={[styles.tableHeaderText, styles.colFRevenue]}>Erloese (EUR)</Text>
              <Text style={[styles.tableHeaderText, styles.colFProduction]}>
                Produktion (MWh)
              </Text>
              <Text style={[styles.tableHeaderText, styles.colFRevPerKwh]}>ct/kWh</Text>
              <Text style={[styles.tableHeaderText, styles.colFCumulative]}>
                Kumul. Erloese
              </Text>
            </View>

            {(() => {
              let cumulative = 0;
              return data.monthlyTrend.map((m, index) => {
                cumulative += m.revenueEur ?? 0;
                const ctPerKwh =
                  m.revenueEur != null && m.productionMwh > 0
                    ? (m.revenueEur / (m.productionMwh * 1000)) * 100
                    : null;
                return (
                  <View
                    key={m.month}
                    style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
                  >
                    <Text style={[styles.tableCell, styles.colFMonth]}>
                      {MONTH_NAMES[m.month - 1]}
                    </Text>
                    <Text style={[styles.tableCellRight, styles.colFRevenue]}>
                      {m.revenueEur != null ? formatCurrency(m.revenueEur) : "k.A."}
                    </Text>
                    <Text style={[styles.tableCellRight, styles.colFProduction]}>
                      {formatNumber(m.productionMwh, 2)}
                    </Text>
                    <Text style={[styles.tableCellRight, styles.colFRevPerKwh]}>
                      {ctPerKwh != null ? `${formatNumber(ctPerKwh, 2)} ct` : "k.A."}
                    </Text>
                    <Text style={[styles.tableCellRight, styles.colFCumulative]}>
                      {formatCurrency(cumulative)}
                    </Text>
                  </View>
                );
              });
            })()}

            <View style={styles.summaryRow}>
              <Text style={[styles.summaryText, styles.colFMonth]}>GESAMT</Text>
              <Text style={[styles.summaryTextRight, styles.colFRevenue]}>
                {formatCurrency(data.totalRevenueEur!)}
              </Text>
              <Text style={[styles.summaryTextRight, styles.colFProduction]}>
                {formatNumber(data.totalProductionMwh, 2)}
              </Text>
              <Text style={[styles.summaryTextRight, styles.colFRevPerKwh]}>
                {data.avgRevenuePerKwh != null
                  ? `${formatNumber(data.avgRevenuePerKwh * 100, 2)} ct`
                  : "k.A."}
              </Text>
              <Text style={[styles.summaryTextRight, styles.colFCumulative]}>
                {formatCurrency(data.totalRevenueEur!)}
              </Text>
            </View>
          </View>
        </PageWrapper>
      )}

      {/* ========== PAGE 6: SERVICE & WARTUNG ========== */}
      <PageWrapper
        letterhead={letterhead}
        layout={layout}
        template={template}
        companyName={data.operatorName ?? undefined}
      >
        <Text style={styles.sectionTitle}>Service & Wartung {data.year}</Text>

        {hasServiceData ? (
          <>
            {/* Overview KPIs */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Ereignisse gesamt</Text>
                <Text style={styles.kpiValue}>{data.totalServiceEvents}</Text>
              </View>
              <View style={[styles.kpiCard, styles.kpiCardWarning]}>
                <Text style={styles.kpiLabel}>Ausfallzeit gesamt</Text>
                <Text style={styles.kpiValue}>
                  {formatNumber(data.totalServiceDurationHours, 0)}
                </Text>
                <Text style={styles.kpiUnit}>h</Text>
              </View>
              {data.totalServiceCost != null && (
                <View style={[styles.kpiCard, styles.kpiCardAccent]}>
                  <Text style={styles.kpiLabel}>Kosten gesamt</Text>
                  <Text style={styles.kpiValue}>
                    {formatCurrency(data.totalServiceCost)}
                  </Text>
                  <Text style={styles.kpiUnit}>EUR</Text>
                </View>
              )}
            </View>

            {/* Summary by type */}
            {data.serviceEventSummary.length > 0 && (
              <>
                <Text style={styles.subSectionTitle}>Zusammenfassung nach Ereignistyp</Text>
                <View style={styles.table}>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeaderText, styles.colSType]}>Typ</Text>
                    <Text style={[styles.tableHeaderText, styles.colSCount]}>Anzahl</Text>
                    <Text style={[styles.tableHeaderText, styles.colSDuration]}>Dauer (h)</Text>
                    {data.totalServiceCost != null && (
                      <Text style={[styles.tableHeaderText, styles.colSCost]}>Kosten</Text>
                    )}
                    <Text style={[styles.tableHeaderText, styles.colSPct]}>Anteil</Text>
                  </View>

                  {data.serviceEventSummary.map((s, index) => (
                    <View
                      key={s.eventType}
                      style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
                    >
                      <Text style={[styles.tableCell, styles.colSType]}>
                        {s.eventTypeLabel}
                      </Text>
                      <Text style={[styles.tableCellRight, styles.colSCount]}>{s.count}</Text>
                      <Text style={[styles.tableCellRight, styles.colSDuration]}>
                        {formatNumber(s.totalDurationHours, 1)} h
                      </Text>
                      {data.totalServiceCost != null && (
                        <Text style={[styles.tableCellRight, styles.colSCost]}>
                          {s.totalCost != null ? formatCurrency(s.totalCost) : "-"}
                        </Text>
                      )}
                      <Text style={[styles.tableCellRight, styles.colSPct]}>
                        {formatPercent1(s.percentageOfTotal)}
                      </Text>
                    </View>
                  ))}

                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryText, styles.colSType]}>GESAMT</Text>
                    <Text style={[styles.summaryTextRight, styles.colSCount]}>
                      {data.totalServiceEvents}
                    </Text>
                    <Text style={[styles.summaryTextRight, styles.colSDuration]}>
                      {formatNumber(data.totalServiceDurationHours, 1)} h
                    </Text>
                    {data.totalServiceCost != null && (
                      <Text style={[styles.summaryTextRight, styles.colSCost]}>
                        {formatCurrency(data.totalServiceCost)}
                      </Text>
                    )}
                    <Text style={[styles.summaryTextRight, styles.colSPct]}>100,0 %</Text>
                  </View>
                </View>
              </>
            )}

            {/* Notable events */}
            {data.notableEvents.length > 0 && (
              <>
                <Text style={styles.subSectionTitle}>Besondere Ereignisse</Text>
                <View style={styles.table}>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeaderText, styles.colEvDate]}>Datum</Text>
                    <Text style={[styles.tableHeaderText, styles.colEvType]}>Typ</Text>
                    <Text style={[styles.tableHeaderText, styles.colEvTurbine]}>Anlage</Text>
                    <Text style={[styles.tableHeaderText, styles.colEvDesc]}>
                      Beschreibung
                    </Text>
                    <Text style={[styles.tableHeaderText, styles.colEvDuration]}>Dauer</Text>
                  </View>

                  {data.notableEvents.map((event, index) => (
                    <View
                      key={event.id}
                      style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
                    >
                      <Text style={[styles.tableCell, styles.colEvDate]}>
                        {formatDate(event.eventDate)}
                      </Text>
                      <Text style={[styles.tableCell, styles.colEvType]}>
                        {translateEventType(event.eventType)}
                      </Text>
                      <Text style={[styles.tableCell, styles.colEvTurbine]}>
                        {event.turbineDesignation}
                      </Text>
                      <Text style={[styles.tableCell, styles.colEvDesc]}>
                        {event.description || "-"}
                      </Text>
                      <Text style={[styles.tableCellRight, styles.colEvDuration]}>
                        {event.durationHours != null
                          ? `${formatNumber(event.durationHours, 1)} h`
                          : "-"}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        ) : (
          <View style={styles.infoBox}>
            <Text style={{ fontSize: 10, textAlign: "center", color: COLORS.muted }}>
              Keine Service-Ereignisse im Berichtsjahr erfasst.
            </Text>
          </View>
        )}

        <Text style={styles.generatedAt}>
          Erstellt am {formatDate(new Date(data.generatedAt))}
        </Text>
      </PageWrapper>
    </Document>
  );
}
