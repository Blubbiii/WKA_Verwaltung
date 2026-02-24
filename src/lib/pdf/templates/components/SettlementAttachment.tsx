import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatCurrency, formatNumber } from "../../utils/formatters";
import { SettlementRevenueTable } from "./SettlementRevenueTable";
import { SettlementCalculationSummary } from "./SettlementCalculationSummary";
import { SettlementFeeBreakdown } from "./SettlementFeeBreakdown";
import type { SettlementPdfDetails, EnergyDistributionSummary } from "@/types/pdf";

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
  // Lease turbine columns
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
  // Energy turbine columns
  colEnergyDesignation: {
    width: "30%",
    fontSize: 8,
  },
  colEnergyProduction: {
    width: "25%",
    fontSize: 8,
    textAlign: "right",
  },
  colEnergyShare: {
    width: "20%",
    fontSize: 8,
    textAlign: "right",
  },
  colEnergyRevenue: {
    width: "25%",
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
  totalValueShare: {
    width: "20%",
    fontSize: 9,
    fontWeight: "bold",
    textAlign: "right",
  },
  // Energy distribution styles
  distRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#CCCCCC",
  },
  distLabel: {
    width: "55%",
    fontSize: 8,
  },
  distValue: {
    width: "45%",
    fontSize: 8,
    textAlign: "right",
  },
  distHighlightRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: "#000000",
    marginTop: 2,
  },
  distHighlightLabel: {
    width: "55%",
    fontSize: 9,
    fontWeight: "bold",
  },
  distHighlightValue: {
    width: "45%",
    fontSize: 9,
    fontWeight: "bold",
    textAlign: "right",
  },
  distSubheading: {
    fontSize: 9,
    fontWeight: "bold",
    marginTop: 10,
    marginBottom: 4,
    color: "#333333",
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
  const hasEnergyDistribution = !!details.energyDistribution;
  const isEnergy = details.type === "ENERGY";

  // Calculate total production from turbine data
  const totalProductionKwh = details.turbineProductions?.reduce(
    (sum, t) => sum + t.productionKwh, 0
  ) ?? 0;

  // Dynamic section numbering
  let sectionNum = 1;

  // Subtitle: replace prefix for readability
  const subtitleText = details.subtitle
    ? details.subtitle
        .replace("Nutzungsentgelt / ", "Berechnungsnachweis / ")
        .replace("Stromerlös / ", "Berechnungsnachweis / ")
    : undefined;

  return (
    <View style={styles.container}>
      {/* Anlage title */}
      <Text style={styles.title}>
        Anlage 1 zur Gutschrift {invoiceNumber}
      </Text>
      {subtitleText && (
        <Text style={styles.subtitle}>{subtitleText}</Text>
      )}

      {/* 1. Ertragsübersicht (Revenue table by tariff) */}
      {hasRevenue && (
        <>
          <Text style={styles.sectionTitle}>{sectionNum++}. Ertragsübersicht</Text>
          <SettlementRevenueTable
            entries={details.revenueTable!}
            total={details.revenueTableTotal ?? 0}
          />
        </>
      )}

      {/* 2a. Verteilungsnachweis (Energy only) */}
      {hasEnergyDistribution && (
        <>
          <Text style={styles.sectionTitle}>
            {sectionNum++}. Verteilungsnachweis
          </Text>
          {renderEnergyDistribution(details.energyDistribution!)}
        </>
      )}

      {/* 2b. Berechnungsübersicht (Lease only) */}
      {hasCalculation && (
        <>
          <Text style={styles.sectionTitle}>
            {sectionNum++}. Berechnungsübersicht
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

          {isEnergy
            ? renderEnergyTurbineTable(details)
            : renderLeaseTurbineTable(details, totalProductionKwh)
          }
        </>
      )}
    </View>
  );
}

// =============================================================================
// Energy distribution summary (PDF)
// =============================================================================

function renderEnergyDistribution(dist: EnergyDistributionSummary) {
  const periodStr = dist.month
    ? `${String(dist.month).padStart(2, "0")}/${dist.year}`
    : `${dist.year}`;

  return (
    <View>
      {/* Park info */}
      <View style={styles.distRow}>
        <Text style={styles.distLabel}>Windpark</Text>
        <Text style={styles.distValue}>{dist.parkName}</Text>
      </View>
      <View style={styles.distRow}>
        <Text style={styles.distLabel}>Abrechnungszeitraum</Text>
        <Text style={styles.distValue}>{periodStr}</Text>
      </View>
      <View style={styles.distRow}>
        <Text style={styles.distLabel}>Verteilungsmodus</Text>
        <Text style={styles.distValue}>{dist.modeLabel}</Text>
      </View>

      {/* Park totals */}
      <View style={styles.distRow}>
        <Text style={styles.distLabel}>Gesamterlös Park</Text>
        <Text style={styles.distValue}>{formatCurrency(dist.netOperatorRevenueEur)}</Text>
      </View>
      <View style={styles.distRow}>
        <Text style={styles.distLabel}>Gesamtproduktion Park</Text>
        <Text style={styles.distValue}>{formatNumber(dist.totalProductionKwh, 1)} kWh</Text>
      </View>
      <View style={styles.distRow}>
        <Text style={styles.distLabel}>Durchschnittsproduktion je WEA</Text>
        <Text style={styles.distValue}>{formatNumber(dist.averageProductionKwh, 1)} kWh</Text>
      </View>
      <View style={styles.distRow}>
        <Text style={styles.distLabel}>Preis je kWh</Text>
        <Text style={styles.distValue}>{formatNumber(dist.pricePerKwh * 100, 4)} ct/kWh</Text>
      </View>

      {/* Recipient share */}
      <Text style={styles.distSubheading}>
        Anteil {dist.recipientName} ({dist.recipientTurbineCount} {dist.recipientTurbineCount === 1 ? "Anlage" : "Anlagen"})
      </Text>
      <View style={styles.distRow}>
        <Text style={styles.distLabel}>Produktionsanteil</Text>
        <Text style={styles.distValue}>
          {formatNumber(dist.recipientProductionKwh, 1)} kWh ({formatNumber(dist.recipientProductionSharePct, 2)} %)
        </Text>
      </View>
      <View style={styles.distHighlightRow}>
        <Text style={styles.distHighlightLabel}>Zugewiesener Erlös</Text>
        <Text style={styles.distHighlightValue}>{formatCurrency(dist.recipientRevenueEur)}</Text>
      </View>
    </View>
  );
}

// =============================================================================
// Energy turbine table (with share % and revenue)
// =============================================================================

function renderEnergyTurbineTable(details: SettlementPdfDetails) {
  const turbines = details.turbineProductions!;
  const totalProduction = turbines.reduce((sum, t) => sum + t.productionKwh, 0);
  const totalRevenue = turbines.reduce((sum, t) => sum + (t.revenueShareEur ?? 0), 0);

  return (
    <View>
      <View style={styles.tableHeader}>
        <Text style={[styles.colEnergyDesignation, styles.headerText]}>Anlage</Text>
        <Text style={[styles.colEnergyProduction, styles.headerText]}>Produktion kWh</Text>
        <Text style={[styles.colEnergyShare, styles.headerText]}>Anteil %</Text>
        <Text style={[styles.colEnergyRevenue, styles.headerText]}>Erlös</Text>
      </View>

      {turbines.map((turbine, idx) => (
        <View key={idx} style={styles.tableRow}>
          <Text style={styles.colEnergyDesignation}>{turbine.designation}</Text>
          <Text style={styles.colEnergyProduction}>
            {formatNumber(turbine.productionKwh, 1)}
          </Text>
          <Text style={styles.colEnergyShare}>
            {turbine.productionSharePct != null ? formatNumber(turbine.productionSharePct, 2) : "-"}
          </Text>
          <Text style={styles.colEnergyRevenue}>
            {turbine.revenueShareEur != null ? formatCurrency(turbine.revenueShareEur) : "-"}
          </Text>
        </View>
      ))}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Gesamt</Text>
        <Text style={styles.totalValue}>
          {formatNumber(totalProduction, 1)}
        </Text>
        <Text style={styles.totalValueShare}>-</Text>
        <Text style={styles.totalValue}>
          {formatCurrency(totalRevenue)}
        </Text>
      </View>
    </View>
  );
}

// =============================================================================
// Lease turbine table (with operating hours and availability)
// =============================================================================

function renderLeaseTurbineTable(details: SettlementPdfDetails, totalProductionKwh: number) {
  const turbines = details.turbineProductions!;

  return (
    <View>
      <View style={styles.tableHeader}>
        <Text style={[styles.colDesignation, styles.headerText]}>Anlage</Text>
        <Text style={[styles.colProduction, styles.headerText]}>Produktion kWh</Text>
        <Text style={[styles.colHours, styles.headerText]}>Betriebsstunden</Text>
        <Text style={[styles.colAvailability, styles.headerText]}>Verfügbarkeit %</Text>
      </View>

      {turbines.map((turbine, idx) => (
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

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Gesamt</Text>
        <Text style={styles.totalValue}>
          {formatNumber(totalProductionKwh, 1)}
        </Text>
      </View>
    </View>
  );
}
