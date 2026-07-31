/**
 * Erwartete Entschädigung aus einer Versicherungspolice.
 *
 * Fehlende Funktion A6 (Audit 2026-07): Policen sind heute nur
 * `Contract(contractType=INSURANCE)`. Es fehlen Versicherungssumme,
 * Selbstbehalt, Prämie, Deckungsarten, versicherte Objekte und die Verknüpfung
 * Schaden→Police mit SB-Abzug. „Unterversicherung ist selten, aber
 * existenziell."
 *
 * ## Die Reihenfolge entscheidet über den Betrag
 *
 * 1. **Unterversicherung** (§ 75 VVG): Ist die Versicherungssumme niedriger
 *    als der Versicherungswert, haftet der Versicherer nur im Verhältnis
 *    Summe zu Wert. Der Schaden wird also ZUERST anteilig gekürzt.
 * 2. **Selbstbehalt**: Erst vom bereits gekürzten Betrag abgezogen.
 * 3. **Entschädigungsgrenze**: Die Versicherungssumme ist die Obergrenze.
 *
 * Zieht man den Selbstbehalt zuerst ab und kürzt danach anteilig, kommt bei
 * Unterversicherung ein zu HOHER Betrag heraus — die Erwartung wäre zu
 * optimistisch und die Deckungslücke bliebe unentdeckt.
 *
 * ## Verzicht auf den Unterversicherungseinwand
 *
 * In der Praxis enthalten viele Policen einen solchen Verzicht. Er ist deshalb
 * ein eigenes Feld und keine Annahme: die Rechnung mit und ohne Verzicht
 * unterscheidet sich um genau den Betrag, um den es bei einem Großschaden geht.
 */

export type DeductibleType =
  /** Fester Betrag je Schadenfall. */
  | "FIXED_EUR"
  /** Prozent des Schadens, meist mit Mindest- und Höchstbetrag. */
  | "PERCENT_OF_LOSS"
  /** Prozent der Versicherungssumme. */
  | "PERCENT_OF_SUM_INSURED";

export interface PolicyTerms {
  /** Versicherungssumme in EUR. Zugleich die Entschädigungsgrenze. */
  sumInsuredEur: number;
  /**
   * Versicherungswert (Wiederbeschaffungs- bzw. Zeitwert) in EUR.
   * `null` = nicht erfasst; dann wird keine Unterversicherung geprüft und das
   * ausdrücklich vermerkt.
   */
  insuredValueEur: number | null;
  /** Verzicht auf den Unterversicherungseinwand. */
  waivesUnderinsurance: boolean;
  deductibleType: DeductibleType;
  deductibleValue: number;
  /** Mindestselbstbehalt, nur bei prozentualen Formen. */
  deductibleMinEur: number | null;
  /** Höchstselbstbehalt, nur bei prozentualen Formen. */
  deductibleMaxEur: number | null;
}

export interface ReimbursementResult {
  /** Gemeldeter Schaden. */
  lossEur: number;
  /** Nach Anwendung der Unterversicherung. */
  afterUnderinsuranceEur: number;
  /** Angesetzter Selbstbehalt. */
  deductibleEur: number;
  /** Erwartete Entschädigung. */
  expectedReimbursementEur: number;
  /** Der Anteil, den der Betreiber selbst trägt. */
  ownShareEur: number;
  /**
   * Unterversicherungsquote (Summe / Wert), 1 = keine Unterversicherung.
   * `null`, wenn der Versicherungswert nicht erfasst ist.
   */
  underinsuranceFactor: number | null;
  /** Wurde an der Versicherungssumme gedeckelt? */
  cappedAtSumInsured: boolean;
  warnings: string[];
}

export function computeReimbursement(input: {
  lossEur: number;
  terms: PolicyTerms;
}): ReimbursementResult {
  const { lossEur, terms } = input;
  const warnings: string[] = [];

  const loss = Math.max(0, lossEur);

  // --- 1. Unterversicherung -------------------------------------------
  let underinsuranceFactor: number | null = null;
  let afterUnderinsurance = loss;

  if (terms.waivesUnderinsurance) {
    warnings.push("Die Police enthält einen Verzicht auf den Unterversicherungseinwand.");
  } else if (terms.insuredValueEur === null || terms.insuredValueEur <= 0) {
    // Kein Wert erfasst heisst nicht „keine Unterversicherung" — es heisst
    // „ungeprüft". Der Unterschied ist bei einem Grossschaden existenziell.
    warnings.push(
      "Versicherungswert nicht erfasst — eine Unterversicherung nach § 75 VVG konnte NICHT geprüft werden.",
    );
  } else if (terms.sumInsuredEur < terms.insuredValueEur) {
    underinsuranceFactor = terms.sumInsuredEur / terms.insuredValueEur;
    afterUnderinsurance = loss * underinsuranceFactor;
    warnings.push(
      `Unterversicherung: Versicherungssumme deckt nur ${(underinsuranceFactor * 100).toFixed(
        1,
      )} % des Versicherungswerts — die Entschädigung wird nach § 75 VVG anteilig gekürzt.`,
    );
  } else {
    underinsuranceFactor = 1;
  }

  // --- 2. Selbstbehalt --------------------------------------------------
  // Bewusst auf den bereits gekürzten Betrag. Umgekehrt käme bei
  // Unterversicherung ein zu hoher Wert heraus.
  const deductible = computeDeductible(afterUnderinsurance, terms);

  let reimbursement = Math.max(0, afterUnderinsurance - deductible);

  // --- 3. Entschädigungsgrenze -----------------------------------------
  let cappedAtSumInsured = false;
  if (reimbursement > terms.sumInsuredEur) {
    reimbursement = terms.sumInsuredEur;
    cappedAtSumInsured = true;
    warnings.push(
      "Die Entschädigung ist auf die Versicherungssumme begrenzt — der übersteigende Schaden bleibt beim Betreiber.",
    );
  }

  const result: ReimbursementResult = {
    lossEur: round2(loss),
    afterUnderinsuranceEur: round2(afterUnderinsurance),
    deductibleEur: round2(Math.min(deductible, afterUnderinsurance)),
    expectedReimbursementEur: round2(reimbursement),
    ownShareEur: round2(loss - reimbursement),
    underinsuranceFactor: underinsuranceFactor === null ? null : round4(underinsuranceFactor),
    cappedAtSumInsured,
    warnings,
  };

  // Ein Schaden unterhalb des Selbstbehalts ergibt keine Entschädigung. Das
  // ist kein Fehler, aber es soll dastehen — sonst wundert sich der Bearbeiter
  // über eine Null.
  if (result.expectedReimbursementEur === 0 && loss > 0) {
    warnings.push("Der Schaden liegt unterhalb des Selbstbehalts — keine Entschädigung zu erwarten.");
  }

  return result;
}

function computeDeductible(base: number, terms: PolicyTerms): number {
  let value: number;

  switch (terms.deductibleType) {
    case "FIXED_EUR":
      value = terms.deductibleValue;
      break;
    case "PERCENT_OF_LOSS":
      value = (base * terms.deductibleValue) / 100;
      break;
    case "PERCENT_OF_SUM_INSURED":
      value = (terms.sumInsuredEur * terms.deductibleValue) / 100;
      break;
  }

  // Mindest- und Höchstbetrag gelten nur bei prozentualen Formen; bei einem
  // festen Betrag wären sie widersprüchlich.
  if (terms.deductibleType !== "FIXED_EUR") {
    if (terms.deductibleMinEur !== null) value = Math.max(value, terms.deductibleMinEur);
    if (terms.deductibleMaxEur !== null) value = Math.min(value, terms.deductibleMaxEur);
  }

  return Math.max(0, value);
}

/**
 * Deckungslücke einer Police prüfen — unabhängig von einem Schaden.
 *
 * Für eine Übersicht „welche Policen sind unterversichert": die Frage stellt
 * sich VOR dem Schaden, nicht danach.
 */
export function checkCoverageGap(terms: {
  sumInsuredEur: number;
  insuredValueEur: number | null;
  waivesUnderinsurance: boolean;
}): { gapEur: number | null; gapPercent: number | null; message: string | null } {
  if (terms.insuredValueEur === null || terms.insuredValueEur <= 0) {
    return {
      gapEur: null,
      gapPercent: null,
      message: "Versicherungswert nicht erfasst — Deckung nicht beurteilbar",
    };
  }

  const gap = terms.insuredValueEur - terms.sumInsuredEur;
  if (gap <= 0) return { gapEur: 0, gapPercent: 0, message: null };

  const gapPercent = (gap / terms.insuredValueEur) * 100;

  // Der Verzicht nimmt der Lücke die rechtliche Folge, nicht die
  // wirtschaftliche: über der Versicherungssumme zahlt trotzdem niemand.
  const message = terms.waivesUnderinsurance
    ? `Versicherungssumme liegt ${round2(gap).toLocaleString("de-DE")} EUR unter dem Wert. Der Verzicht auf den Unterversicherungseinwand verhindert die anteilige Kürzung — die Entschädigungsgrenze bleibt aber die Versicherungssumme.`
    : `Unterversicherung: ${round2(gap).toLocaleString("de-DE")} EUR bzw. ${gapPercent.toFixed(
        1,
      )} % des Werts sind nicht gedeckt.`;

  return { gapEur: round2(gap), gapPercent: round2(gapPercent), message };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
