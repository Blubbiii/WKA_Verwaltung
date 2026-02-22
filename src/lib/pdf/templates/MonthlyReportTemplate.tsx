/**
 * Monthly Report (Monatsbericht) PDF Template
 *
 * Generates a multi-page monthly report for a wind park containing:
 * - Page 1: Summary with KPIs and year-over-year comparison
 * - Page 2: Production per turbine table with bar chart
 * - Page 3: Availability per turbine
 * - Page 4: Service events
 */

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ResolvedLetterhead, ResolvedTemplate } from "../utils/templateResolver";
import { Header } from "./components/Header";
import { Footer, PageNumber } from "./components/Footer";
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

  // Title
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

  // KPI Cards
  kpiRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
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

  // Comparison box
  comparisonBox: {
    backgroundColor: COLORS.light,
    padding: 15,
    borderRadius: 3,
    marginBottom: 20,
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
    width: 100,
    textAlign: "right",
  },
  comparisonPrev: {
    fontSize: 9,
    color: COLORS.muted,
    width: 100,
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
    marginTop: 10,
    marginBottom: 15,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 5,
  },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: "bold",
    color: COLORS.white,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  tableRowAlt: {
    backgroundColor: "#FAFAFA",
  },
  tableCell: {
    fontSize: 8,
  },
  tableCellRight: {
    fontSize: 8,
    textAlign: "right",
  },
  summaryRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 5,
    backgroundColor: COLORS.primary,
    marginTop: 2,
  },
  summaryText: {
    fontSize: 9,
    fontWeight: "bold",
    color: COLORS.white,
  },
  summaryTextRight: {
    fontSize: 9,
    fontWeight: "bold",
    color: COLORS.white,
    textAlign: "right",
  },

  // Column widths - Production table
  colTurbine: { width: "20%" },
  colProduction: { width: "20%", textAlign: "right" },
  colHours: { width: "20%", textAlign: "right" },
  colAvailability: { width: "20%", textAlign: "right" },
  colCf: { width: "20%", textAlign: "right" },

  // Column widths - Availability table
  colAvTurbine: { width: "14%" },
  colAvT1: { width: "12%", textAlign: "right" },
  colAvT2: { width: "12%", textAlign: "right" },
  colAvT3: { width: "12%", textAlign: "right" },
  colAvT4: { width: "12%", textAlign: "right" },
  colAvT5: { width: "12%", textAlign: "right" },
  colAvT6: { width: "12%", textAlign: "right" },
  colAvPct: { width: "14%", textAlign: "right" },

  // Column widths - Events table
  colEvDate: { width: "15%" },
  colEvType: { width: "15%" },
  colEvTurbine: { width: "15%" },
  colEvDesc: { width: "40%" },
  colEvDuration: { width: "15%", textAlign: "right" },

  // Bar chart
  chartContainer: {
    marginTop: 15,
    marginBottom: 10,
    paddingTop: 10,
  },
  chartTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 10,
  },
  chartBarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  chartLabel: {
    width: 60,
    fontSize: 7,
    color: COLORS.muted,
  },
  chartBarContainer: {
    flex: 1,
    height: 14,
    backgroundColor: "#E8E8E8",
    borderRadius: 2,
    overflow: "hidden",
  },
  chartBar: {
    height: 14,
    borderRadius: 2,
  },
  chartValue: {
    width: 55,
    fontSize: 7,
    textAlign: "right",
    color: COLORS.muted,
    paddingLeft: 5,
  },

  // Info box
  infoBox: {
    backgroundColor: COLORS.light,
    padding: 15,
    borderRadius: 3,
    marginBottom: 15,
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 9,
    color: COLORS.muted,
    width: 150,
  },
  infoValue: {
    fontSize: 9,
    fontWeight: "bold",
  },

  // No data
  noData: {
    padding: 30,
    textAlign: "center",
    color: COLORS.muted,
    fontSize: 10,
    fontStyle: "italic",
  },

  // Status indicators
  positiveValue: { color: "#16A34A" },
  negativeValue: { color: COLORS.danger },

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

export interface TurbineProductionRow {
  turbineId: string;
  designation: string;
  productionMwh: number;
  operatingHours: number | null;
  availabilityPct: number | null;
  capacityFactor: number | null; // CF% = production / (ratedPower * hours in month)
  ratedPowerKw: number | null;
}

export interface TurbineAvailabilityRow {
  turbineId: string;
  designation: string;
  t1Hours: number; // Production time
  t2Hours: number; // Waiting for wind
  t3Hours: number; // Environmental stop
  t4Hours: number; // Routine maintenance
  t5Hours: number; // Equipment failure
  t6Hours: number; // Other downtime
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

export interface MonthlyReportData {
  // Park info
  parkName: string;
  parkAddress: string | null;
  fundName: string | null;
  operatorName: string | null;

  // Period
  year: number;
  month: number; // 1-12
  monthName: string;

  // KPIs
  totalProductionMwh: number;
  avgAvailabilityPct: number | null;
  avgWindSpeedMs: number | null;
  specificYieldKwhPerKw: number | null;
  totalRevenueEur: number | null;

  // Previous year comparison
  prevYearProductionMwh: number | null;
  prevYearAvailabilityPct: number | null;
  prevYearWindSpeedMs: number | null;
  prevYearRevenueEur: number | null;

  // Per-turbine data
  turbineProduction: TurbineProductionRow[];
  turbineAvailability: TurbineAvailabilityRow[];

  // Events
  serviceEvents: ServiceEventRow[];

  // Notable downtimes
  notableDowntimes: string[];

  // Generated timestamp
  generatedAt: string;
}

interface MonthlyReportTemplateProps {
  data: MonthlyReportData;
  template: ResolvedTemplate;
  letterhead: ResolvedLetterhead;
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function formatPercent1(value: number | null | undefined): string {
  if (value == null) return "k.A.";
  return `${formatNumber(value, 1)} %`;
}

function formatMwh(value: number | null | undefined): string {
  if (value == null) return "k.A.";
  return `${formatNumber(value, 2)} MWh`;
}

function formatHours(value: number | null | undefined): string {
  if (value == null) return "k.A.";
  return `${formatNumber(value, 0)} h`;
}

function formatWindSpeed(value: number | null | undefined): string {
  if (value == null) return "k.A.";
  return `${formatNumber(value, 1)} m/s`;
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

/**
 * Simple horizontal bar chart using @react-pdf/renderer primitives
 */
function ProductionBarChart({
  turbines,
}: {
  turbines: TurbineProductionRow[];
}) {
  if (turbines.length === 0) return null;
  const maxProduction = Math.max(...turbines.map((t) => t.productionMwh), 1);

  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartTitle}>Produktion nach Anlage (MWh)</Text>
      {turbines.map((t) => {
        const barWidth = Math.max((t.productionMwh / maxProduction) * 100, 1);
        return (
          <View key={t.turbineId} style={styles.chartBarRow}>
            <Text style={styles.chartLabel}>{t.designation}</Text>
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
            <Text style={styles.chartValue}>{formatNumber(t.productionMwh, 1)} MWh</Text>
          </View>
        );
      })}
    </View>
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
  const hasPrevYear =
    data.prevYearProductionMwh != null || data.prevYearAvailabilityPct != null;
  const hasRevenue = data.totalRevenueEur != null;
  const hasAvailabilityData = data.turbineAvailability.length > 0;
  const hasEvents = data.serviceEvents.length > 0;

  // Calculate park totals from turbine data
  const totalHours = data.turbineProduction.reduce(
    (sum, t) => sum + (t.operatingHours ?? 0),
    0
  );

  return (
    <Document>
      {/* ========== PAGE 1: ZUSAMMENFASSUNG ========== */}
      <PageWrapper
        letterhead={letterhead}
        layout={layout}
        template={template}
        companyName={data.operatorName ?? undefined}
      >
        {/* Title */}
        <Text style={styles.title}>
          Monatsbericht {data.monthName} {data.year}
        </Text>
        <Text style={styles.subtitle}>{data.parkName}</Text>

        {/* Park info */}
        <View style={styles.infoBox}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Windpark:</Text>
            <Text style={styles.infoValue}>{data.parkName}</Text>
          </View>
          {data.parkAddress && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Standort:</Text>
              <Text style={styles.infoValue}>{data.parkAddress}</Text>
            </View>
          )}
          {data.fundName && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Gesellschaft:</Text>
              <Text style={styles.infoValue}>{data.fundName}</Text>
            </View>
          )}
          {data.operatorName && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Betreiber:</Text>
              <Text style={styles.infoValue}>{data.operatorName}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Berichtszeitraum:</Text>
            <Text style={styles.infoValue}>
              {data.monthName} {data.year}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Anzahl Anlagen:</Text>
            <Text style={styles.infoValue}>{data.turbineProduction.length}</Text>
          </View>
        </View>

        {/* KPI Summary */}
        <Text style={styles.sectionTitle}>Kennzahlen</Text>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Gesamtproduktion</Text>
            <Text style={styles.kpiValue}>{formatNumber(data.totalProductionMwh, 1)}</Text>
            <Text style={styles.kpiUnit}>MWh</Text>
          </View>
          <View style={[styles.kpiCard, styles.kpiCardAccent]}>
            <Text style={styles.kpiLabel}>Verfuegbarkeit</Text>
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
              <Text style={styles.kpiLabel}>Erloese</Text>
              <Text style={styles.kpiValue}>
                {formatCurrency(data.totalRevenueEur!)}
              </Text>
              <Text style={styles.kpiUnit}>EUR</Text>
            </View>
          )}
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Betriebsstunden gesamt</Text>
            <Text style={styles.kpiValue}>{formatNumber(totalHours, 0)}</Text>
            <Text style={styles.kpiUnit}>h</Text>
          </View>
        </View>

        {/* Year-over-year comparison */}
        {hasPrevYear && (
          <View style={styles.comparisonBox}>
            <Text style={styles.comparisonTitle}>
              Vergleich Vorjahresmonat ({data.monthName} {data.year - 1})
            </Text>
            <View style={styles.comparisonHeader}>
              <Text style={[styles.comparisonHeaderText, { width: 180 }]}>Kennzahl</Text>
              <Text style={[styles.comparisonHeaderText, { width: 100, textAlign: "right" }]}>
                Aktuell
              </Text>
              <Text style={[styles.comparisonHeaderText, { width: 100, textAlign: "right" }]}>
                Vorjahr
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
                {formatMwh(data.prevYearProductionMwh)}
              </Text>
              <Text
                style={[
                  styles.comparisonDiff,
                  data.prevYearProductionMwh != null &&
                  data.totalProductionMwh >= data.prevYearProductionMwh
                    ? styles.positiveValue
                    : styles.negativeValue,
                ]}
              >
                {formatDiffPercent(data.totalProductionMwh, data.prevYearProductionMwh)}
              </Text>
            </View>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>Verfuegbarkeit</Text>
              <Text style={styles.comparisonCurrent}>
                {formatPercent1(data.avgAvailabilityPct)}
              </Text>
              <Text style={styles.comparisonPrev}>
                {formatPercent1(data.prevYearAvailabilityPct)}
              </Text>
              <Text
                style={[
                  styles.comparisonDiff,
                  data.prevYearAvailabilityPct != null &&
                  (data.avgAvailabilityPct ?? 0) >= data.prevYearAvailabilityPct
                    ? styles.positiveValue
                    : styles.negativeValue,
                ]}
              >
                {formatDiffPercent(data.avgAvailabilityPct, data.prevYearAvailabilityPct)}
              </Text>
            </View>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>Windgeschwindigkeit</Text>
              <Text style={styles.comparisonCurrent}>
                {formatWindSpeed(data.avgWindSpeedMs)}
              </Text>
              <Text style={styles.comparisonPrev}>
                {formatWindSpeed(data.prevYearWindSpeedMs)}
              </Text>
              <Text
                style={[
                  styles.comparisonDiff,
                  data.prevYearWindSpeedMs != null &&
                  (data.avgWindSpeedMs ?? 0) >= data.prevYearWindSpeedMs
                    ? styles.positiveValue
                    : styles.negativeValue,
                ]}
              >
                {formatDiffPercent(data.avgWindSpeedMs, data.prevYearWindSpeedMs)}
              </Text>
            </View>
            {hasRevenue && data.prevYearRevenueEur != null && (
              <View style={styles.comparisonRow}>
                <Text style={styles.comparisonLabel}>Erloese</Text>
                <Text style={styles.comparisonCurrent}>
                  {formatCurrency(data.totalRevenueEur!)}
                </Text>
                <Text style={styles.comparisonPrev}>
                  {formatCurrency(data.prevYearRevenueEur)}
                </Text>
                <Text
                  style={[
                    styles.comparisonDiff,
                    data.totalRevenueEur! >= data.prevYearRevenueEur
                      ? styles.positiveValue
                      : styles.negativeValue,
                  ]}
                >
                  {formatDiffPercent(data.totalRevenueEur, data.prevYearRevenueEur)}
                </Text>
              </View>
            )}
          </View>
        )}

        <Text style={styles.generatedAt}>
          Erstellt am {formatDate(new Date(data.generatedAt))}
        </Text>
      </PageWrapper>

      {/* ========== PAGE 2: PRODUKTION ========== */}
      <PageWrapper
        letterhead={letterhead}
        layout={layout}
        template={template}
        companyName={data.operatorName ?? undefined}
      >
        <Text style={styles.sectionTitle}>
          Produktion - {data.monthName} {data.year}
        </Text>

        {data.turbineProduction.length > 0 ? (
          <>
            {/* Production table */}
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, styles.colTurbine]}>Anlage</Text>
                <Text style={[styles.tableHeaderText, styles.colProduction]}>Produktion</Text>
                <Text style={[styles.tableHeaderText, styles.colHours]}>Betriebsstd.</Text>
                <Text style={[styles.tableHeaderText, styles.colAvailability]}>
                  Verfuegbarkeit
                </Text>
                <Text style={[styles.tableHeaderText, styles.colCf]}>CF %</Text>
              </View>

              {data.turbineProduction.map((t, index) => (
                <View
                  key={t.turbineId}
                  style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
                >
                  <Text style={[styles.tableCell, styles.colTurbine]}>{t.designation}</Text>
                  <Text style={[styles.tableCellRight, styles.colProduction]}>
                    {formatNumber(t.productionMwh, 2)} MWh
                  </Text>
                  <Text style={[styles.tableCellRight, styles.colHours]}>
                    {formatHours(t.operatingHours)}
                  </Text>
                  <Text style={[styles.tableCellRight, styles.colAvailability]}>
                    {formatPercent1(t.availabilityPct)}
                  </Text>
                  <Text style={[styles.tableCellRight, styles.colCf]}>
                    {formatPercent1(t.capacityFactor)}
                  </Text>
                </View>
              ))}

              {/* Totals row */}
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryText, styles.colTurbine]}>GESAMT</Text>
                <Text style={[styles.summaryTextRight, styles.colProduction]}>
                  {formatNumber(data.totalProductionMwh, 2)} MWh
                </Text>
                <Text style={[styles.summaryTextRight, styles.colHours]}>
                  {formatHours(totalHours)}
                </Text>
                <Text style={[styles.summaryTextRight, styles.colAvailability]}>
                  {formatPercent1(data.avgAvailabilityPct)}
                </Text>
                <Text style={[styles.summaryTextRight, styles.colCf]}>-</Text>
              </View>
            </View>

            {/* Bar chart */}
            <ProductionBarChart turbines={data.turbineProduction} />
          </>
        ) : (
          <Text style={styles.noData}>
            Keine Produktionsdaten fuer diesen Monat vorhanden.
          </Text>
        )}
      </PageWrapper>

      {/* ========== PAGE 3: VERFUEGBARKEIT ========== */}
      {hasAvailabilityData && (
        <PageWrapper
          letterhead={letterhead}
          layout={layout}
          template={template}
          companyName={data.operatorName ?? undefined}
        >
          <Text style={styles.sectionTitle}>
            Verfuegbarkeit - {data.monthName} {data.year}
          </Text>

          {/* Availability table */}
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colAvTurbine]}>Anlage</Text>
              <Text style={[styles.tableHeaderText, styles.colAvT1]}>T1 (Prod.)</Text>
              <Text style={[styles.tableHeaderText, styles.colAvT2]}>T2 (Wind)</Text>
              <Text style={[styles.tableHeaderText, styles.colAvT3]}>T3 (Umwelt)</Text>
              <Text style={[styles.tableHeaderText, styles.colAvT4]}>T4 (Wartung)</Text>
              <Text style={[styles.tableHeaderText, styles.colAvT5]}>T5 (Stoerung)</Text>
              <Text style={[styles.tableHeaderText, styles.colAvT6]}>T6 (Sonstige)</Text>
              <Text style={[styles.tableHeaderText, styles.colAvPct]}>Verfueg. %</Text>
            </View>

            {data.turbineAvailability.map((t, index) => (
              <View
                key={t.turbineId}
                style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
              >
                <Text style={[styles.tableCell, styles.colAvTurbine]}>{t.designation}</Text>
                <Text style={[styles.tableCellRight, styles.colAvT1]}>
                  {formatNumber(t.t1Hours, 0)} h
                </Text>
                <Text style={[styles.tableCellRight, styles.colAvT2]}>
                  {formatNumber(t.t2Hours, 0)} h
                </Text>
                <Text style={[styles.tableCellRight, styles.colAvT3]}>
                  {formatNumber(t.t3Hours, 0)} h
                </Text>
                <Text style={[styles.tableCellRight, styles.colAvT4]}>
                  {formatNumber(t.t4Hours, 0)} h
                </Text>
                <Text style={[styles.tableCellRight, styles.colAvT5]}>
                  {formatNumber(t.t5Hours, 0)} h
                </Text>
                <Text style={[styles.tableCellRight, styles.colAvT6]}>
                  {formatNumber(t.t6Hours, 0)} h
                </Text>
                <Text
                  style={[
                    styles.tableCellRight,
                    styles.colAvPct,
                    {
                      fontWeight: "bold",
                      color:
                        t.availabilityPct != null && t.availabilityPct < 90
                          ? COLORS.danger
                          : t.availabilityPct != null && t.availabilityPct >= 97
                          ? "#16A34A"
                          : COLORS.text,
                    },
                  ]}
                >
                  {formatPercent1(t.availabilityPct)}
                </Text>
              </View>
            ))}

            {/* Park average */}
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryText, styles.colAvTurbine]}>PARK</Text>
              <Text style={[styles.summaryTextRight, styles.colAvT1]}>
                {formatNumber(
                  data.turbineAvailability.reduce((s, t) => s + t.t1Hours, 0) /
                    Math.max(data.turbineAvailability.length, 1),
                  0
                )} h
              </Text>
              <Text style={[styles.summaryTextRight, styles.colAvT2]}>
                {formatNumber(
                  data.turbineAvailability.reduce((s, t) => s + t.t2Hours, 0) /
                    Math.max(data.turbineAvailability.length, 1),
                  0
                )} h
              </Text>
              <Text style={[styles.summaryTextRight, styles.colAvT3]}>-</Text>
              <Text style={[styles.summaryTextRight, styles.colAvT4]}>-</Text>
              <Text style={[styles.summaryTextRight, styles.colAvT5]}>-</Text>
              <Text style={[styles.summaryTextRight, styles.colAvT6]}>-</Text>
              <Text style={[styles.summaryTextRight, styles.colAvPct]}>
                {formatPercent1(data.avgAvailabilityPct)}
              </Text>
            </View>
          </View>

          {/* Notable downtimes */}
          {data.notableDowntimes.length > 0 && (
            <View style={styles.comparisonBox}>
              <Text style={styles.comparisonTitle}>Besondere Vorkommnisse</Text>
              {data.notableDowntimes.map((note, i) => (
                <Text key={i} style={{ fontSize: 9, color: COLORS.muted, marginBottom: 3 }}>
                  {"\u2022"} {note}
                </Text>
              ))}
            </View>
          )}
        </PageWrapper>
      )}

      {/* ========== PAGE 4: EREIGNISSE ========== */}
      <PageWrapper
        letterhead={letterhead}
        layout={layout}
        template={template}
        companyName={data.operatorName ?? undefined}
      >
        <Text style={styles.sectionTitle}>
          Ereignisse - {data.monthName} {data.year}
        </Text>

        {hasEvents ? (
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colEvDate]}>Datum</Text>
              <Text style={[styles.tableHeaderText, styles.colEvType]}>Typ</Text>
              <Text style={[styles.tableHeaderText, styles.colEvTurbine]}>Anlage</Text>
              <Text style={[styles.tableHeaderText, styles.colEvDesc]}>Beschreibung</Text>
              <Text style={[styles.tableHeaderText, styles.colEvDuration]}>Dauer</Text>
            </View>

            {data.serviceEvents.map((event, index) => (
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

            {/* Summary row */}
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryText, { width: "70%" }]}>
                Gesamt: {data.serviceEvents.length} Ereignisse
              </Text>
              <Text style={[styles.summaryTextRight, { width: "30%" }]}>
                {formatNumber(
                  data.serviceEvents.reduce((s, e) => s + (e.durationHours ?? 0), 0),
                  1
                )}{" "}
                h
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.infoBox}>
            <Text style={{ fontSize: 10, textAlign: "center", color: COLORS.muted }}>
              Keine besonderen Ereignisse im Berichtszeitraum.
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
