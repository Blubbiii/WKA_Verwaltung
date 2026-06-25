/**
 * F-1 Sprint 4: PDF-Template für GuV mit Vorjahresvergleich.
 * HGB §275 Gesamtkostenverfahren — Standard Steuerberater-Format.
 */

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { LOCALE_DE } from "@/lib/format";

export interface GuvPdfLine {
  position: number | string;
  label: string;
  currentPeriod: number;
  previousPeriod: number;
  isSummary?: boolean;
  indent?: number;
}

export interface GuvPdfData {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  previousPeriodStart?: string;
  previousPeriodEnd?: string;
  lines: GuvPdfLine[];
  netIncome: number;
  previousNetIncome: number;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    padding: 28,
    color: "#222",
  },
  header: { marginBottom: 14 },
  title: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 9, color: "#555" },
  metaInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#555",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    paddingBottom: 6,
    marginBottom: 10,
  },
  table: { borderTopWidth: 1, borderTopColor: "#333" },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    paddingVertical: 4,
    fontWeight: "bold",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    minHeight: 14,
  },
  summaryRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: "#333",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    backgroundColor: "#f5f5f5",
    fontWeight: "bold",
    minHeight: 16,
  },
  colPos: { width: 30, paddingHorizontal: 4 },
  colLabel: { flex: 1, paddingHorizontal: 4 },
  colNum: { width: 80, paddingHorizontal: 4, textAlign: "right" },
  finalRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderTopWidth: 2,
    borderTopColor: "#000",
    marginTop: 8,
    fontWeight: "bold",
    fontSize: 11,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 28,
    right: 28,
    fontSize: 7,
    color: "#888",
    textAlign: "center",
  },
});

function fmt(n: number): string {
  return n.toLocaleString(LOCALE_DE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return `${start} – ${end}`;
  return `${s.toLocaleDateString(LOCALE_DE)} – ${e.toLocaleDateString(LOCALE_DE)}`;
}

export function GuvTemplate({ data }: { data: GuvPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Gewinn- und Verlustrechnung</Text>
          <Text style={styles.subtitle}>
            {data.companyName} — Gesamtkostenverfahren (§275 HGB)
          </Text>
        </View>

        <View style={styles.metaInfo}>
          <Text>
            Berichtsperiode: {fmtDateRange(data.periodStart, data.periodEnd)}
          </Text>
          {data.previousPeriodStart && data.previousPeriodEnd && (
            <Text>
              Vorperiode:{" "}
              {fmtDateRange(data.previousPeriodStart, data.previousPeriodEnd)}
            </Text>
          )}
        </View>

        <View style={styles.table}>
          <View style={styles.headerRow}>
            <Text style={styles.colPos}>Pos.</Text>
            <Text style={styles.colLabel}>Bezeichnung</Text>
            <Text style={styles.colNum}>Akt. Periode</Text>
            <Text style={styles.colNum}>Vorperiode</Text>
          </View>

          {data.lines.map((line, i) => (
            <View
              key={i}
              style={line.isSummary ? styles.summaryRow : styles.row}
            >
              <Text style={styles.colPos}>{line.position || ""}</Text>
              <Text
                style={[
                  styles.colLabel,
                  { paddingLeft: line.indent ? 12 + line.indent * 8 : 4 },
                ]}
              >
                {line.label}
              </Text>
              <Text style={styles.colNum}>{fmt(line.currentPeriod)}</Text>
              <Text style={styles.colNum}>{fmt(line.previousPeriod)}</Text>
            </View>
          ))}

          <View style={styles.finalRow}>
            <Text style={styles.colPos}></Text>
            <Text style={styles.colLabel}>
              Jahresüberschuss / Jahresfehlbetrag
            </Text>
            <Text style={styles.colNum}>{fmt(data.netIncome)}</Text>
            <Text style={styles.colNum}>{fmt(data.previousNetIncome)}</Text>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          Erzeugt mit WindparkManager · {new Date().toLocaleDateString(LOCALE_DE)}
        </Text>
      </Page>
    </Document>
  );
}
