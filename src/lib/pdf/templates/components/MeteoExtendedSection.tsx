import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatNumber } from "../../utils/formatters";
import type { MeteoResponse } from "@/types/analytics";
import { MONTH_LABELS } from "@/types/analytics";

// =============================================================================
// PDF Section: Meteorology & Icing
// Reusable section for CustomReportTemplate integration.
// Renders: header, KPI-row, monthly icing table, availability note.
// =============================================================================

const styles = StyleSheet.create({
  container: {
    marginBottom: 18,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 0.75,
    borderBottomColor: "#000000",
  },
  kpiRow: {
    flexDirection: "row",
    marginBottom: 10,
    gap: 6,
  },
  kpiCard: {
    flex: 1,
    padding: 6,
    backgroundColor: "#F5F5F5",
    borderRadius: 3,
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
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    paddingBottom: 3,
    marginBottom: 3,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 2,
    borderBottomWidth: 0.4,
    borderBottomColor: "#CCCCCC",
  },
  colMonth: {
    width: "40%",
    fontSize: 8,
  },
  colHours: {
    width: "30%",
    fontSize: 8,
    textAlign: "right",
  },
  colColdHours: {
    width: "30%",
    fontSize: 8,
    textAlign: "right",
  },
  headerText: {
    fontSize: 8,
    fontWeight: "bold",
  },
  note: {
    fontSize: 7,
    color: "#666666",
    marginTop: 6,
    fontStyle: "italic",
  },
});

interface MeteoExtendedSectionProps {
  data: MeteoResponse;
  labels?: {
    title?: string;
    kpiIcing?: string;
    kpiColdIcing?: string;
    kpiPeakMonth?: string;
    kpiAvailability?: string;
    tableMonth?: string;
    tableHours?: string;
    tableCold?: string;
    availabilityNote?: (pct: string) => string;
    noPeak?: string;
  };
}

const DEFAULT_LABELS = {
  title: "Meteorologie & Vereisung",
  kpiIcing: "Vereisungs-Stunden",
  kpiColdIcing: "Cold-Icing-Stunden",
  kpiPeakMonth: "Peak-Icing-Monat",
  kpiAvailability: "Daten-Verfügbarkeit",
  tableMonth: "Monat",
  tableHours: "Icing (h)",
  tableCold: "Cold-Icing (h)",
  availabilityNote: (pct: string) =>
    `Meteorologische Sensordaten für ${pct} % aller 10-Minuten-Buckets im Berichtsjahr verfügbar.`,
  noPeak: "---",
} as const;

export function MeteoExtendedSection({
  data,
  labels,
}: MeteoExtendedSectionProps) {
  const L = { ...DEFAULT_LABELS, ...labels };
  const { icing, summary } = data;

  const peakText = icing.peakIcingMonth
    ? `${MONTH_LABELS[(icing.peakIcingMonth.month - 1) % 12]} · ${formatNumber(icing.peakIcingMonth.hours, 1)} h`
    : L.noPeak;

  // Build 12-month scaffold so missing months still print as 0.
  const monthly = new Map(icing.monthlyIcingHours.map((m) => [m.month, m]));

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeader}>{L.title}</Text>

      {/* KPI row */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>{L.kpiIcing}</Text>
          <Text style={styles.kpiValue}>
            {formatNumber(icing.totalIcingHours, 1)} h
          </Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>{L.kpiColdIcing}</Text>
          <Text style={styles.kpiValue}>
            {formatNumber(icing.totalColdIcingHours, 1)} h
          </Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>{L.kpiPeakMonth}</Text>
          <Text style={styles.kpiValue}>{peakText}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>{L.kpiAvailability}</Text>
          <Text style={styles.kpiValue}>
            {formatNumber(summary.dataAvailability, 1)} %
          </Text>
        </View>
      </View>

      {/* Monthly icing table */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colMonth, styles.headerText]}>{L.tableMonth}</Text>
        <Text style={[styles.colHours, styles.headerText]}>{L.tableHours}</Text>
        <Text style={[styles.colColdHours, styles.headerText]}>
          {L.tableCold}
        </Text>
      </View>

      {Array.from({ length: 12 }, (_, i) => {
        const monthNum = i + 1;
        const row = monthly.get(monthNum);
        return (
          <View key={monthNum} style={styles.tableRow}>
            <Text style={styles.colMonth}>{MONTH_LABELS[i]}</Text>
            <Text style={styles.colHours}>
              {formatNumber(row?.hours ?? 0, 1)}
            </Text>
            <Text style={styles.colColdHours}>
              {formatNumber(row?.coldHours ?? 0, 1)}
            </Text>
          </View>
        );
      })}

      <Text style={styles.note}>
        {L.availabilityNote(formatNumber(summary.dataAvailability, 1))}
      </Text>
    </View>
  );
}
