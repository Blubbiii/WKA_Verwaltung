/**
 * Investor Quarterly Report PDF Template
 *
 * A simplified, investor-focused quarterly report showing:
 * - KPI summary (production, availability, revenue, wind speed)
 * - Monthly production breakdown
 * - Monthly revenue breakdown
 * - Performance assessment with YoY comparison
 */

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

// ============================================================
// DATA INTERFACE
// ============================================================

export interface InvestorQuarterlyData {
  fundName: string;
  parkName: string;
  quarter: number; // 1-4
  year: number;
  // KPIs
  totalProductionMwh: number;
  avgAvailabilityPct: number;
  totalRevenueEur: number;
  avgWindSpeedMs: number | null;
  capacityFactor: number;
  // Monthly breakdown
  months: {
    name: string;
    productionMwh: number;
    availabilityPct: number | null;
    windSpeedMs: number | null;
    revenueEur: number | null;
  }[];
  // Revenue breakdown per month
  monthlyRevenue?: {
    name: string;
    eegRevenueEur: number | null;
    dvRevenueEur: number | null;
    totalRevenueEur: number | null;
  }[];
  // YoY comparison
  prevYearProductionMwh: number | null;
  productionChangePercent: number | null;
}

// ============================================================
// DESIGN TOKENS
// ============================================================

const C = {
  navy: "#1E3A5F",
  navyLight: "#335E99",
  navyPale: "#E8EEF5",
  white: "#FFFFFF",
  gray50: "#F9FAFB",
  gray100: "#F3F4F6",
  gray200: "#E5E7EB",
  gray500: "#6B7280",
  gray600: "#4B5563",
  gray700: "#374151",
  gray800: "#1F2937",
  green: "#16A34A",
  red: "#DC2626",
};

// ============================================================
// FORMATTERS (inline to keep the template self-contained)
// ============================================================

function fmtNum(value: number | null | undefined, decimals = 1): string {
  if (value == null) return "–";
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function fmtCurrency(value: number | null | undefined): string {
  if (value == null) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// ============================================================
// STYLES
// ============================================================

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: C.gray800,
    backgroundColor: C.white,
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 40,
  },

  // Header banner
  banner: {
    backgroundColor: C.navy,
    marginHorizontal: -40,
    marginTop: -40,
    paddingHorizontal: 40,
    paddingVertical: 22,
    marginBottom: 20,
  },
  bannerTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 11,
    color: C.navyPale,
  },

  // Section titles
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
    marginBottom: 8,
    marginTop: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.navyPale,
    paddingBottom: 4,
  },

  // KPI grid (2x2)
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 6,
  },
  kpiBox: {
    width: "48%",
    backgroundColor: C.navyPale,
    borderRadius: 4,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: C.navyLight,
  },
  kpiLabel: {
    fontSize: 8,
    color: C.gray600,
    marginBottom: 2,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: C.navy,
  },
  kpiUnit: {
    fontSize: 9,
    color: C.gray500,
    marginLeft: 3,
  },

  // Tables
  table: {
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.navy,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: C.gray200,
  },
  tableRowAlt: {
    backgroundColor: C.gray50,
  },
  tableCell: {
    fontSize: 9,
    color: C.gray700,
  },
  tableCellBold: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.gray800,
  },
  tableTotalRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: C.navyPale,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },

  // Column widths for production table
  colMonth: { width: "30%" },
  colProd: { width: "25%", textAlign: "right" as const },
  colAvail: { width: "22%", textAlign: "right" as const },
  colWind: { width: "23%", textAlign: "right" as const },

  // Column widths for revenue table
  colRevMonth: { width: "25%" },
  colEeg: { width: "25%", textAlign: "right" as const },
  colDv: { width: "25%", textAlign: "right" as const },
  colTotal: { width: "25%", textAlign: "right" as const },

  // Performance assessment
  assessmentBox: {
    backgroundColor: C.gray50,
    borderRadius: 4,
    padding: 14,
    marginTop: 4,
    borderWidth: 1,
    borderColor: C.gray200,
  },
  assessmentRow: {
    flexDirection: "row",
    marginBottom: 5,
  },
  assessmentLabel: {
    fontSize: 9,
    color: C.gray600,
    width: 160,
  },
  assessmentValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.gray800,
  },
  assessmentPositive: {
    color: C.green,
  },
  assessmentNegative: {
    color: C.red,
  },
  assessmentNote: {
    fontSize: 8,
    color: C.gray500,
    marginTop: 8,
    fontStyle: "italic",
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: C.gray200,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: C.gray500,
  },
  pageNumber: {
    position: "absolute",
    bottom: 20,
    right: 40,
    fontSize: 7,
    color: C.gray500,
  },
});

// ============================================================
// TEMPLATE COMPONENT
// ============================================================

interface InvestorQuarterlyTemplateProps {
  data: InvestorQuarterlyData;
}

export function InvestorQuarterlyTemplate({ data }: InvestorQuarterlyTemplateProps) {
  const quarterLabel = `Q${data.quarter} ${data.year}`;

  // Build performance assessment text
  const changeSign = data.productionChangePercent != null && data.productionChangePercent >= 0 ? "+" : "";
  const changeText =
    data.productionChangePercent != null
      ? `${changeSign}${fmtNum(data.productionChangePercent)}%`
      : "– (keine Vorjahresdaten)";

  // Summary totals for revenue table
  const totalEeg = data.monthlyRevenue?.reduce((s, m) => s + (m.eegRevenueEur ?? 0), 0) ?? null;
  const totalDv = data.monthlyRevenue?.reduce((s, m) => s + (m.dvRevenueEur ?? 0), 0) ?? null;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ---- HEADER BANNER ---- */}
        <View style={s.banner}>
          <Text style={s.bannerTitle}>
            Quartalsbericht {quarterLabel}
          </Text>
          <Text style={s.bannerSubtitle}>
            {data.fundName} — {data.parkName} — Bericht für Gesellschafter
          </Text>
        </View>

        {/* ---- KPI SUMMARY ---- */}
        <Text style={s.sectionTitle}>Kennzahlen im Überblick</Text>
        <View style={s.kpiGrid}>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>Gesamtproduktion</Text>
            <Text>
              <Text style={s.kpiValue}>{fmtNum(data.totalProductionMwh, 1)}</Text>
              <Text style={s.kpiUnit}> MWh</Text>
            </Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>Ø Verfügbarkeit</Text>
            <Text>
              <Text style={s.kpiValue}>{fmtNum(data.avgAvailabilityPct, 1)}</Text>
              <Text style={s.kpiUnit}> %</Text>
            </Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>Gesamterlöse</Text>
            <Text style={s.kpiValue}>{fmtCurrency(data.totalRevenueEur)}</Text>
          </View>
          <View style={s.kpiBox}>
            <Text style={s.kpiLabel}>Ø Windgeschwindigkeit</Text>
            <Text>
              <Text style={s.kpiValue}>{fmtNum(data.avgWindSpeedMs, 1)}</Text>
              <Text style={s.kpiUnit}> m/s</Text>
            </Text>
          </View>
        </View>

        {/* ---- PRODUCTION TABLE ---- */}
        <Text style={s.sectionTitle}>Produktionsübersicht</Text>
        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderCell, s.colMonth]}>Monat</Text>
            <Text style={[s.tableHeaderCell, s.colProd]}>Produktion (MWh)</Text>
            <Text style={[s.tableHeaderCell, s.colAvail]}>Verfügbarkeit (%)</Text>
            <Text style={[s.tableHeaderCell, s.colWind]}>Wind (m/s)</Text>
          </View>
          {data.months.map((m, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={[s.tableCell, s.colMonth]}>{m.name}</Text>
              <Text style={[s.tableCell, s.colProd]}>{fmtNum(m.productionMwh, 1)}</Text>
              <Text style={[s.tableCell, s.colAvail]}>{fmtNum(m.availabilityPct, 1)}</Text>
              <Text style={[s.tableCell, s.colWind]}>{fmtNum(m.windSpeedMs, 1)}</Text>
            </View>
          ))}
          {/* Total row */}
          <View style={s.tableTotalRow}>
            <Text style={[s.tableCellBold, s.colMonth]}>Gesamt / Ø</Text>
            <Text style={[s.tableCellBold, s.colProd]}>
              {fmtNum(data.totalProductionMwh, 1)}
            </Text>
            <Text style={[s.tableCellBold, s.colAvail]}>
              {fmtNum(data.avgAvailabilityPct, 1)}
            </Text>
            <Text style={[s.tableCellBold, s.colWind]}>
              {fmtNum(data.avgWindSpeedMs, 1)}
            </Text>
          </View>
        </View>

        {/* ---- REVENUE TABLE ---- */}
        <Text style={s.sectionTitle}>Erlösübersicht</Text>
        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderCell, s.colRevMonth]}>Monat</Text>
            <Text style={[s.tableHeaderCell, s.colEeg]}>EEG-Vergütung (€)</Text>
            <Text style={[s.tableHeaderCell, s.colDv]}>Marktprämie (€)</Text>
            <Text style={[s.tableHeaderCell, s.colTotal]}>Gesamt (€)</Text>
          </View>
          {(data.monthlyRevenue ?? data.months).map((m, i) => {
            const rev = data.monthlyRevenue?.[i];
            return (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.tableCell, s.colRevMonth]}>{m.name}</Text>
                <Text style={[s.tableCell, s.colEeg]}>
                  {rev ? fmtCurrency(rev.eegRevenueEur) : "–"}
                </Text>
                <Text style={[s.tableCell, s.colDv]}>
                  {rev ? fmtCurrency(rev.dvRevenueEur) : "–"}
                </Text>
                <Text style={[s.tableCell, s.colTotal]}>
                  {rev ? fmtCurrency(rev.totalRevenueEur) : fmtCurrency((m as { revenueEur?: number | null }).revenueEur ?? null)}
                </Text>
              </View>
            );
          })}
          {/* Total row */}
          <View style={s.tableTotalRow}>
            <Text style={[s.tableCellBold, s.colRevMonth]}>Gesamt</Text>
            <Text style={[s.tableCellBold, s.colEeg]}>{fmtCurrency(totalEeg)}</Text>
            <Text style={[s.tableCellBold, s.colDv]}>{fmtCurrency(totalDv)}</Text>
            <Text style={[s.tableCellBold, s.colTotal]}>{fmtCurrency(data.totalRevenueEur)}</Text>
          </View>
        </View>

        {/* ---- PERFORMANCE ASSESSMENT ---- */}
        <Text style={s.sectionTitle}>Performance-Bewertung</Text>
        <View style={s.assessmentBox}>
          <View style={s.assessmentRow}>
            <Text style={s.assessmentLabel}>Kapazitätsfaktor:</Text>
            <Text style={s.assessmentValue}>{fmtNum(data.capacityFactor, 1)} %</Text>
          </View>
          <View style={s.assessmentRow}>
            <Text style={s.assessmentLabel}>Produktion Vorjahresquartal:</Text>
            <Text style={s.assessmentValue}>
              {data.prevYearProductionMwh != null
                ? `${fmtNum(data.prevYearProductionMwh, 1)} MWh`
                : "– (keine Daten)"}
            </Text>
          </View>
          <View style={s.assessmentRow}>
            <Text style={s.assessmentLabel}>Veränderung zum Vorjahr:</Text>
            <Text
              style={[
                s.assessmentValue,
                data.productionChangePercent != null && data.productionChangePercent >= 0
                  ? s.assessmentPositive
                  : data.productionChangePercent != null
                  ? s.assessmentNegative
                  : {},
              ]}
            >
              {changeText}
            </Text>
          </View>
          <Text style={s.assessmentNote}>
            {data.capacityFactor >= 25
              ? "Die Anlagen arbeiten im erwarteten Leistungsbereich."
              : data.capacityFactor >= 15
              ? "Die Leistung liegt im akzeptablen Bereich. Windbedingungen können saisonale Schwankungen verursachen."
              : "Der Kapazitätsfaktor liegt unter dem Erwartungswert. Eine Analyse der Ursachen wird empfohlen."}
          </Text>
        </View>

        {/* ---- FOOTER ---- */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Dieser Bericht wurde automatisch erstellt. — WindparkManager
          </Text>
          <Text style={s.footerText}>
            {new Date().toLocaleDateString("de-DE")}
          </Text>
        </View>
        <Text
          style={s.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
