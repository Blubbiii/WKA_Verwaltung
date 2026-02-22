import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatCurrency, formatNumber } from "../../utils/formatters";
import type { CalculationSummary } from "@/types/pdf";

const styles = StyleSheet.create({
  container: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: "#F8F8F8",
    borderRadius: 3,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  label: {
    fontSize: 8,
    flex: 1,
  },
  value: {
    fontSize: 8,
    width: 100,
    textAlign: "right",
  },
  boldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    borderTopWidth: 0.5,
    borderTopColor: "#999999",
    marginTop: 4,
  },
  boldLabel: {
    fontSize: 9,
    fontWeight: "bold",
    flex: 1,
  },
  boldValue: {
    fontSize: 9,
    fontWeight: "bold",
    width: 100,
    textAlign: "right",
  },
  separator: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#CCCCCC",
    marginVertical: 6,
  },
  splitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  splitLabel: {
    fontSize: 8,
    flex: 1,
  },
  splitTotal: {
    fontSize: 8,
    width: 80,
    textAlign: "right",
  },
  splitPerUnit: {
    fontSize: 8,
    width: 80,
    textAlign: "right",
    color: "#666666",
  },
});

interface SettlementCalculationSummaryProps {
  summary: CalculationSummary;
}

export function SettlementCalculationSummary({ summary }: SettlementCalculationSummaryProps) {
  return (
    <View style={styles.container}>
      {/* Revenue share calculation */}
      <View style={styles.row}>
        <Text style={styles.label}>
          Rechnerisches Jahresnutzungsentgelt ({formatNumber(summary.revenuePhasePercentage, 1)} %)
        </Text>
        <Text style={styles.value}>{formatCurrency(summary.calculatedAnnualFee)}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Minimum gemaess Vertrag</Text>
        <Text style={styles.value}>{formatCurrency(summary.minimumPerContract)}</Text>
      </View>

      {/* Actual fee (MAX) */}
      <View style={styles.boldRow}>
        <Text style={styles.boldLabel}>Tatsaechliches Jahresnutzungsentgelt</Text>
        <Text style={styles.boldValue}>{formatCurrency(summary.actualAnnualFee)}</Text>
      </View>

      <View style={styles.separator} />

      {/* WEA/Pool split */}
      <View style={styles.splitRow}>
        <Text style={styles.splitLabel}>
          {formatNumber(summary.weaSharePercentage, 1)} % der verbleibenden Summe anteilig fuer WKA-Standorte
        </Text>
        <Text style={styles.splitTotal}>{formatCurrency(summary.weaShareAmount)}</Text>
        <Text style={styles.splitPerUnit}>
          {formatCurrency(summary.weaSharePerUnit)}/WKA
        </Text>
      </View>

      <View style={styles.splitRow}>
        <Text style={styles.splitLabel}>
          {formatNumber(summary.poolSharePercentage, 1)} % der verbleibenden Summe fuer Umlage auf Gesamtflaeche ({formatNumber(summary.poolTotalHa, 5)} ha)
        </Text>
        <Text style={styles.splitTotal}>{formatCurrency(summary.poolShareAmount)}</Text>
        <Text style={styles.splitPerUnit}>
          {formatCurrency(summary.poolSharePerHa)}/ha
        </Text>
      </View>
    </View>
  );
}
