import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { formatNumber } from "../../utils/formatters";
import type {
  ReactivePowerPoint,
  ReactivePowerSummary,
} from "@/types/analytics";

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    marginBottom: 15,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#000000",
    paddingBottom: 2,
  },
  kpiRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    padding: 6,
    backgroundColor: "#F5F7FA",
    borderRadius: 3,
  },
  kpiBox: {
    flex: 1,
    paddingHorizontal: 4,
  },
  kpiLabel: {
    fontSize: 7,
    color: "#666666",
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 10,
    fontWeight: "bold",
  },
  kpiSub: {
    fontSize: 7,
    color: "#888888",
    marginTop: 1,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#000000",
    paddingBottom: 3,
    marginBottom: 3,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 2,
    borderBottomWidth: 0.25,
    borderBottomColor: "#DDDDDD",
  },
  colMonth: { width: "20%", fontSize: 8 },
  colQ: { width: "25%", fontSize: 8, textAlign: "right" },
  colCosPhi: { width: "20%", fontSize: 8, textAlign: "right" },
  colFreq: { width: "20%", fontSize: 8, textAlign: "right" },
  colCompliance: { width: "15%", fontSize: 8, textAlign: "right" },
  headerText: { fontWeight: "bold" },
  ampelRow: {
    flexDirection: "row",
    marginTop: 8,
    padding: 4,
    borderRadius: 3,
  },
  ampelDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  ampelText: {
    fontSize: 8,
  },
});

// =============================================================================
// Types
// =============================================================================

interface ReactivePowerSectionProps {
  timeSeries: ReactivePowerPoint[];
  summary: ReactivePowerSummary;
  title?: string;
}

interface MonthlyAgg {
  month: number;
  qSum: number;     // sum of daily-mean Var * 24 = daily VArh
  qCount: number;
  cosPhiSum: number;
  cosPhiCount: number;
  freqSum: number;
  freqCount: number;
  compliantDays: number;
  totalDays: number;
}

// =============================================================================
// Helpers
// =============================================================================

const MONTH_LABELS_DE = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

function aggregateMonthly(points: ReactivePowerPoint[]): MonthlyAgg[] {
  const map = new Map<number, MonthlyAgg>();
  for (const p of points) {
    const d = new Date(p.bucket);
    if (isNaN(d.getTime())) continue;
    const month = d.getUTCMonth() + 1;
    const agg = map.get(month) || {
      month,
      qSum: 0,
      qCount: 0,
      cosPhiSum: 0,
      cosPhiCount: 0,
      freqSum: 0,
      freqCount: 0,
      compliantDays: 0,
      totalDays: 0,
    };
    // Daily-mean Var * 24h = VArh (energy that day)
    agg.qSum += p.meanReactiveVar * 24;
    agg.qCount += 1;
    if (p.meanCosPhi !== 0) {
      agg.cosPhiSum += p.meanCosPhi;
      agg.cosPhiCount += 1;
    }
    if (p.meanFrequencyHz !== 0) {
      agg.freqSum += p.meanFrequencyHz;
      agg.freqCount += 1;
    }
    // Fully-compliant day = both cos-phi and freq out-of-range % below 1%
    if (p.cosPhiOutOfRangePct < 1 && p.frequencyOutOfRangePct < 1) {
      agg.compliantDays += 1;
    }
    agg.totalDays += 1;
    map.set(month, agg);
  }
  return Array.from(map.values()).sort((a, b) => a.month - b.month);
}

function ampelColorFor(pct: number): string {
  if (pct >= 99) return "#22c55e";
  if (pct >= 95) return "#f59e0b";
  return "#ef4444";
}

// =============================================================================
// Component
// =============================================================================

export function ReactivePowerSection({
  timeSeries,
  summary,
  title = "Blindleistung & Netzqualität",
}: ReactivePowerSectionProps) {
  const monthly = aggregateMonthly(timeSeries);
  const cosPhiColor = ampelColorFor(summary.cosPhiComplianceRate);
  const freqColor = ampelColorFor(summary.freqComplianceRate);
  const overallCompliance = Math.min(
    summary.cosPhiComplianceRate,
    summary.freqComplianceRate,
  );
  const overallColor = ampelColorFor(overallCompliance);
  const overallStatus =
    overallCompliance >= 99
      ? "Compliance erfüllt"
      : overallCompliance >= 95
        ? "Compliance grenzwertig"
        : "Compliance verletzt";

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeader}>{title}</Text>

      {/* KPI Row */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Blindenergie gesamt</Text>
          <Text style={styles.kpiValue}>
            {formatNumber(summary.totalReactiveEnergyMWh, 2)} MVArh
          </Text>
          <Text style={styles.kpiSub}>
            ind. {formatNumber(summary.inductiveReactiveEnergyMWh, 2)} / kap.{" "}
            {formatNumber(summary.capacitiveReactiveEnergyMWh, 2)}
          </Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>cos φ Compliance</Text>
          <Text style={styles.kpiValue}>
            {formatNumber(summary.cosPhiComplianceRate, 1)} %
          </Text>
          <Text style={styles.kpiSub}>
            Ø {formatNumber(summary.meanCosPhiOverall, 3)}
          </Text>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Frequenz Compliance</Text>
          <Text style={styles.kpiValue}>
            {formatNumber(summary.freqComplianceRate, 1)} %
          </Text>
          <Text style={styles.kpiSub}>Ziel: 50 Hz ± 0,2</Text>
        </View>
      </View>

      {/* Monthly table */}
      {monthly.length > 0 && (
        <>
          <View style={styles.tableHeader}>
            <Text style={[styles.colMonth, styles.headerText]}>Monat</Text>
            <Text style={[styles.colQ, styles.headerText]}>Q-Energie</Text>
            <Text style={[styles.colCosPhi, styles.headerText]}>Ø cos φ</Text>
            <Text style={[styles.colFreq, styles.headerText]}>Ø f (Hz)</Text>
            <Text style={[styles.colCompliance, styles.headerText]}>
              Compl. %
            </Text>
          </View>
          {monthly.map((m) => {
            const qMVArh = m.qSum / 1_000_000;
            const avgCosPhi =
              m.cosPhiCount > 0 ? m.cosPhiSum / m.cosPhiCount : 0;
            const avgFreq = m.freqCount > 0 ? m.freqSum / m.freqCount : 0;
            const complPct =
              m.totalDays > 0 ? (m.compliantDays / m.totalDays) * 100 : 0;
            return (
              <View key={m.month} style={styles.tableRow}>
                <Text style={styles.colMonth}>
                  {MONTH_LABELS_DE[m.month - 1]}
                </Text>
                <Text style={styles.colQ}>
                  {formatNumber(qMVArh, 3)} MVArh
                </Text>
                <Text style={styles.colCosPhi}>
                  {formatNumber(avgCosPhi, 3)}
                </Text>
                <Text style={styles.colFreq}>{formatNumber(avgFreq, 3)}</Text>
                <Text style={styles.colCompliance}>
                  {formatNumber(complPct, 1)}
                </Text>
              </View>
            );
          })}
        </>
      )}

      {/* Grid-Support Ampel */}
      <View
        style={[
          styles.ampelRow,
          { backgroundColor: overallColor + "22" },
        ]}
      >
        <View style={[styles.ampelDot, { backgroundColor: overallColor }]} />
        <Text style={styles.ampelText}>
          Grid-Support: {overallStatus} · cos φ{" "}
          {formatNumber(summary.cosPhiComplianceRate, 1)}% (
          <Text style={{ color: cosPhiColor }}>
            {summary.cosPhiComplianceRate >= 95 ? "OK" : "NOK"}
          </Text>
          ) · f {formatNumber(summary.freqComplianceRate, 1)}% (
          <Text style={{ color: freqColor }}>
            {summary.freqComplianceRate >= 95 ? "OK" : "NOK"}
          </Text>
          )
        </Text>
      </View>
    </View>
  );
}
