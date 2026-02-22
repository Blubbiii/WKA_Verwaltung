import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { DocumentTemplateLayout } from "@/types/pdf";
import { formatCurrency, formatNumber, formatPercent } from "../../utils/formatters";

const styles = StyleSheet.create({
  table: {
    marginTop: 20,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000000",
    paddingBottom: 5,
    marginBottom: 5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#CCCCCC",
  },
  // Spalten
  colPosition: {
    width: "8%",
    fontSize: 9,
  },
  colDescription: {
    flex: 1,
    fontSize: 9,
    paddingRight: 10,
  },
  colQuantity: {
    width: "10%",
    fontSize: 9,
    textAlign: "right",
  },
  colUnit: {
    width: "8%",
    fontSize: 9,
    textAlign: "center",
  },
  colUnitPrice: {
    width: "15%",
    fontSize: 9,
    textAlign: "right",
  },
  colTaxRate: {
    width: "8%",
    fontSize: 9,
    textAlign: "right",
  },
  colAmount: {
    width: "15%",
    fontSize: 9,
    textAlign: "right",
  },
  headerText: {
    fontWeight: "bold",
  },
  // Summen
  summaryContainer: {
    marginTop: 15,
    alignItems: "flex-end",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingVertical: 2,
    width: 200,
  },
  summaryLabel: {
    fontSize: 9,
    width: 120,
    textAlign: "right",
    paddingRight: 10,
  },
  summaryValue: {
    fontSize: 9,
    width: 80,
    textAlign: "right",
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: "#000000",
    paddingTop: 5,
    marginTop: 5,
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: "bold",
    width: 120,
    textAlign: "right",
    paddingRight: 10,
  },
  totalValue: {
    fontSize: 10,
    fontWeight: "bold",
    width: 80,
    textAlign: "right",
  },
});

export interface InvoiceItem {
  position?: number;
  description: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  taxRate: number;
  netAmount: number;
}

interface ItemsTableProps {
  items: InvoiceItem[];
  layout: DocumentTemplateLayout;
  totals: {
    netTotal: number;
    taxTotal: number;
    grossTotal: number;
    taxBreakdown: Array<{ rate: number; net: number; tax: number }>;
  };
}

export function ItemsTable({ items, layout, totals }: ItemsTableProps) {
  const { showPosition, showQuantity, showUnit, showTaxRate } = layout.sections.items;

  return (
    <View style={styles.table}>
      {/* Tabellenkopf */}
      <View style={styles.tableHeader}>
        {showPosition && (
          <Text style={[styles.colPosition, styles.headerText]}>Pos.</Text>
        )}
        <Text style={[styles.colDescription, styles.headerText]}>Beschreibung</Text>
        {showQuantity && (
          <Text style={[styles.colQuantity, styles.headerText]}>Menge</Text>
        )}
        {showUnit && (
          <Text style={[styles.colUnit, styles.headerText]}>Einheit</Text>
        )}
        <Text style={[styles.colUnitPrice, styles.headerText]}>Einzelpreis</Text>
        {showTaxRate && (
          <Text style={[styles.colTaxRate, styles.headerText]}>MwSt.</Text>
        )}
        <Text style={[styles.colAmount, styles.headerText]}>Betrag</Text>
      </View>

      {/* Positionen */}
      {items.map((item, index) => (
        <View key={index} style={styles.tableRow}>
          {showPosition && (
            <Text style={styles.colPosition}>
              {item.position ?? index + 1}
            </Text>
          )}
          <Text style={styles.colDescription}>{item.description || "-"}</Text>
          {showQuantity && (
            <Text style={styles.colQuantity}>
              {item.quantity ? formatNumber(item.quantity, 2) : "-"}
            </Text>
          )}
          {showUnit && (
            <Text style={styles.colUnit}>{item.unit || "-"}</Text>
          )}
          <Text style={styles.colUnitPrice}>
            {item.unitPrice ? formatCurrency(item.unitPrice) : "-"}
          </Text>
          {showTaxRate && (
            <Text style={styles.colTaxRate}>{formatPercent(item.taxRate)}</Text>
          )}
          <Text style={styles.colAmount}>{formatCurrency(item.netAmount)}</Text>
        </View>
      ))}

      {/* Summen */}
      <View style={styles.summaryContainer}>
        {/* Nettosumme */}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Netto:</Text>
          <Text style={styles.summaryValue}>{formatCurrency(totals.netTotal)}</Text>
        </View>

        {/* MwSt.-Aufschluesselung */}
        {totals.taxBreakdown.map((tax) => (
          <View key={tax.rate} style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              MwSt. {formatPercent(tax.rate)}:
            </Text>
            <Text style={styles.summaryValue}>{formatCurrency(tax.tax)}</Text>
          </View>
        ))}

        {/* Bruttosumme */}
        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Gesamtbetrag:</Text>
          <Text style={styles.totalValue}>{formatCurrency(totals.grossTotal)}</Text>
        </View>
      </View>
    </View>
  );
}
