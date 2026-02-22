import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatCurrency, formatNumber } from "../../utils/formatters";
import { SettlementRevenueTable } from "./SettlementRevenueTable";
import { SettlementCalculationSummary } from "./SettlementCalculationSummary";
import { SettlementFeeBreakdown } from "./SettlementFeeBreakdown";
import type { SettlementPdfDetails } from "@/types/pdf";

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#333333",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 8,
    marginTop: 15,
    borderBottomWidth: 0.5,
    borderBottomColor: "#999999",
    paddingBottom: 3,
  },
  // Turbine production table
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
  totalRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#000000",
    paddingTop: 4,
    marginTop: 2,
  },
  colDesignation: {
    width: "30%",
    fontSize: 8,
  },
  colProduction: {
    width: "25%",
    fontSize: 8,
    textAlign: "right",
  },
  colHours: {
    width: "25%",
    fontSize: 8,
    textAlign: "right",
  },
  colAvailability: {
    width: "20%",
    fontSize: 8,
    textAlign: "right",
  },
  headerText: {
    fontWeight: "bold",
    fontSize: 8,
  },
  totalLabel: {
    width: "30%",
    fontSize: 9,
    fontWeight: "bold",
  },
  totalValue: {
    width: "25%",
    fontSize: 9,
    fontWeight: "bold",
    textAlign: "right",
  },
});

interface SettlementAttachmentProps {
  invoiceNumber: string;
  details: SettlementPdfDetails;
}

export function SettlementAttachment({ invoiceNumber, details }: SettlementAttachmentProps) {
  const hasRevenue = details.revenueTable && details.revenueTable.length > 0;
  const hasCalculation = !!details.calculationSummary;
  const hasFeePositions = details.feePositions && details.feePositions.length > 0;
  const hasTurbines = details.turbineProductions && details.turbineProductions.length > 0;

  // Calculate total production from turbine data
  const totalProductionKwh = details.turbineProductions?.reduce(
    (sum, t) => sum + t.productionKwh, 0
  ) ?? 0;

  // Dynamic section numbering
  let sectionNum = 1;

  return (
    <View style={styles.container}>
      {/* Anlage title */}
      <Text style={styles.title}>
        Anlage 1 zur Gutschrift {invoiceNumber}
      </Text>
      {details.subtitle && (
        <Text style={styles.subtitle}>
          {details.subtitle.replace("Nutzungsentgelt / ", "Berechnungsnachweis / ")}
        </Text>
      )}

      {/* 1. Ertragsuebersicht (Revenue table by tariff) */}
      {hasRevenue && (
        <>
          <Text style={styles.sectionTitle}>{sectionNum++}. Ertragsuebersicht</Text>
          <SettlementRevenueTable
            entries={details.revenueTable!}
            total={details.revenueTableTotal ?? 0}
          />
        </>
      )}

      {/* 2. Berechnungsuebersicht (Calculation summary) */}
      {hasCalculation && (
        <>
          <Text style={styles.sectionTitle}>
            {sectionNum++}. Berechnungsuebersicht
          </Text>
          <SettlementCalculationSummary
            summary={details.calculationSummary!}
          />
        </>
      )}

      {/* 3. Positionsaufstellung (Fee breakdown: full fees + advance deductions) */}
      {hasFeePositions && (
        <>
          <Text style={styles.sectionTitle}>
            {sectionNum++}. Positionsaufstellung
          </Text>
          <SettlementFeeBreakdown
            positions={details.feePositions!}
          />
        </>
      )}

      {/* 4. Ertrag je Anlage (Per-turbine production) */}
      {hasTurbines && (
        <>
          <Text style={styles.sectionTitle}>
            {sectionNum++}. Ertrag je Anlage
          </Text>

          {/* Table header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.colDesignation, styles.headerText]}>Anlage</Text>
            <Text style={[styles.colProduction, styles.headerText]}>Produktion kWh</Text>
            <Text style={[styles.colHours, styles.headerText]}>Betriebsstunden</Text>
            <Text style={[styles.colAvailability, styles.headerText]}>Verfuegbarkeit %</Text>
          </View>

          {/* Turbine rows */}
          {details.turbineProductions!.map((turbine, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={styles.colDesignation}>{turbine.designation}</Text>
              <Text style={styles.colProduction}>
                {formatNumber(turbine.productionKwh, 1)}
              </Text>
              <Text style={styles.colHours}>
                {turbine.operatingHours != null ? formatNumber(turbine.operatingHours, 0) : "-"}
              </Text>
              <Text style={styles.colAvailability}>
                {turbine.availabilityPct != null ? formatNumber(turbine.availabilityPct, 1) : "-"}
              </Text>
            </View>
          ))}

          {/* Total row */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Gesamt</Text>
            <Text style={styles.totalValue}>
              {formatNumber(totalProductionKwh, 1)}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}
