import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ResolvedLetterhead, ResolvedTemplate } from "../utils/templateResolver";
import type { DocumentTemplateLayout } from "@/types/pdf";
import { BaseDocument } from "./BaseDocument";
import { formatDate, formatPercent } from "../utils/formatters";

const styles = StyleSheet.create({
  // Meta-Section
  metaSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  metaBlock: {
    alignItems: "flex-end",
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  metaLabel: {
    fontSize: 9,
    color: "#666666",
    width: 100,
    textAlign: "right",
    marginRight: 10,
  },
  metaValue: {
    fontSize: 9,
    width: 120,
  },

  // Document Title
  documentTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 20,
    marginTop: 10,
    textAlign: "center",
  },

  // Vote Info Section
  voteInfoSection: {
    marginBottom: 20,
    padding: 12,
    backgroundColor: "#F8F9FA",
    borderRadius: 4,
  },
  voteTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  voteDescription: {
    fontSize: 9,
    lineHeight: 1.5,
    color: "#333333",
    marginBottom: 8,
  },
  voteDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  voteDetailItem: {
    flexDirection: "row",
  },
  voteDetailLabel: {
    fontSize: 8,
    color: "#666666",
    marginRight: 4,
  },
  voteDetailValue: {
    fontSize: 8,
    fontWeight: "bold",
  },

  // Options Section (for Multiple Choice)
  optionsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingBottom: 4,
  },
  optionsList: {
    paddingLeft: 15,
  },
  optionItem: {
    fontSize: 9,
    marginBottom: 3,
  },

  // Results Section
  resultsSection: {
    marginBottom: 20,
  },
  resultsGrid: {
    flexDirection: "row",
    gap: 20,
  },
  resultsColumn: {
    flex: 1,
  },
  columnTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#374151",
  },

  // Result Bars
  resultRow: {
    marginBottom: 8,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  resultLabel: {
    fontSize: 9,
  },
  resultValue: {
    fontSize: 9,
    fontWeight: "bold",
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 4,
  },
  progressBarYes: {
    backgroundColor: "#22C55E",
  },
  progressBarNo: {
    backgroundColor: "#EF4444",
  },
  progressBarAbstain: {
    backgroundColor: "#9CA3AF",
  },
  progressBarDefault: {
    backgroundColor: "#335E99",
  },

  // Quorum Section
  quorumSection: {
    marginBottom: 20,
    padding: 12,
    backgroundColor: "#F8F9FA",
    borderRadius: 4,
  },
  quorumTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 8,
  },
  quorumGrid: {
    flexDirection: "row",
    gap: 30,
  },
  quorumItem: {
    flex: 1,
  },
  quorumLabel: {
    fontSize: 8,
    color: "#666666",
    marginBottom: 2,
  },
  quorumValue: {
    fontSize: 12,
    fontWeight: "bold",
  },
  quorumMet: {
    color: "#22C55E",
  },
  quorumNotMet: {
    color: "#EF4444",
  },

  // Decision Section
  decisionSection: {
    marginBottom: 25,
    padding: 15,
    borderRadius: 4,
    borderWidth: 2,
  },
  decisionApproved: {
    backgroundColor: "#DCFCE7",
    borderColor: "#22C55E",
  },
  decisionRejected: {
    backgroundColor: "#FEE2E2",
    borderColor: "#EF4444",
  },
  decisionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 4,
  },
  decisionApprovedText: {
    color: "#15803D",
  },
  decisionRejectedText: {
    color: "#DC2626",
  },
  decisionSubtext: {
    fontSize: 9,
    textAlign: "center",
    color: "#666666",
  },

  // Statistics Table
  statsSection: {
    marginBottom: 20,
  },
  statsTable: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 4,
  },
  statsRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  statsRowLast: {
    borderBottomWidth: 0,
  },
  statsCell: {
    flex: 1,
    padding: 8,
    fontSize: 9,
  },
  statsCellHeader: {
    backgroundColor: "#F3F4F6",
    fontWeight: "bold",
  },
  statsCellValue: {
    textAlign: "right",
  },

  // Signature Section
  signatureSection: {
    marginTop: 40,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 30,
  },
  signatureBlock: {
    width: "40%",
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: "#333333",
    marginBottom: 5,
    paddingTop: 5,
  },
  signatureLabel: {
    fontSize: 8,
    color: "#666666",
    textAlign: "center",
  },
  signatureDate: {
    fontSize: 9,
    marginBottom: 10,
  },
});

// Types for Vote Result PDF
export interface VoteResultPdfData {
  // Vote Details
  voteId: string;
  title: string;
  description: string | null;
  voteType: string;
  options: string[];
  startDate: Date;
  endDate: Date;
  quorumPercentage: number | null;
  requiresCapitalMajority: boolean;
  status: "DRAFT" | "ACTIVE" | "CLOSED";

  // Fund Info
  fund: {
    name: string;
    legalForm: string | null;
  };

  // Statistics
  stats: {
    totalEligible: number;
    totalResponses: number;
    participationRate: string;
    capitalParticipation: string;
    quorumMet: boolean;
    isApproved: boolean | null;
  };

  // Results
  results: {
    byHead: { option: string; count: number; percentage: string }[];
    byCapital: { option: string; capitalWeight: string; percentage: string }[];
  };

  // Meta
  createdBy: string | null;
  createdAt: Date;
  exportedAt: Date;

  // Optional: Tenant info for letterhead
  tenant?: {
    name: string | null;
  };
}

interface VoteResultTemplateProps {
  data: VoteResultPdfData;
  template: ResolvedTemplate;
  letterhead: ResolvedLetterhead;
  showSignatureLine?: boolean;
}

function getProgressBarStyle(option: string) {
  switch (option.toLowerCase()) {
    case "ja":
      return styles.progressBarYes;
    case "nein":
      return styles.progressBarNo;
    case "enthaltung":
      return styles.progressBarAbstain;
    default:
      return styles.progressBarDefault;
  }
}

export function VoteResultTemplate({
  data,
  template,
  letterhead,
  showSignatureLine = true,
}: VoteResultTemplateProps) {
  const layout = template.layout;

  return (
    <BaseDocument
      letterhead={letterhead}
      layout={layout}
      companyName={data.tenant?.name ?? undefined}
    >
      {/* Document Title */}
      <Text style={styles.documentTitle}>Abstimmungsergebnis</Text>

      {/* Meta Information (right-aligned) */}
      <View style={styles.metaSection}>
        <View>{/* Placeholder left */}</View>
        <View style={styles.metaBlock}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Gesellschaft:</Text>
            <Text style={styles.metaValue}>
              {data.fund.name}
              {data.fund.legalForm ? ` ${data.fund.legalForm}` : ""}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Abstimmungszeitraum:</Text>
            <Text style={styles.metaValue}>
              {formatDate(data.startDate)} - {formatDate(data.endDate)}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Exportiert am:</Text>
            <Text style={styles.metaValue}>{formatDate(data.exportedAt)}</Text>
          </View>
        </View>
      </View>

      {/* Vote Info Section */}
      <View style={styles.voteInfoSection}>
        <Text style={styles.voteTitle}>{data.title}</Text>
        {data.description && (
          <Text style={styles.voteDescription}>{data.description}</Text>
        )}
        <View style={styles.voteDetails}>
          <View style={styles.voteDetailItem}>
            <Text style={styles.voteDetailLabel}>Abstimmungsart:</Text>
            <Text style={styles.voteDetailValue}>
              {data.voteType === "simple" ? "Einfache Abstimmung" : "Multiple Choice"}
            </Text>
          </View>
          <View style={styles.voteDetailItem}>
            <Text style={styles.voteDetailLabel}>Mehrheitserfordernis:</Text>
            <Text style={styles.voteDetailValue}>
              {data.requiresCapitalMajority ? "Nach Kapitalanteilen" : "Nach Koepfen"}
            </Text>
          </View>
        </View>
      </View>

      {/* Options (for Multiple Choice) */}
      {data.voteType === "multiple" && data.options.length > 3 && (
        <View style={styles.optionsSection}>
          <Text style={styles.sectionTitle}>Abstimmungsoptionen</Text>
          <View style={styles.optionsList}>
            {data.options.map((option, index) => (
              <Text key={index} style={styles.optionItem}>
                {index + 1}. {option}
              </Text>
            ))}
          </View>
        </View>
      )}

      {/* Results Section */}
      <View style={styles.resultsSection}>
        <Text style={styles.sectionTitle}>Abstimmungsergebnis</Text>
        <View style={styles.resultsGrid}>
          {/* Results by Head */}
          <View style={styles.resultsColumn}>
            <Text style={styles.columnTitle}>Nach Koepfen</Text>
            {data.results.byHead.map((result, index) => (
              <View key={index} style={styles.resultRow}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultLabel}>{result.option}</Text>
                  <Text style={styles.resultValue}>
                    {result.count} ({result.percentage}%)
                  </Text>
                </View>
                <View style={styles.progressBarContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      getProgressBarStyle(result.option),
                      { width: `${Math.min(parseFloat(result.percentage), 100)}%` },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>

          {/* Results by Capital */}
          <View style={styles.resultsColumn}>
            <Text style={styles.columnTitle}>Nach Kapitalanteil</Text>
            {data.results.byCapital.map((result, index) => (
              <View key={index} style={styles.resultRow}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultLabel}>{result.option}</Text>
                  <Text style={styles.resultValue}>
                    {result.capitalWeight}% ({result.percentage}%)
                  </Text>
                </View>
                <View style={styles.progressBarContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      getProgressBarStyle(result.option),
                      { width: `${Math.min(parseFloat(result.percentage), 100)}%` },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Quorum Section */}
      <View style={styles.quorumSection}>
        <Text style={styles.quorumTitle}>Quorum-Status</Text>
        <View style={styles.quorumGrid}>
          <View style={styles.quorumItem}>
            <Text style={styles.quorumLabel}>Erforderliches Quorum</Text>
            <Text style={styles.quorumValue}>
              {data.quorumPercentage ? `${data.quorumPercentage}%` : "Kein Quorum erforderlich"}
            </Text>
          </View>
          <View style={styles.quorumItem}>
            <Text style={styles.quorumLabel}>Erreichte Beteiligung</Text>
            <Text style={styles.quorumValue}>{data.stats.capitalParticipation}%</Text>
          </View>
          <View style={styles.quorumItem}>
            <Text style={styles.quorumLabel}>Status</Text>
            <Text
              style={[
                styles.quorumValue,
                data.stats.quorumMet ? styles.quorumMet : styles.quorumNotMet,
              ]}
            >
              {data.stats.quorumMet ? "Erreicht" : "Nicht erreicht"}
            </Text>
          </View>
        </View>
      </View>

      {/* Decision Section */}
      {data.stats.isApproved !== null && (
        <View
          style={[
            styles.decisionSection,
            data.stats.isApproved ? styles.decisionApproved : styles.decisionRejected,
          ]}
        >
          <Text
            style={[
              styles.decisionTitle,
              data.stats.isApproved ? styles.decisionApprovedText : styles.decisionRejectedText,
            ]}
          >
            {data.stats.isApproved ? "BESCHLUSS ANGENOMMEN" : "BESCHLUSS ABGELEHNT"}
          </Text>
          <Text style={styles.decisionSubtext}>
            {data.stats.isApproved
              ? "Die erforderliche Mehrheit wurde erreicht."
              : data.stats.quorumMet
              ? "Die erforderliche Mehrheit wurde nicht erreicht."
              : "Das erforderliche Quorum wurde nicht erreicht."}
          </Text>
        </View>
      )}

      {/* Statistics Table */}
      <View style={styles.statsSection}>
        <Text style={styles.sectionTitle}>Beteiligungsstatistik</Text>
        <View style={styles.statsTable}>
          <View style={styles.statsRow}>
            <Text style={[styles.statsCell, styles.statsCellHeader]}>Kennzahl</Text>
            <Text style={[styles.statsCell, styles.statsCellHeader, styles.statsCellValue]}>
              Wert
            </Text>
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.statsCell}>Stimmberechtigte Gesellschafter</Text>
            <Text style={[styles.statsCell, styles.statsCellValue]}>
              {data.stats.totalEligible}
            </Text>
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.statsCell}>Abgegebene Stimmen</Text>
            <Text style={[styles.statsCell, styles.statsCellValue]}>
              {data.stats.totalResponses}
            </Text>
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.statsCell}>Beteiligung nach Koepfen</Text>
            <Text style={[styles.statsCell, styles.statsCellValue]}>
              {data.stats.participationRate}%
            </Text>
          </View>
          <View style={[styles.statsRow, styles.statsRowLast]}>
            <Text style={styles.statsCell}>Beteiligung nach Kapital</Text>
            <Text style={[styles.statsCell, styles.statsCellValue]}>
              {data.stats.capitalParticipation}%
            </Text>
          </View>
        </View>
      </View>

      {/* Signature Section */}
      {showSignatureLine && (
        <View style={styles.signatureSection}>
          <Text style={styles.signatureDate}>
            {data.fund.name}, den ____________________
          </Text>
          <View style={styles.signatureRow}>
            <View style={styles.signatureBlock}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Geschaeftsführung</Text>
            </View>
            <View style={styles.signatureBlock}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Protokollfuehrer</Text>
            </View>
          </View>
        </View>
      )}
    </BaseDocument>
  );
}
