import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatCurrency, formatNumber } from "../../utils/formatters";
import type { RevenueTableEntry } from "@/types/pdf";

const styles = StyleSheet.create({
  container: {
    marginBottom: 15,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#CCCCCC",
  },
  colCategory: {
    width: "30%",
    fontSize: 8,
  },
  colRate: {
    width: "20%",
    fontSize: 8,
    textAlign: "right",
  },
  colProduction: {
    width: "25%",
    fontSize: 8,
    textAlign: "right",
  },
  colRevenue: {
    width: "25%",
    fontSize: 8,
    textAlign: "right",
  },
  headerText: {
    fontWeight: "bold",
    fontSize: 8,
  },
  totalRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#000000",
    paddingTop: 4,
    marginTop: 2,
  },
  totalLabel: {
    fontSize: 9,
    fontWeight: "bold",
    flex: 1,
  },
  totalValue: {
    fontSize: 9,
    fontWeight: "bold",
    width: "25%",
    textAlign: "right",
  },
});

interface SettlementRevenueTableProps {
  entries: RevenueTableEntry[];
  total: number;
}

export function SettlementRevenueTable({ entries, total }: SettlementRevenueTableProps) {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colCategory, styles.headerText]}>Kategorie</Text>
        <Text style={[styles.colRate, styles.headerText]}>Verguetung</Text>
        <Text style={[styles.colProduction, styles.headerText]}>Einspeisung</Text>
        <Text style={[styles.colRevenue, styles.headerText]}>Ertrag</Text>
      </View>

      {/* Rows */}
      {entries.map((entry, idx) => (
        <View key={idx} style={styles.tableRow}>
          <Text style={styles.colCategory}>{entry.category}</Text>
          <Text style={styles.colRate}>{formatNumber(entry.rateCtPerKwh, 4)} ct/kWh</Text>
          <Text style={styles.colProduction}>{formatNumber(entry.productionKwh, 1)} kWh</Text>
          <Text style={styles.colRevenue}>{formatCurrency(entry.revenueEur)}</Text>
        </View>
      ))}

      {/* Total */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}></Text>
        <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
      </View>
    </View>
  );
}
