/**
 * Ausfallarbeit und Entschädigung bei Abregelung.
 *
 * Fehlende Funktion A4 (Audit 2026-07): Die Abregelungsgründe kommen aus dem
 * DBF-Reader und landen in Charts und PDF-Reports. Es fehlt die
 * **Anspruchsseite** — Ausfallarbeit je Ereignis, Anspruchsgrundlage,
 * Forderungsaufstellung, Abgleich mit der gezahlten Entschädigung. Heute
 * verlässt man sich auf die Berechnung des Netzbetreibers.
 *
 * ## Zwei Anspruchsgrundlagen, zwei Rechenwege
 *
 * **§ 15 EEG** (Einspeisemanagement, „Härtefallregelung"): Entschädigt werden
 * 95 % der entgangenen Einnahmen. Übersteigen die entgangenen Einnahmen im
 * Kalenderjahr 1 % der Einnahmen dieses Jahres, sind sie **ab diesem
 * Zeitpunkt** zu 100 % zu entschädigen. Der Satz hängt also davon ab, wie viel
 * im selben Jahr bereits ausgefallen ist — genau das wird von Hand falsch
 * gerechnet.
 *
 * **§ 13a EnWG / Redispatch 2.0**: Der finanzielle Ausgleich wird vom
 * Netzbetreiber ermittelt. Diese Datei rechnet ihn NICHT nach — dafür wären
 * Bilanzkreisdaten und das gewählte Abrechnungsmodell (Prognose- oder
 * Spitz-Abrechnung) nötig, die hier nicht vorliegen. Sie beziffert die
 * entgangenen Einnahmen als Vergleichsgrösse zur Gutschrift des
 * Netzbetreibers. Eine Abweichung ist der Anlass für eine Nachfrage.
 *
 * Die Grenze ist bewusst gezogen: eine erfundene Redispatch-Abrechnung wäre
 * schlimmer als gar keine — sie fiele beim ersten Nachrechnen auf.
 */

export type LegalBasis = "EEG_15" | "ENWG_13A" | "OTHER";

/** Wie die Ausfallarbeit ermittelt wurde. */
export type LostWorkMethod =
  /** Aus dem Abregelungssignal der Anlagensteuerung (mrwSmpPext). */
  | "CONTROLLER_SIGNAL"
  /** Aus Referenzanlagen desselben Parks, die nicht abgeregelt waren. */
  | "REFERENCE_TURBINE"
  /** Vom Netzbetreiber gemeldet. */
  | "GRID_OPERATOR"
  /** Von Hand beziffert. */
  | "MANUAL";

export interface CompensationInput {
  legalBasis: LegalBasis;
  /** Ausfallarbeit des Ereignisses in kWh. */
  lostWorkKwh: number;
  /** Anzusetzender Satz in EUR/kWh. */
  ratePerKwh: number;
  /**
   * Entgangene Einnahmen, die im selben Kalenderjahr bereits aufgelaufen
   * sind — VOR diesem Ereignis. Nur für § 15 EEG von Belang.
   */
  priorLostRevenueEurInYear: number;
  /**
   * Einnahmen des Kalenderjahres, gegen die die 1-%-Schwelle läuft.
   * `null` = unbekannt; dann wird durchgehend mit 95 % gerechnet und das
   * vermerkt.
   */
  annualRevenueEur: number | null;
  /** Zusätzliche Aufwendungen (§ 15 Abs. 1 EEG), die hinzukommen. */
  additionalExpensesEur?: number;
  /** Ersparte Aufwendungen, die abgezogen werden. */
  savedExpensesEur?: number;
}

export interface CompensationResult {
  /** Entgangene Einnahmen dieses Ereignisses, vor Quote. */
  lostRevenueEur: number;
  /** Anteil, der mit 95 % entschädigt wird (§ 15 EEG). */
  portionAt95Eur: number;
  /** Anteil, der mit 100 % entschädigt wird. */
  portionAt100Eur: number;
  /** Forderung insgesamt, inklusive Zu- und Abschlägen. */
  claimEur: number;
  /** Ab wann die 100-%-Quote greift, in EUR kumulierter Ausfall im Jahr. */
  thresholdEur: number | null;
  /** Wurde die Schwelle mit diesem Ereignis überschritten? */
  thresholdCrossed: boolean;
  warnings: string[];
}

/** Quote unterhalb der Schwelle nach § 15 Abs. 1 EEG. */
const EEG_BASE_QUOTA = 0.95;
/** Schwelle: 1 % der Jahreseinnahmen. */
const EEG_THRESHOLD_SHARE = 0.01;

export function computeCompensation(input: CompensationInput): CompensationResult {
  const {
    legalBasis,
    lostWorkKwh,
    ratePerKwh,
    priorLostRevenueEurInYear,
    annualRevenueEur,
    additionalExpensesEur = 0,
    savedExpensesEur = 0,
  } = input;

  const warnings: string[] = [];
  const lostRevenueEur = round2(Math.max(0, lostWorkKwh) * ratePerKwh);

  // § 13a EnWG: der finanzielle Ausgleich kommt vom Netzbetreiber. Hier wird
  // nur die Vergleichsgrösse beziffert.
  if (legalBasis !== "EEG_15") {
    warnings.push(
      legalBasis === "ENWG_13A"
        ? "§ 13a EnWG: Der finanzielle Ausgleich wird vom Netzbetreiber ermittelt. Der ausgewiesene Betrag ist die entgangene Einnahme als Vergleichsgrösse, nicht die Forderung."
        : "Keine gesetzliche Anspruchsgrundlage hinterlegt — der Betrag ist eine Vergleichsgrösse.",
    );
    return {
      lostRevenueEur,
      portionAt95Eur: 0,
      portionAt100Eur: 0,
      claimEur: round2(lostRevenueEur + additionalExpensesEur - savedExpensesEur),
      thresholdEur: null,
      thresholdCrossed: false,
      warnings,
    };
  }

  // Ohne Jahreseinnahmen lässt sich die Schwelle nicht bestimmen. Dann
  // durchgehend 95 % — das ist die für den Betreiber ungünstigere Annahme und
  // damit die richtige Vorsichtsvariante, aber sie muss sichtbar sein.
  if (annualRevenueEur === null || annualRevenueEur <= 0) {
    warnings.push(
      "Jahreseinnahmen unbekannt — durchgehend mit 95 % gerechnet. Nach Jahresabschluss neu bewerten: oberhalb von 1 % der Jahreseinnahmen stehen 100 % zu.",
    );
    return {
      lostRevenueEur,
      portionAt95Eur: lostRevenueEur,
      portionAt100Eur: 0,
      claimEur: round2(lostRevenueEur * EEG_BASE_QUOTA + additionalExpensesEur - savedExpensesEur),
      thresholdEur: null,
      thresholdCrossed: false,
      warnings,
    };
  }

  const thresholdEur = round2(annualRevenueEur * EEG_THRESHOLD_SHARE);
  const prior = Math.max(0, priorLostRevenueEurInYear);

  // Der Teil dieses Ereignisses, der noch unterhalb der Schwelle liegt, wird
  // mit 95 % entschädigt; alles darüber mit 100 %. Ein Ereignis kann die
  // Schwelle überschreiten und muss dann geteilt werden — genau diese Teilung
  // fällt bei einer Handrechnung unter den Tisch.
  const remainingBelowThreshold = Math.max(0, thresholdEur - prior);
  const portionAt95Eur = round2(Math.min(lostRevenueEur, remainingBelowThreshold));
  const portionAt100Eur = round2(lostRevenueEur - portionAt95Eur);

  const thresholdCrossed = portionAt100Eur > 0;

  if (thresholdCrossed && portionAt95Eur > 0) {
    warnings.push(
      `Die 1-%-Schwelle (${thresholdEur.toLocaleString("de-DE", {
        minimumFractionDigits: 2,
      })} EUR) wird mit diesem Ereignis überschritten — der Betrag ist geteilt: 95 % bis zur Schwelle, 100 % darüber.`,
    );
  }

  const claimEur = round2(
    portionAt95Eur * EEG_BASE_QUOTA + portionAt100Eur + additionalExpensesEur - savedExpensesEur,
  );

  return {
    lostRevenueEur,
    portionAt95Eur,
    portionAt100Eur,
    claimEur,
    thresholdEur,
    thresholdCrossed,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Ausfallarbeit aus dem Abregelungssignal
// ---------------------------------------------------------------------------

/** Ein Zehnminutenwert der Abregelungskomponenten. */
export interface CurtailmentSample {
  timestamp: Date;
  /** mrwSmpPext — extern veranlasste Abregelung (Redispatch), in kW. */
  powerExternalKw: number | null;
  /** mrwSmpPfm — erzwungene bzw. manuelle Abregelung, in kW. */
  powerForcedKw: number | null;
}

export interface LostWorkResult {
  lostWorkKwh: number;
  method: LostWorkMethod;
  intervalCount: number;
  warnings: string[];
}

/**
 * Ausfallarbeit aus dem Abregelungssignal der Anlagensteuerung.
 *
 * Die Steuerung meldet die Leistung, die wegen einer externen Vorgabe NICHT
 * eingespeist wurde. Über die Intervalldauer integriert ergibt das die
 * Ausfallarbeit — ohne Referenzanlage und ohne Schätzung.
 *
 * `powerForcedKw` wird auf Wunsch mitgezählt: ob eine manuell veranlasste
 * Abregelung zum Anspruch gehört, hängt davon ab, wer sie veranlasst hat. Die
 * Vorgabe ist, sie NICHT mitzuzählen — eine selbst veranlasste Abregelung
 * begründet keinen Anspruch gegen den Netzbetreiber.
 */
export function computeLostWorkFromSignal(
  samples: readonly CurtailmentSample[],
  options: { intervalMinutes: number; includeForced?: boolean },
): LostWorkResult | { lostWorkKwh: null; reason: string } {
  const { intervalMinutes, includeForced = false } = options;

  if (intervalMinutes <= 0) {
    return { lostWorkKwh: null, reason: "Ungültige Intervalllänge" };
  }

  const measured = samples.filter((s) => s.powerExternalKw !== null);
  if (measured.length === 0) {
    return {
      lostWorkKwh: null,
      reason:
        "Kein Abregelungssignal im Zeitraum — Ausfallarbeit bitte aus Referenzanlagen oder von Hand ermitteln",
    };
  }

  const warnings: string[] = [];
  const hours = intervalMinutes / 60;
  let kwh = 0;

  for (const sample of samples) {
    // Negative Werte sind ein Datenfehler; sie würden die Ausfallarbeit
    // mindern und die Forderung zu klein machen.
    const external = Math.max(0, sample.powerExternalKw ?? 0);
    const forced = includeForced ? Math.max(0, sample.powerForcedKw ?? 0) : 0;
    kwh += (external + forced) * hours;
  }

  if (includeForced) {
    warnings.push(
      "Manuell veranlasste Abregelung ist mitgezählt — sie begründet nur dann einen Anspruch, wenn sie vom Netzbetreiber veranlasst wurde.",
    );
  }

  return {
    lostWorkKwh: round3(kwh),
    method: "CONTROLLER_SIGNAL",
    intervalCount: measured.length,
    warnings,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
