import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatCurrency } from "../../utils/formatters";
import type { FeePositionEntry } from "@/types/pdf";

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
  deductionRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#CCCCCC",
    backgroundColor: "#FAFAFA",
  },
  colPos: {
    width: "6%",
    fontSize: 8,
    textAlign: "right",
    paddingRight: 4,
  },
  colDescription: {
    width: "54%",
    fontSize: 8,
  },
  colTax: {
    width: "15%",
    fontSize: 8,
    textAlign: "center",
  },
  colAmount: {
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
    width: "60%",
    fontSize: 9,
    fontWeight: "bold",
  },
  totalTaxLabel: {
    width: "15%",
    fontSize: 9,
    fontWeight: "bold",
    textAlign: "center",
  },
  totalValue: {
    width: "25%",
    fontSize: 9,
    fontWeight: "bold",
    textAlign: "right",
  },
});

interface SettlementFeeBreakdownProps {
  positions: FeePositionEntry[];
}

export function SettlementFeeBreakdown({ positions }: SettlementFeeBreakdownProps) {
  const total = positions.reduce((sum, p) => sum + p.netAmount, 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colPos, styles.headerText]}>Pos.</Text>
        <Text style={[styles.colDescription, styles.headerText]}>Bezeichnung</Text>
        <Text style={[styles.colTax, styles.headerText]}>Steuer</Text>
        <Text style={[styles.colAmount, styles.headerText]}>Betrag</Text>
      </View>

      {/* Rows */}
      {positions.map((pos, idx) => (
        <View
          key={idx}
          style={pos.netAmount < 0 ? styles.deductionRow : styles.tableRow}
        >
          <Text style={styles.colPos}>{idx + 1}</Text>
          <Text style={styles.colDescription}>{pos.description}</Text>
          <Text style={styles.colTax}>
            {pos.taxType === "STANDARD" ? "19 %" : "steuerfrei"}
          </Text>
          <Text style={styles.colAmount}>{formatCurrency(pos.netAmount)}</Text>
        </View>
      ))}

      {/* Total */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Auszahlungsbetrag (netto)</Text>
        <Text style={styles.totalTaxLabel} />
        <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
      </View>
    </View>
  );
}
