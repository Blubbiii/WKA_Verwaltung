/**
 * Portfolio-Cockpit: Park × Jahr.
 *
 * B5 (Audit 2026-07): „Es fehlt die verdichtete Matrix, auf die Banken und
 * Beiräte schauen." Die Einzelauswertungen gibt es — multi-park-soll-ist,
 * park-pl, budget-vergleich und 27 Dashboard-Widgets. Was fehlt, ist die
 * Zusammenführung über mehrere Jahre.
 *
 * ## Die wichtigste Entscheidung: eine fehlende Zahl ist NICHT null
 *
 * Jede Kennzahl ist entweder ein Wert oder `null` mit Begründung. Das ist bei
 * einem Cockpit wichtiger als anderswo, weil genau hier von aussen gelesen
 * wird: eine Bank liest „Ausschüttungsquote 0 %" als rote Flagge, nicht als
 * „nicht ermittelbar". Ein Cockpit, das Lücken als Nullen zeigt, ist schlimmer
 * als keins.
 *
 * ## Was dieses Modul NICHT rechnet
 *
 * - **Schuldendienstdeckung (DSCR).** Der Bericht nennt sie, aber im Schema
 *   gibt es kein Darlehen: keine Tilgung, kein Zins, keine Restschuld. Sie
 *   aus dem Cashflow zu schätzen wäre eine Zahl, die genau in dem Gespräch
 *   falsch wäre, für das sie gedacht ist.
 * - **Produktionsprognose.** `AnnualBudget` führt EUR je Kostenstelle, keine
 *   kWh. Ohne hinterlegte Prognose gibt es kein Soll-Ist der Produktion —
 *   auch nicht „ungefähr".
 *
 * Beides steht als `unavailable` in der Antwort, damit die Lücke sichtbar ist
 * und nicht wie ein Nullwert aussieht.
 */

import {
  computeContractualAvailability,
  type TimeBuckets,
} from "@/lib/availability/contractual-availability";

/**
 * Technische Verfuegbarkeit: Produktionszeit gegen die Gesamtzeit, ohne jeden
 * Ausschluss. Die Zahl, die den Anlagenzustand beschreibt.
 */
const TECHNICAL_DEFINITION = {
  availableCategories: ["t1", "t2"],
  excludedCategories: [],
} as const;

/**
 * Vertragliche Verfuegbarkeit im Cockpit: dieselbe Rechnung, aber ohne die
 * Zeiten, die dem Hersteller ueblicherweise nicht angelastet werden (T5.1-T5.3
 * — Netzausfall, hoehere Gewalt, behoerdliche Anordnung).
 *
 * BEWUSST eine Vorgabe und keine vertragliche Definition: die steht in der
 * Verfuegbarkeitsgarantie am Wartungsvertrag (A2) und kann je Vertrag anders
 * lauten. Hier geht es um Vergleichbarkeit ueber das Portfolio; die
 * abrechnungsrelevante Zahl liefert der Jahresabgleich der Garantie.
 */
const PORTFOLIO_CONTRACTUAL_DEFINITION = {
  availableCategories: ["t1", "t2"],
  excludedCategories: ["t5_1", "t5_2", "t5_3"],
} as const;

export interface CockpitInputRow {
  parkId: string;
  parkName: string;
  year: number;

  /** Erzeugung in kWh aus der Netzbetreiber-/Direktvermarkter-Abrechnung. */
  productionKwh: number | null;
  /** Hinterlegte Jahresprognose in kWh. Praktisch immer `null` — siehe oben. */
  forecastKwh: number | null;

  revenueEur: number | null;
  /** Betriebskosten inkl. Pacht. */
  operatingCostEur: number | null;
  leaseCostEur: number | null;

  /**
   * Zeitkategorien T1-T6 nach IEC 61400-26 ueber das Jahr, in Sekunden,
   * summiert ueber alle Anlagen des Parks. `null` = keine SCADA-Daten.
   */
  availability: TimeBuckets | null;

  /** Ausgeschüttet im Jahr, anteilig nach Beteiligung des Fonds am Park. */
  distributedEur: number | null;
  /** Installierte Leistung in kW — Grundlage der Volllaststunden. */
  installedKw: number | null;
}

export interface Metric {
  value: number | null;
  /** Warum kein Wert vorliegt. `null`, wenn ein Wert vorliegt. */
  unavailable: string | null;
}

export interface CockpitCell {
  parkId: string;
  parkName: string;
  year: number;

  productionMwh: Metric;
  /** Erzeugung gegen Prognose in Prozent. */
  forecastAchievement: Metric;
  /** Volllaststunden — die Kennzahl, die Standorte vergleichbar macht. */
  fullLoadHours: Metric;
  /** Technische Verfügbarkeit in Prozent (ohne Ausschlüsse). */
  technicalAvailability: Metric;
  /** Vertragliche Verfügbarkeit in Prozent (mit Ausschlüssen). */
  contractualAvailability: Metric;
  revenueEur: Metric;
  /** Erlös je MWh. */
  revenuePerMwh: Metric;
  operatingCostEur: Metric;
  /** Betriebskosten je MWh. */
  costPerMwh: Metric;
  /** Ergebnis vor Zinsen und Abschreibungen — so weit die Daten reichen. */
  operatingResultEur: Metric;
  /** Ausschüttung im Verhältnis zum Betriebsergebnis. */
  payoutRatio: Metric;
  /** Schuldendienstdeckung. Immer `null` — es gibt keine Darlehensdaten. */
  debtServiceCoverage: Metric;
}

/** Begründungen, die mehrfach auftreten — als Konstanten, damit sie überall gleich lauten. */
export const REASONS = {
  noProduction: "Keine Abrechnung für dieses Jahr erfasst",
  noForecast:
    "Keine Produktionsprognose hinterlegt. Der Jahresbudget-Datensatz führt EUR je Kostenstelle, keine kWh — ein Soll-Ist der Produktion ist daraus nicht ableitbar.",
  noAvailability: "Keine SCADA-Verfügbarkeitsdaten für dieses Jahr",
  noRevenue: "Kein Erlös erfasst",
  noCost: "Keine Betriebskosten erfasst",
  noInstalledPower: "Keine installierte Leistung am Park hinterlegt",
  noDistribution: "Keine Ausschüttung für dieses Jahr erfasst",
  noResult: "Ohne Erlös oder Kosten kein Betriebsergebnis",
  negativeResult:
    "Betriebsergebnis nicht positiv — eine Ausschüttungsquote dagegen wäre nicht aussagekräftig",
  noDebtData:
    "Keine Darlehensdaten im System: weder Tilgung noch Zins noch Restschuld. Die Schuldendienstdeckung wird nicht geschätzt.",
} as const;

function metric(value: number | null, reason: string): Metric {
  return value === null ? { value: null, unavailable: reason } : { value, unavailable: null };
}

export function buildCell(row: CockpitInputRow): CockpitCell {
  const productionMwh =
    row.productionKwh !== null && row.productionKwh > 0 ? round2(row.productionKwh / 1000) : null;

  // --- Prognose ---------------------------------------------------------
  const forecastAchievement =
    row.forecastKwh !== null && row.forecastKwh > 0 && row.productionKwh !== null
      ? round2((row.productionKwh / row.forecastKwh) * 100)
      : null;

  // --- Volllaststunden ---------------------------------------------------
  // Erzeugung geteilt durch installierte Leistung. Die Kennzahl, mit der sich
  // ein Standort in der Eifel mit einem an der Küste vergleichen lässt.
  const fullLoadHours =
    row.productionKwh !== null && row.installedKw !== null && row.installedKw > 0
      ? Math.round(row.productionKwh / row.installedKw)
      : null;

  // --- Verfuegbarkeit -----------------------------------------------------
  //
  // Ueber DIESELBE Funktion wie der Jahresabgleich der
  // Verfuegbarkeitsgarantie (A2). Eine zweite Rechnung im Cockpit waere eine
  // zweite Wahrheit — und bei einer 97-%-Garantie faellt ein halber
  // Prozentpunkt Unterschied sofort auf.
  let technical: number | null = null;
  let contractual: number | null = null;
  if (row.availability) {
    const technicalResult = computeContractualAvailability(row.availability, TECHNICAL_DEFINITION);
    technical = technicalResult.availabilityPct;

    const contractualResult = computeContractualAvailability(
      row.availability,
      PORTFOLIO_CONTRACTUAL_DEFINITION,
    );
    contractual = contractualResult.availabilityPct;
  }

  // --- Geld ---------------------------------------------------------------
  const revenue = row.revenueEur;
  const cost =
    row.operatingCostEur === null && row.leaseCostEur === null
      ? null
      : (row.operatingCostEur ?? 0) + (row.leaseCostEur ?? 0);

  const revenuePerMwh =
    revenue !== null && productionMwh !== null && productionMwh > 0
      ? round2(revenue / productionMwh)
      : null;
  const costPerMwh =
    cost !== null && productionMwh !== null && productionMwh > 0
      ? round2(cost / productionMwh)
      : null;

  const operatingResult = revenue !== null && cost !== null ? round2(revenue - cost) : null;

  // --- Ausschüttungsquote -------------------------------------------------
  // Nur gegen ein POSITIVES Ergebnis. Gegen ein negatives gerechnet käme eine
  // negative Quote heraus, die niemand richtig liest.
  let payoutRatio: number | null = null;
  let payoutReason: string = REASONS.noDistribution;
  if (row.distributedEur === null) {
    payoutReason = REASONS.noDistribution;
  } else if (operatingResult === null) {
    payoutReason = REASONS.noResult;
  } else if (operatingResult <= 0) {
    payoutReason = REASONS.negativeResult;
  } else {
    payoutRatio = round2((row.distributedEur / operatingResult) * 100);
  }

  return {
    parkId: row.parkId,
    parkName: row.parkName,
    year: row.year,

    productionMwh: metric(productionMwh, REASONS.noProduction),
    forecastAchievement: metric(forecastAchievement, REASONS.noForecast),
    fullLoadHours: metric(
      fullLoadHours,
      row.productionKwh === null ? REASONS.noProduction : REASONS.noInstalledPower,
    ),
    technicalAvailability: metric(technical, REASONS.noAvailability),
    contractualAvailability: metric(contractual, REASONS.noAvailability),
    revenueEur: metric(revenue, REASONS.noRevenue),
    revenuePerMwh: metric(
      revenuePerMwh,
      revenue === null ? REASONS.noRevenue : REASONS.noProduction,
    ),
    operatingCostEur: metric(cost, REASONS.noCost),
    costPerMwh: metric(costPerMwh, cost === null ? REASONS.noCost : REASONS.noProduction),
    operatingResultEur: metric(operatingResult, REASONS.noResult),
    payoutRatio: metric(payoutRatio, payoutReason),
    // Ausdrücklich immer leer. Sie zu schätzen wäre eine Zahl, die genau in
    // dem Gespräch falsch wäre, für das sie gedacht ist.
    debtServiceCoverage: metric(null, REASONS.noDebtData),
  };
}

export interface CockpitSummary {
  /** Summe über alle Parks eines Jahres — nur über die Zellen MIT Wert. */
  year: number;
  productionMwh: Metric;
  revenueEur: Metric;
  operatingCostEur: Metric;
  operatingResultEur: Metric;
  revenuePerMwh: Metric;
  /** Wie viele Parks in die Summe eingegangen sind, und wie viele es gibt. */
  parksWithData: number;
  parksTotal: number;
}

/**
 * Jahressumme über die Parks.
 *
 * Summiert NUR die Zellen mit Wert und meldet, über wie viele Parks summiert
 * wurde. Ohne diese Angabe sähe eine Summe über drei von zehn Parks aus wie
 * das Portfolio — und wäre um den Faktor drei zu klein.
 */
export function summarize(cells: readonly CockpitCell[], year: number): CockpitSummary {
  const forYear = cells.filter((cell) => cell.year === year);

  const sum = (pick: (cell: CockpitCell) => Metric): number | null => {
    const values = forYear.map(pick).filter((m): m is Metric & { value: number } => m.value !== null);
    if (values.length === 0) return null;
    return round2(values.reduce((total, m) => total + m.value, 0));
  };

  const production = sum((cell) => cell.productionMwh);
  const revenue = sum((cell) => cell.revenueEur);
  const cost = sum((cell) => cell.operatingCostEur);
  const result = revenue !== null && cost !== null ? round2(revenue - cost) : null;

  const parksWithData = forYear.filter((cell) => cell.productionMwh.value !== null).length;

  return {
    year,
    productionMwh: metric(production, REASONS.noProduction),
    revenueEur: metric(revenue, REASONS.noRevenue),
    operatingCostEur: metric(cost, REASONS.noCost),
    operatingResultEur: metric(result, REASONS.noResult),
    revenuePerMwh: metric(
      revenue !== null && production !== null && production > 0
        ? round2(revenue / production)
        : null,
      revenue === null ? REASONS.noRevenue : REASONS.noProduction,
    ),
    parksWithData,
    parksTotal: forYear.length,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
