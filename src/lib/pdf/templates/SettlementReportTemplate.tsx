/**
 * Settlement Report PDF Template
 *
 * Generiert einen Pacht-Abrechnungsbericht mit:
 * - Übersicht der Abrechnungsperiode
 * - Tabelle mit allen Verpachtern
 * - Spalten: Verpachter, Flurstuecke, Mindestpacht, Erlösanteil, Auszahlung, Differenz
 * - Summenzeile
 * - Unterschriftenbereich
 */

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ResolvedLetterhead, ResolvedTemplate } from "../utils/templateResolver";
import type { SettlementCalculationResult, LeaseCalculationResult } from "@/lib/settlement";
import { Header } from "./components/Header";
import { Footer, PageNumber } from "./components/Footer";
import { formatCurrency, formatDate, formatNumber, formatPercent } from "../utils/formatters";

// ===========================================
// STYLES
// ===========================================

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#333333",
  },
  content: {
    flex: 1,
  },

  // Titel und Übersicht
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    color: "#666666",
    marginBottom: 20,
  },

  // Info-Box
  infoBox: {
    backgroundColor: "#F5F5F5",
    padding: 15,
    borderRadius: 3,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 5,
  },
  infoLabel: {
    fontSize: 9,
    color: "#666666",
    width: 150,
  },
  infoValue: {
    fontSize: 9,
    fontWeight: "bold",
  },

  // Konfigurationsbox
  configBox: {
    flexDirection: "row",
    marginBottom: 20,
    gap: 15,
  },
  configItem: {
    flex: 1,
    backgroundColor: "#FAFAFA",
    padding: 10,
    borderRadius: 3,
    borderLeftWidth: 3,
    borderLeftColor: "#3B82F6",
  },
  configLabel: {
    fontSize: 8,
    color: "#666666",
    marginBottom: 3,
  },
  configValue: {
    fontSize: 12,
    fontWeight: "bold",
  },

  // Tabelle
  table: {
    marginTop: 10,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#1E3A5F",
    paddingVertical: 8,
    paddingHorizontal: 5,
  },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E0E0E0",
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
  tableCellSmall: {
    fontSize: 7,
    color: "#666666",
  },

  // Spaltenbreiten
  colLessor: { width: "22%" },
  colPlots: { width: "18%" },
  colMinRent: { width: "15%", textAlign: "right" },
  colRevShare: { width: "15%", textAlign: "right" },
  colPayment: { width: "15%", textAlign: "right" },
  colDiff: { width: "15%", textAlign: "right" },

  // Summenzeile
  summaryRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 5,
    backgroundColor: "#1E3A5F",
    marginTop: 10,
  },
  summaryText: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  summaryTextRight: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#FFFFFF",
    textAlign: "right",
  },

  // Positive/Negative Werte
  positiveValue: {
    color: "#16A34A",
  },
  negativeValue: {
    color: "#DC2626",
  },

  // Legende
  legend: {
    marginTop: 15,
    padding: 10,
    backgroundColor: "#F5F5F5",
    borderRadius: 3,
  },
  legendTitle: {
    fontSize: 9,
    fontWeight: "bold",
    marginBottom: 5,
  },
  legendItem: {
    fontSize: 8,
    color: "#666666",
    marginBottom: 2,
  },

  // Unterschriftenbereich
  signatureSection: {
    marginTop: 40,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  signatureTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 15,
  },
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 40,
  },
  signatureBlock: {
    width: "40%",
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: "#333333",
    paddingTop: 5,
  },
  signatureLabel: {
    fontSize: 8,
    color: "#666666",
  },
  signatureDate: {
    fontSize: 8,
    color: "#666666",
    marginBottom: 5,
  },

  // Notizen
  notesSection: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "#FFFBEB",
    borderRadius: 3,
    borderLeftWidth: 3,
    borderLeftColor: "#F59E0B",
  },
  notesTitle: {
    fontSize: 9,
    fontWeight: "bold",
    marginBottom: 5,
  },
  notesText: {
    fontSize: 8,
    color: "#666666",
    lineHeight: 1.4,
  },
});

// ===========================================
// TYPES
// ===========================================

export interface SettlementReportData {
  calculation: SettlementCalculationResult;
  periodId: string;
  periodStatus: string;
  notes?: string | null;
  tenant?: {
    name: string | null;
    bankName: string | null;
    iban: string | null;
    bic: string | null;
  };
}

interface SettlementReportTemplateProps {
  data: SettlementReportData;
  template: ResolvedTemplate;
  letterhead: ResolvedLetterhead;
}

// ===========================================
// COMPONENTS
// ===========================================

/**
 * Formatiert die Flurstuecke einer Lease als Text
 */
function formatPlots(lease: LeaseCalculationResult): string {
  const plotsMap = new Map<string, string[]>();

  for (const area of lease.plotAreas) {
    const key = area.cadastralDistrict;
    if (!plotsMap.has(key)) {
      plotsMap.set(key, []);
    }
    const plots = plotsMap.get(key)!;
    if (!plots.includes(area.plotNumber)) {
      plots.push(area.plotNumber);
    }
  }

  const parts: string[] = [];
  for (const [district, plots] of plotsMap) {
    parts.push(`${district}: ${plots.join(", ")}`);
  }

  return parts.join("; ") || "-";
}

/**
 * Formatiert die Flaechentypen
 */
function formatAreaTypes(lease: LeaseCalculationResult): string {
  const types: string[] = [];
  if (lease.weaCount > 0) types.push(`${lease.weaCount}x WEA`);
  if (lease.poolCount > 0) types.push(`${lease.poolCount}x Pool`);
  if (lease.otherCount > 0) types.push(`${lease.otherCount}x Sonstige`);
  return types.join(", ") || "-";
}

// ===========================================
// MAIN TEMPLATE
// ===========================================

export function SettlementReportTemplate({
  data,
  template,
  letterhead,
}: SettlementReportTemplateProps) {
  const { calculation, periodStatus, notes, tenant } = data;
  const layout = template.layout;

  // Bankdaten aus Tenant
  const bankDetails = tenant
    ? {
        bankName: tenant.bankName ?? undefined,
        iban: tenant.iban ?? undefined,
        bic: tenant.bic ?? undefined,
      }
    : undefined;

  // When a background PDF is configured, the letterhead already contains
  // header/footer graphics, so we skip rendering them and leave the page
  // background transparent so the letterhead shows through.
  const hasBackground = !!letterhead.backgroundPdfKey;

  return (
    <Document>
      <Page
        size="A4"
        style={[
          styles.page,
          hasBackground ? {} : { backgroundColor: "#FFFFFF" },
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
        {/* Header - skip when background PDF provides it */}
        {!hasBackground && (
          <Header
            letterhead={letterhead}
            layout={layout}
            companyName={tenant?.name ?? undefined}
          />
        )}

        {/* Hauptinhalt */}
        <View style={styles.content}>
          {/* Titel */}
          <Text style={styles.title}>Pachtabrechnung {calculation.year}</Text>
          <Text style={styles.subtitle}>
            {calculation.parkName} - Status: {translateStatus(periodStatus)}
          </Text>

          {/* Info-Box */}
          <View style={styles.infoBox}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Abrechnungsjahr:</Text>
              <Text style={styles.infoValue}>{calculation.year}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Berechnet am:</Text>
              <Text style={styles.infoValue}>{formatDate(calculation.calculatedAt)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Gesamtertrag:</Text>
              <Text style={styles.infoValue}>{formatCurrency(calculation.totalRevenue)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Anzahl Verpachter:</Text>
              <Text style={styles.infoValue}>{calculation.totals.leaseCount}</Text>
            </View>
          </View>

          {/* Konfiguration */}
          <View style={styles.configBox}>
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>Mindestpacht/WEA</Text>
              <Text style={styles.configValue}>
                {calculation.minimumRentPerTurbine
                  ? formatCurrency(calculation.minimumRentPerTurbine)
                  : "-"}
              </Text>
            </View>
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>WEA-Anteil</Text>
              <Text style={styles.configValue}>
                {calculation.weaSharePercentage
                  ? formatPercent(calculation.weaSharePercentage)
                  : "-"}
              </Text>
            </View>
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>Pool-Anteil</Text>
              <Text style={styles.configValue}>
                {calculation.poolSharePercentage
                  ? formatPercent(calculation.poolSharePercentage)
                  : "-"}
              </Text>
            </View>
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>Vergütungsphase</Text>
              <Text style={styles.configValue}>
                {calculation.revenuePhasePercentage
                  ? formatPercent(calculation.revenuePhasePercentage)
                  : "-"}
              </Text>
            </View>
          </View>

          {/* Tabelle */}
          <View style={styles.table}>
            {/* Tabellenkopf */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colLessor]}>Verpachter</Text>
              <Text style={[styles.tableHeaderText, styles.colPlots]}>Flurstuecke</Text>
              <Text style={[styles.tableHeaderText, styles.colMinRent]}>Mindestpacht</Text>
              <Text style={[styles.tableHeaderText, styles.colRevShare]}>Erlösanteil</Text>
              <Text style={[styles.tableHeaderText, styles.colPayment]}>Auszahlung</Text>
              <Text style={[styles.tableHeaderText, styles.colDiff]}>Differenz</Text>
            </View>

            {/* Tabellenzeilen */}
            {calculation.leases.map((lease, index) => (
              <View
                key={lease.leaseId}
                style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
              >
                <View style={styles.colLessor}>
                  <Text style={styles.tableCell}>{lease.lessorName}</Text>
                  <Text style={styles.tableCellSmall}>{formatAreaTypes(lease)}</Text>
                </View>
                <View style={styles.colPlots}>
                  <Text style={styles.tableCellSmall}>{formatPlots(lease)}</Text>
                </View>
                <Text style={[styles.tableCellRight, styles.colMinRent]}>
                  {formatCurrency(lease.totalMinimumRent)}
                </Text>
                <Text style={[styles.tableCellRight, styles.colRevShare]}>
                  {formatCurrency(lease.totalRevenueShare)}
                </Text>
                <Text style={[styles.tableCellRight, styles.colPayment]}>
                  {formatCurrency(lease.totalPayment)}
                </Text>
                <Text
                  style={[
                    styles.tableCellRight,
                    styles.colDiff,
                    lease.totalDifference > 0
                      ? styles.positiveValue
                      : lease.totalDifference < 0
                      ? styles.negativeValue
                      : {},
                  ]}
                >
                  {lease.totalDifference >= 0 ? "+" : ""}
                  {formatCurrency(lease.totalDifference)}
                </Text>
              </View>
            ))}

            {/* Summenzeile */}
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryText, styles.colLessor]}>GESAMT</Text>
              <Text style={[styles.summaryText, styles.colPlots]}>
                {calculation.totals.leaseCount} Verpachter
              </Text>
              <Text style={[styles.summaryTextRight, styles.colMinRent]}>
                {formatCurrency(calculation.totals.totalMinimumRent)}
              </Text>
              <Text style={[styles.summaryTextRight, styles.colRevShare]}>
                {formatCurrency(calculation.totals.totalRevenueShare)}
              </Text>
              <Text style={[styles.summaryTextRight, styles.colPayment]}>
                {formatCurrency(calculation.totals.totalPayment)}
              </Text>
              <Text style={[styles.summaryTextRight, styles.colDiff]}>
                {calculation.totals.totalDifference >= 0 ? "+" : ""}
                {formatCurrency(calculation.totals.totalDifference)}
              </Text>
            </View>
          </View>

          {/* Legende */}
          <View style={styles.legend}>
            <Text style={styles.legendTitle}>Legende</Text>
            <Text style={styles.legendItem}>
              Mindestpacht: Vertraglich vereinbarte Mindestzahlung unabhängig vom Ertrag
            </Text>
            <Text style={styles.legendItem}>
              Erlösanteil: Berechneter Anteil am Jahresertrag des Windparks
            </Text>
            <Text style={styles.legendItem}>
              Auszahlung: MAX(Mindestpacht, Erlösanteil) - der hoehere Wert wird ausgezahlt
            </Text>
            <Text style={styles.legendItem}>
              Differenz: Erlösanteil minus Mindestpacht (positiv = Nachzahlung über Mindestpacht)
            </Text>
          </View>

          {/* Notizen */}
          {notes && (
            <View style={styles.notesSection}>
              <Text style={styles.notesTitle}>Anmerkungen</Text>
              <Text style={styles.notesText}>{notes}</Text>
            </View>
          )}

          {/* Unterschriftenbereich */}
          <View style={styles.signatureSection}>
            <Text style={styles.signatureTitle}>Freigabe</Text>
            <View style={styles.signatureRow}>
              <View style={styles.signatureBlock}>
                <Text style={styles.signatureDate}>Datum: _________________</Text>
                <View style={styles.signatureLine}>
                  <Text style={styles.signatureLabel}>Erstellt durch</Text>
                </View>
              </View>
              <View style={styles.signatureBlock}>
                <Text style={styles.signatureDate}>Datum: _________________</Text>
                <View style={styles.signatureLine}>
                  <Text style={styles.signatureLabel}>Geprüft durch Geschaeftsführung</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Footer - skip when background PDF provides it */}
        {!hasBackground && (
          <Footer
            letterhead={letterhead}
            layout={layout}
            bankDetails={bankDetails}
            customText={template.footerText}
          />
        )}

        {/* Seitenzahl */}
        <PageNumber />
      </Page>
    </Document>
  );
}

// ===========================================
// HELPERS
// ===========================================

function translateStatus(status: string): string {
  switch (status) {
    case "OPEN":
      return "Offen";
    case "IN_PROGRESS":
      return "In Bearbeitung";
    case "CLOSED":
      return "Abgeschlossen";
    default:
      return status;
  }
}
