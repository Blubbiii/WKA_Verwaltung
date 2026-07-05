import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatCurrency, formatNumber } from "../../utils/formatters";
import type { CurtailmentResponse } from "@/types/analytics";

// =============================================================================
// CurtailmentSection — PDF section for Custom Reports
//
// Rendered as a self-contained <View> block; parent report template composes
// it. Does NOT introduce a new <Page>. Safe to include in CustomReportTemplate.
//
// Business context:
//   §13a EnWG requires that the Netzbetreiber compensates for external
//   curtailment (Redispatch). This section documents lost energy and revenue
//   per category, highlighting the einforderbar (external) share.
// =============================================================================

const CATEGORY_COLORS: Record<string, string> = {
  wind: "#3B82F6",
  technical: "#F59E0B",
  forced: "#6B7280",
  external: "#EF4444",
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 15,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    paddingBottom: 3,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  kpiBox: {
    flexGrow: 1,
    flexBasis: "33%",
    borderWidth: 0.5,
    borderColor: "#CCCCCC",
    padding: 6,
    backgroundColor: "#FAFAFA",
  },
  kpiLabel: {
    fontSize: 7,
    color: "#666666",
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 10,
    fontWeight: "bold",
  },
  kpiHighlightBox: {
    flexGrow: 1,
    flexBasis: "33%",
    borderWidth: 0.5,
    borderColor: "#EF4444",
    padding: 6,
    backgroundColor: "#FEF2F2",
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    paddingBottom: 3,
    marginBottom: 3,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#DDDDDD",
    alignItems: "center",
  },
  colIndicator: {
    width: "3%",
    fontSize: 8,
  },
  colCategory: {
    width: "37%",
    fontSize: 8,
  },
  colKwh: {
    width: "20%",
    fontSize: 8,
    textAlign: "right",
  },
  colEur: {
    width: "20%",
    fontSize: 8,
    textAlign: "right",
  },
  colPct: {
    width: "20%",
    fontSize: 8,
    textAlign: "right",
  },
  headerText: {
    fontWeight: "bold",
    fontSize: 8,
  },
  swatch: {
    width: 8,
    height: 8,
    marginRight: 3,
  },
  note: {
    fontSize: 7,
    color: "#666666",
    marginTop: 6,
    lineHeight: 1.3,
    fontStyle: "italic",
  },
  emptyState: {
    fontSize: 8,
    color: "#666666",
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 10,
  },
});

interface CurtailmentSectionProps {
  data: CurtailmentResponse;
}

export function CurtailmentSection({ data }: CurtailmentSectionProps) {
  const { summary, byCategory } = data;
  const hasData = summary.totalLostKwh > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeader}>
        Abregelungen (Curtailment) — Jahr {summary.year}
      </Text>

      {/* KPI Row */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Verlorene Energie</Text>
          <Text style={styles.kpiValue}>
            {formatNumber(summary.totalLostKwh, 0)} kWh
          </Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Ertragsausfall (gesamt)</Text>
          <Text style={styles.kpiValue}>
            {formatCurrency(summary.totalLostEur)}
          </Text>
        </View>
        <View style={styles.kpiHighlightBox}>
          <Text style={styles.kpiLabel}>
            Redispatch-relevant (§13a EnWG)
          </Text>
          <Text style={styles.kpiValue}>
            {formatCurrency(summary.externalRedispatchEur)}
          </Text>
        </View>
      </View>

      {hasData ? (
        <>
          {/* Table by category */}
          <View style={styles.tableHeader}>
            <Text style={[styles.colIndicator, styles.headerText]} />
            <Text style={[styles.colCategory, styles.headerText]}>
              Kategorie
            </Text>
            <Text style={[styles.colKwh, styles.headerText]}>Verlust (kWh)</Text>
            <Text style={[styles.colEur, styles.headerText]}>Ausfall (EUR)</Text>
            <Text style={[styles.colPct, styles.headerText]}>Anteil Prod.</Text>
          </View>

          {byCategory.map((cat) => (
            <View key={cat.category} style={styles.tableRow}>
              <View style={styles.colIndicator}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: CATEGORY_COLORS[cat.category] ?? "#999" },
                  ]}
                />
              </View>
              <Text style={styles.colCategory}>{cat.label}</Text>
              <Text style={styles.colKwh}>
                {formatNumber(cat.totalLostKwh, 0)}
              </Text>
              <Text style={styles.colEur}>
                {formatCurrency(cat.totalLostEur)}
              </Text>
              <Text style={styles.colPct}>
                {formatNumber(cat.pctOfProduction, 1)} %
              </Text>
            </View>
          ))}

          <Text style={styles.note}>
            Nach § 13a EnWG (Redispatch) kann der Ertragsausfall der Kategorie
            &quot;Extern&quot; als Ausgleichsforderung beim Netzbetreiber
            geltend gemacht werden. Die Werte basieren auf 10-Minuten-SCADA-
            Messwerten (mrwSmpPwin / mrwSmpPte / mrwSmpPfm / mrwSmpPext).
            Der Ertragsausfall wird mit der durchschnittlichen EEG-Vergütung
            bewertet.
          </Text>
        </>
      ) : (
        <Text style={styles.emptyState}>
          Keine Abregelungen im ausgewählten Zeitraum erfasst.
        </Text>
      )}
    </View>
  );
}
