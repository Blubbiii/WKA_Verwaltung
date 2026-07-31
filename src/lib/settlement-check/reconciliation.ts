/**
 * Dreiecksabgleich der Netzbetreiber-/Direktvermarkter-Abrechnung.
 *
 * Fehlende Funktion A3 (Audit 2026-07): `EnergySettlement` wird ausschliesslich
 * von Hand erfasst. Es fehlt der Abgleich zwischen abgerechneter Menge, den
 * SCADA-Daten und der erfassten Produktion — sowie zwischen abgerechnetem und
 * erwartetem Preis. Heute werden die Zahlen abgetippt und geglaubt;
 * Fehlabrechnungen werden ohne Gegenrechnung nie entdeckt.
 *
 * ## Warum drei Quellen und nicht zwei
 *
 * Zwei Quellen sagen nur, DASS etwas nicht stimmt. Drei sagen meist auch, WO:
 *
 *   Abrechnung ≠ SCADA, aber SCADA = Produktion  → der Abrechner liegt falsch
 *   Abrechnung = Produktion, aber SCADA weicht ab → Messstelle oder Datenlücke
 *   alle drei verschieden                        → einzeln prüfen
 *
 * Diese Einordnung nimmt der Auswertung die Arbeit ab, die sonst jedes Mal von
 * Hand gemacht wird.
 *
 * ## Der wichtigste Grundsatz
 *
 * Eine fehlende Quelle ist KEIN bestandener Abgleich. Genau der stille
 * Durchlauf ist das, was diese Funktion verhindern soll — sie meldet dann
 * „nicht prüfbar" und nicht „in Ordnung".
 */

export type Severity = "OK" | "INFO" | "WARNING" | "CRITICAL";

export interface ReconciliationFinding {
  /** Maschinenlesbarer Schlüssel, z. B. "quantity.settled_vs_scada". */
  code: string;
  severity: Severity;
  /** Verglichene Werte, damit sich der Befund nachrechnen lässt. */
  left: { label: string; value: number | null; unit: string };
  right: { label: string; value: number | null; unit: string };
  /** Abweichung in Prozent, bezogen auf `right`. Null wenn nicht berechenbar. */
  deviationPct: number | null;
  /** Absolute Abweichung in der Einheit der Werte. */
  deviationAbs: number | null;
  message: string;
}

export interface ReconciliationInput {
  /** Was der Netzbetreiber bzw. Direktvermarkter abgerechnet hat. */
  settled: {
    productionKwh: number | null;
    revenueEur: number | null;
  };
  /** Summe aus den SCADA-Zählerdaten. */
  scadaKwh: number | null;
  /** Summe aus den erfassten Monatsproduktionen. */
  reportedKwh: number | null;
  /** Erwarteter Satz aus EnergyMonthlyRate bzw. Marktwert. */
  expectedRatePerKwh: number | null;
  tolerances: ReconciliationTolerances;
}

export interface ReconciliationTolerances {
  /** Erlaubte relative Abweichung der Mengen in Prozent. */
  quantityPct: number;
  /**
   * Absolute Untergrenze in kWh. Ohne sie schlägt jede Rundungsdifferenz bei
   * kleinen Mengen an: 0,5 % von 200 kWh ist ein Kilowatt.
   */
  quantityFloorKwh: number;
  /** Erlaubte relative Abweichung des Erlöses in Prozent. */
  revenuePct: number;
  /** Absolute Untergrenze in Euro. */
  revenueFloorEur: number;
}

export const DEFAULT_TOLERANCES: ReconciliationTolerances = {
  // 0,5 % deckt die üblichen Unterschiede zwischen Zählwerk und SCADA ab
  // (Eigenverbrauch, Rundung im Zählwerk) ohne echte Fehler zu verstecken.
  quantityPct: 0.5,
  quantityFloorKwh: 100,
  revenuePct: 0.5,
  revenueFloorEur: 50,
};

export interface ReconciliationResult {
  findings: ReconciliationFinding[];
  /** Höchste aufgetretene Schwere — für die Anzeige in einer Liste. */
  worstSeverity: Severity;
  /** Wie viele der drei Mengenquellen vorliegen. */
  availableSources: number;
  /** Abgeleiteter Befund, welche Quelle vermutlich abweicht. */
  interpretation: string | null;
}

const SEVERITY_ORDER: Record<Severity, number> = { OK: 0, INFO: 1, WARNING: 2, CRITICAL: 3 };

export function reconcile(input: ReconciliationInput): ReconciliationResult {
  const { settled, scadaKwh, reportedKwh, expectedRatePerKwh, tolerances } = input;
  const findings: ReconciliationFinding[] = [];

  // --- Mengen -------------------------------------------------------------

  findings.push(
    compareQuantity(
      "quantity.settled_vs_scada",
      { label: "Abgerechnet", value: settled.productionKwh },
      { label: "SCADA", value: scadaKwh },
      tolerances,
    ),
  );
  findings.push(
    compareQuantity(
      "quantity.settled_vs_reported",
      { label: "Abgerechnet", value: settled.productionKwh },
      { label: "Erfasste Produktion", value: reportedKwh },
      tolerances,
    ),
  );
  findings.push(
    compareQuantity(
      "quantity.scada_vs_reported",
      { label: "SCADA", value: scadaKwh },
      { label: "Erfasste Produktion", value: reportedKwh },
      tolerances,
    ),
  );

  // --- Preis --------------------------------------------------------------

  // Der abgerechnete Satz ergibt sich aus Erlös / Menge. Er wird gegen den
  // hinterlegten Satz gehalten — genau hier stecken die Fehler, die beim
  // Abtippen nie auffallen.
  const settledRate =
    settled.revenueEur !== null && settled.productionKwh !== null && settled.productionKwh !== 0
      ? settled.revenueEur / settled.productionKwh
      : null;

  findings.push(
    compareValue({
      code: "price.settled_vs_expected",
      left: { label: "Abgerechneter Satz", value: settledRate, unit: "EUR/kWh" },
      right: { label: "Hinterlegter Satz", value: expectedRatePerKwh, unit: "EUR/kWh" },
      tolerancePct: tolerances.revenuePct,
      // Beim Satz gibt es keine sinnvolle absolute Untergrenze: eine
      // Abweichung von 0,001 EUR/kWh ist bei 2 Mio. kWh bereits 2.000 EUR.
      floor: 0,
      missingMessage:
        settledRate === null
          ? "Abgerechneter Satz nicht ermittelbar (Erlös oder Menge fehlt)"
          : "Kein hinterlegter Vergütungssatz für den Zeitraum",
    }),
  );

  // Erwarteter Erlös aus hinterlegtem Satz × abgerechneter Menge. Doppelt zum
  // Satzvergleich, aber in Euro — das ist die Zahl, über die diskutiert wird.
  const expectedRevenue =
    expectedRatePerKwh !== null && settled.productionKwh !== null
      ? expectedRatePerKwh * settled.productionKwh
      : null;

  findings.push(
    compareValue({
      code: "revenue.settled_vs_expected",
      left: { label: "Abgerechneter Erlös", value: settled.revenueEur, unit: "EUR" },
      right: { label: "Erwarteter Erlös", value: expectedRevenue, unit: "EUR" },
      tolerancePct: tolerances.revenuePct,
      floor: tolerances.revenueFloorEur,
      missingMessage: "Erwarteter Erlös nicht berechenbar",
    }),
  );

  const availableSources = [settled.productionKwh, scadaKwh, reportedKwh].filter(
    (v) => v !== null,
  ).length;

  const worstSeverity = findings.reduce<Severity>(
    (worst, finding) =>
      SEVERITY_ORDER[finding.severity] > SEVERITY_ORDER[worst] ? finding.severity : worst,
    "OK",
  );

  return {
    findings,
    worstSeverity,
    availableSources,
    interpretation: interpret(findings),
  };
}

/**
 * Aus dem Muster der Mengenabweichungen ableiten, welche Quelle abweicht.
 *
 * Bewusst nur ein Hinweis und keine Feststellung: die Daten reichen für einen
 * Verdacht, nicht für ein Urteil.
 */
function interpret(findings: ReconciliationFinding[]): string | null {
  const byCode = new Map(findings.map((f) => [f.code, f]));
  const settledVsScada = byCode.get("quantity.settled_vs_scada");
  const settledVsReported = byCode.get("quantity.settled_vs_reported");
  const scadaVsReported = byCode.get("quantity.scada_vs_reported");

  const deviates = (f: ReconciliationFinding | undefined) =>
    f !== undefined && (f.severity === "WARNING" || f.severity === "CRITICAL");
  const matches = (f: ReconciliationFinding | undefined) => f !== undefined && f.severity === "OK";

  if (deviates(settledVsScada) && deviates(settledVsReported) && matches(scadaVsReported)) {
    return "SCADA und erfasste Produktion stimmen überein — die Abweichung liegt bei der Abrechnung.";
  }
  if (deviates(settledVsScada) && matches(settledVsReported) && deviates(scadaVsReported)) {
    return "Abrechnung und erfasste Produktion stimmen überein — die SCADA-Daten weichen ab (Datenlücke oder Messstelle prüfen).";
  }
  if (matches(settledVsScada) && deviates(settledVsReported) && deviates(scadaVsReported)) {
    return "Abrechnung und SCADA stimmen überein — die erfasste Produktion weicht ab.";
  }
  if (deviates(settledVsScada) && deviates(settledVsReported) && deviates(scadaVsReported)) {
    return "Alle drei Quellen weichen voneinander ab — bitte einzeln prüfen.";
  }
  return null;
}

function compareQuantity(
  code: string,
  left: { label: string; value: number | null },
  right: { label: string; value: number | null },
  tolerances: ReconciliationTolerances,
): ReconciliationFinding {
  return compareValue({
    code,
    left: { ...left, unit: "kWh" },
    right: { ...right, unit: "kWh" },
    tolerancePct: tolerances.quantityPct,
    floor: tolerances.quantityFloorKwh,
    missingMessage: `Vergleich nicht möglich — ${
      left.value === null ? left.label : right.label
    } liegt nicht vor`,
  });
}

function compareValue(args: {
  code: string;
  left: { label: string; value: number | null; unit: string };
  right: { label: string; value: number | null; unit: string };
  tolerancePct: number;
  floor: number;
  missingMessage: string;
}): ReconciliationFinding {
  const { code, left, right, tolerancePct, floor, missingMessage } = args;

  // Fehlende Quelle heisst NICHT "in Ordnung". Genau der stille Durchlauf ist
  // der Fehler, den dieser Abgleich verhindern soll.
  if (left.value === null || right.value === null) {
    return {
      code,
      severity: "INFO",
      left,
      right,
      deviationPct: null,
      deviationAbs: null,
      message: missingMessage,
    };
  }

  const deviationAbs = round3(left.value - right.value);
  const deviationPct =
    right.value !== 0 ? round3(((left.value - right.value) / Math.abs(right.value)) * 100) : null;

  const withinRelative = deviationPct !== null && Math.abs(deviationPct) <= tolerancePct;
  const withinAbsolute = Math.abs(deviationAbs) <= floor;

  // Innerhalb EINER der beiden Grenzen genügt: die absolute Grenze fängt
  // kleine Mengen ab, die relative grosse.
  if (withinRelative || withinAbsolute) {
    return {
      code,
      severity: "OK",
      left,
      right,
      deviationPct,
      deviationAbs,
      message: "Innerhalb der Toleranz",
    };
  }

  // Ab dem Zehnfachen der Toleranz ist es kein Messunterschied mehr, sondern
  // vermutlich eine falsche Zahl — etwa ein Faktor 1000 oder ein vertauschter
  // Monat.
  const severity: Severity =
    deviationPct !== null && Math.abs(deviationPct) > tolerancePct * 10 ? "CRITICAL" : "WARNING";

  const direction = deviationAbs < 0 ? "niedriger" : "höher";

  return {
    code,
    severity,
    left,
    right,
    deviationPct,
    deviationAbs,
    message: `${left.label} liegt ${Math.abs(deviationAbs).toLocaleString("de-DE", {
      maximumFractionDigits: 3,
    })} ${left.unit} ${direction} als ${right.label}${
      deviationPct !== null ? ` (${deviationPct > 0 ? "+" : ""}${deviationPct} %)` : ""
    }`,
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
