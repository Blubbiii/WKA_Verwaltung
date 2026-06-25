/**
 * F-3 Sprint 4: PDF-Template für KapESt-Beiblatt (§44a EStG).
 *
 * Pro Ausschüttung: Tabelle aller Gesellschafter mit Brutto-Ausschüttung,
 * Freibetrag, bemessungsgrundlage, KapESt (25%), SolZ (5,5% auf KapESt),
 * Kirchensteuer und Netto-Auszahlung. Footer enthält Hinweis auf §45a EStG.
 *
 * Format orientiert sich am GuvTemplate (Steuerberater-Standardformat).
 */

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { LOCALE_DE } from "@/lib/format";

export interface KapEStPdfRow {
  shareholderName: string;
  shareholderId: string;
  grossAmount: number;
  freibetragApplied: number;
  taxableAmount: number;
  kapestAmount: number;
  soliAmount: number;
  kirchensteuerAmount: number;
  totalDeducted: number;
  netPayout: number;
}

export interface KapEStPdfTotals {
  grossTotal: number;
  freibetragTotal: number;
  taxableTotal: number;
  kapestTotal: number;
  soliTotal: number;
  kirchensteuerTotal: number;
  totalDeducted: number;
  netPayoutTotal: number;
}

export interface KapEStPdfData {
  companyName: string;
  fundName: string;
  distributionNumber: string;
  distributionDate: string;
  grossTotal: number;
  kapestRate: number;
  soliRate: number;
  kirchensteuerRate: number;
  freibetragPerShareholder: number;
  rows: KapEStPdfRow[];
  totals: KapEStPdfTotals;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8,
    padding: 24,
    color: "#222",
  },
  header: { marginBottom: 12 },
  title: { fontSize: 15, fontWeight: "bold", marginBottom: 3 },
  subtitle: { fontSize: 9, color: "#555" },
  metaBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#333",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    paddingBottom: 6,
    marginBottom: 8,
  },
  metaItem: { flexDirection: "column" },
  metaLabel: { color: "#777", fontSize: 7 },
  metaValue: { fontWeight: "bold", fontSize: 9 },
  settingsBlock: {
    backgroundColor: "#f8f8f8",
    padding: 6,
    marginBottom: 10,
    fontSize: 7,
    color: "#444",
    flexDirection: "row",
    gap: 16,
  },
  table: { borderTopWidth: 1, borderTopColor: "#333" },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    paddingVertical: 4,
    fontWeight: "bold",
    fontSize: 7,
    backgroundColor: "#fafafa",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    minHeight: 14,
  },
  totalsRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: "#333",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    backgroundColor: "#f5f5f5",
    fontWeight: "bold",
    fontSize: 8,
  },
  colName: { width: "20%", paddingHorizontal: 3 },
  colNum: { width: "10%", paddingHorizontal: 3, textAlign: "right" },
  footerNote: {
    marginTop: 14,
    padding: 8,
    backgroundColor: "#fff8e1",
    borderLeftWidth: 3,
    borderLeftColor: "#f59e0b",
    fontSize: 8,
    color: "#92400e",
  },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 24,
    right: 24,
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

function fmtPct(n: number): string {
  return (n * 100).toLocaleString(LOCALE_DE, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(LOCALE_DE);
}

export function KapEStTemplate({ data }: { data: KapEStPdfData }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Kapitalertragsteuer-Beiblatt §44a EStG</Text>
          <Text style={styles.subtitle}>
            {data.companyName} — Beiblatt zur Anmeldung gem. §45a EStG
          </Text>
        </View>

        <View style={styles.metaBlock}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Ausschüttung-Nr.</Text>
            <Text style={styles.metaValue}>{data.distributionNumber}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Datum</Text>
            <Text style={styles.metaValue}>{fmtDate(data.distributionDate)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Gesellschaft</Text>
            <Text style={styles.metaValue}>{data.fundName}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Brutto-Gesamt</Text>
            <Text style={styles.metaValue}>{fmt(data.grossTotal)} EUR</Text>
          </View>
        </View>

        <View style={styles.settingsBlock}>
          <Text>KapESt-Satz: {fmtPct(data.kapestRate)} %</Text>
          <Text>SolZ-Satz: {fmtPct(data.soliRate)} % (auf KapESt)</Text>
          <Text>
            KiSt-Satz: {fmtPct(data.kirchensteuerRate)} % (auf KapESt)
          </Text>
          <Text>
            Freibetrag/Gesellschafter:{" "}
            {fmt(data.freibetragPerShareholder)} EUR
          </Text>
        </View>

        <View style={styles.table}>
          <View style={styles.headerRow}>
            <Text style={styles.colName}>Gesellschafter</Text>
            <Text style={styles.colNum}>Brutto</Text>
            <Text style={styles.colNum}>Freibetrag</Text>
            <Text style={styles.colNum}>Bemessung</Text>
            <Text style={styles.colNum}>KapESt 25%</Text>
            <Text style={styles.colNum}>SolZ 5,5%</Text>
            <Text style={styles.colNum}>KiSt</Text>
            <Text style={styles.colNum}>Abzug ges.</Text>
            <Text style={styles.colNum}>Netto</Text>
          </View>

          {data.rows.map((r, i) => (
            <View key={i} style={styles.row} wrap={false}>
              <Text style={styles.colName}>{r.shareholderName}</Text>
              <Text style={styles.colNum}>{fmt(r.grossAmount)}</Text>
              <Text style={styles.colNum}>{fmt(r.freibetragApplied)}</Text>
              <Text style={styles.colNum}>{fmt(r.taxableAmount)}</Text>
              <Text style={styles.colNum}>{fmt(r.kapestAmount)}</Text>
              <Text style={styles.colNum}>{fmt(r.soliAmount)}</Text>
              <Text style={styles.colNum}>{fmt(r.kirchensteuerAmount)}</Text>
              <Text style={styles.colNum}>{fmt(r.totalDeducted)}</Text>
              <Text style={styles.colNum}>{fmt(r.netPayout)}</Text>
            </View>
          ))}

          <View style={styles.totalsRow}>
            <Text style={styles.colName}>SUMME</Text>
            <Text style={styles.colNum}>{fmt(data.totals.grossTotal)}</Text>
            <Text style={styles.colNum}>{fmt(data.totals.freibetragTotal)}</Text>
            <Text style={styles.colNum}>{fmt(data.totals.taxableTotal)}</Text>
            <Text style={styles.colNum}>{fmt(data.totals.kapestTotal)}</Text>
            <Text style={styles.colNum}>{fmt(data.totals.soliTotal)}</Text>
            <Text style={styles.colNum}>
              {fmt(data.totals.kirchensteuerTotal)}
            </Text>
            <Text style={styles.colNum}>{fmt(data.totals.totalDeducted)}</Text>
            <Text style={styles.colNum}>{fmt(data.totals.netPayoutTotal)}</Text>
          </View>
        </View>

        <View style={styles.footerNote}>
          <Text>
            Hinweis: Anmeldung der einbehaltenen Kapitalertragsteuer gem.
            §45a EStG beim Betriebsstätten-Finanzamt erforderlich (bis zum 10.
            des auf den Zufluss folgenden Monats). Die Werte dienen als
            Beiblatt — die tatsächliche Buchung sowie die Abführung erfolgen
            manuell durch den Buchhalter. KapESt-Pflicht besteht nur bei
            Ausschüttungen an natürliche Personen.
          </Text>
        </View>

        <Text style={styles.footer} fixed>
          Erzeugt mit WindparkManager · {new Date().toLocaleDateString(LOCALE_DE)}
        </Text>
      </Page>
    </Document>
  );
}
