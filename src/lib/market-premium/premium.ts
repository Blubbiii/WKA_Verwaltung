/**
 * Anzulegender Wert, Marktprämie und negative Preise.
 *
 * B1 (Audit 2026-07): „`EnergyMonthlyRate` hat `marketValue` und
 * `managementFee` als *Eingabefelder*. Es fehlt die Rechenlogik … und die
 * Stunden mit negativen Preisen mit dem daraus entfallenden
 * Vergütungsanspruch (0 Treffer für §51/negativePrice)."
 *
 * ## Was hier gerechnet wird
 *
 *   Anzulegender Wert = Zuschlagswert × Korrekturfaktor (§ 36h EEG)
 *   Marktprämie       = max(0, AW − Monatsmarktwert Wind onshore) (§ 20 EEG)
 *
 * Die Marktprämie wird nicht negativ: liegt der Marktwert über dem
 * anzulegenden Wert, ist sie null, nicht ein Abzug.
 *
 * ## Was hier NICHT gerechnet wird: der Korrekturfaktor
 *
 * Der Gütefaktor folgt aus Anlage 2 EEG — einer Stützstellentabelle mit
 * linearer Interpolation, die sich mit jeder EEG-Novelle geändert hat. Eine
 * hier eingebaute Tabelle wäre für einen Teil der Anlagen die falsche, und der
 * Fehler fiele nicht auf: er verschöbe jede Marktprämie um wenige Prozent.
 * Deshalb ist der Faktor eine **Eingabe**. Fehlt er, gibt es keinen
 * anzulegenden Wert — nicht den Zuschlagswert ungekürzt.
 *
 * ## § 51 EEG: die Schwelle ist ein Feld
 *
 * Die Mindestdauer zusammenhängender negativer Stunden hat sich mehrfach
 * geändert (EEG 2017: sechs, EEG 2021: vier, EEG 2023: eine Stunde für neue
 * Anlagen). Welche gilt, hängt an Inbetriebnahme und Zuschlag der einzelnen
 * Anlage. Eine feste Zahl im Code wäre für die Hälfte des Bestands falsch.
 *
 * Ist die Schwelle erreicht, entfällt der Anspruch für die **gesamte** Dauer
 * des zusammenhängenden Zeitraums — nicht erst ab der Schwellenstunde. Das ist
 * die Stelle, an der eine naive Umsetzung zu wenig abzieht.
 */

export interface HourlyPrice {
  /** Beginn der Stunde. */
  hour: Date;
  /** Preis des Stundenkontrakts in EUR/MWh. */
  priceEurMwh: number;
}

export interface NegativeHoursResult {
  /** Stunden, für die der Anspruch entfällt. */
  affectedHours: number;
  /** Alle negativen Stunden — auch die unterhalb der Schwelle. */
  negativeHours: number;
  /** Die zusammenhängenden Zeiträume, die die Schwelle erreichen. */
  qualifyingRuns: { start: Date; end: Date; hours: number }[];
  warnings: string[];
}

/**
 * Zusammenhängende Zeiträume negativer Preise bestimmen.
 *
 * `thresholdHours` ist die Mindestdauer, ab der der Anspruch entfällt.
 * Die Reihe muss lückenlos stündlich sein; Lücken beenden einen Zeitraum,
 * weil sich über eine Lücke hinweg nichts über die Zusammenhängigkeit sagen
 * lässt.
 */
export function findNegativePriceHours(
  prices: readonly HourlyPrice[],
  thresholdHours: number,
): NegativeHoursResult {
  const warnings: string[] = [];

  if (prices.length === 0) {
    return {
      affectedHours: 0,
      negativeHours: 0,
      qualifyingRuns: [],
      warnings: ["Keine Preisreihe vorhanden."],
    };
  }

  const sorted = [...prices].sort((a, b) => a.hour.getTime() - b.hour.getTime());

  const runs: { start: Date; end: Date; hours: number }[] = [];
  let negativeHours = 0;
  let runStart: Date | null = null;
  let runLength = 0;
  let previousHour: Date | null = null;
  let gapCount = 0;

  const flush = (endHour: Date) => {
    if (runStart !== null && runLength > 0) {
      runs.push({ start: runStart, end: endHour, hours: runLength });
    }
    runStart = null;
    runLength = 0;
  };

  for (const entry of sorted) {
    // Eine Lücke unterbricht den Zusammenhang. Über sie hinweg zu zählen
    // würde einen Zeitraum erfinden, dessen Preise niemand kennt.
    const isContiguous =
      previousHour === null ||
      entry.hour.getTime() - previousHour.getTime() === 3_600_000;

    if (!isContiguous) {
      if (runStart !== null) flush(previousHour!);
      gapCount += 1;
    }

    if (entry.priceEurMwh < 0) {
      negativeHours += 1;
      if (runStart === null) runStart = entry.hour;
      runLength += 1;
    } else if (runStart !== null) {
      flush(previousHour!);
    }

    previousHour = entry.hour;
  }
  if (runStart !== null && previousHour !== null) flush(previousHour);

  if (gapCount > 0) {
    warnings.push(
      `Die Preisreihe hat ${gapCount} Lücke(n). Zusammenhängende Zeiträume wurden dort getrennt — die tatsächliche Dauer kann länger sein.`,
    );
  }

  // Erreicht ein Zeitraum die Schwelle, entfällt der Anspruch für seine
  // GESAMTE Dauer, nicht erst ab der Schwellenstunde.
  const qualifyingRuns = runs.filter((run) => run.hours >= thresholdHours);
  const affectedHours = qualifyingRuns.reduce((sum, run) => sum + run.hours, 0);

  return { affectedHours, negativeHours, qualifyingRuns, warnings };
}

export interface PremiumInput {
  /** Zuschlagswert aus der Ausschreibung in ct/kWh. */
  awardValueCtPerKwh: number | null;
  /**
   * Korrekturfaktor nach § 36h EEG (Anlage 2). Eingabe, keine Ableitung —
   * siehe Kopfkommentar.
   */
  correctionFactor: number | null;
  /** Monatsmarktwert Wind onshore in ct/kWh. */
  marketValueCtPerKwh: number | null;
  /** Erzeugung des Monats in kWh. */
  productionKwh: number | null;
  /** Stunden, für die der Anspruch nach § 51 EEG entfällt. */
  negativeHoursResult: NegativeHoursResult | null;
  /**
   * Erzeugung in den betroffenen Stunden, in kWh. Nur mit ihr lässt sich der
   * entfallende Anspruch beziffern — die Stundenzahl allein sagt nichts über
   * die Menge.
   */
  productionInNegativeHoursKwh: number | null;
}

export interface Metric {
  value: number | null;
  unavailable: string | null;
}

export interface PremiumResult {
  /** Anzulegender Wert in ct/kWh. */
  appliedValueCtPerKwh: Metric;
  /** Marktprämie je kWh in ct. */
  premiumCtPerKwh: Metric;
  /** Marktprämie des Monats in EUR. */
  premiumEur: Metric;
  /** Entfallener Vergütungsanspruch aus negativen Stunden in EUR. */
  forfeitedEur: Metric;
  affectedHours: Metric;
  warnings: string[];
  /** Herleitung für die Ansicht. */
  statement: string;
}

const REASONS = {
  noAward: "Kein Zuschlagswert hinterlegt (Regulatorik-Stammdaten der Anlage).",
  noFactor:
    "Kein Korrekturfaktor nach § 36h EEG hinterlegt. Er folgt aus Anlage 2 EEG und wird hier nicht geschätzt — ohne ihn gibt es keinen anzulegenden Wert.",
  noMarketValue: "Kein Monatsmarktwert Wind onshore hinterlegt.",
  noProduction: "Keine Erzeugung für diesen Monat erfasst.",
  noHourlySeries:
    "Keine stündliche Preisreihe für diesen Monat geladen. Die Stunden mit negativen Preisen lassen sich daraus nicht bestimmen — sie sind NICHT null.",
  noNegativeProduction:
    "Erzeugung in den betroffenen Stunden nicht bekannt. Die Stundenzahl allein sagt nichts über die entfallene Menge.",
} as const;

function metric(value: number | null, reason: string): Metric {
  return value === null ? { value: null, unavailable: reason } : { value, unavailable: null };
}

export function computePremium(input: PremiumInput): PremiumResult {
  const warnings: string[] = [];

  // --- Anzulegender Wert --------------------------------------------------
  let applied: number | null = null;
  let appliedReason: string = REASONS.noAward;

  if (input.awardValueCtPerKwh === null) {
    appliedReason = REASONS.noAward;
  } else if (input.correctionFactor === null) {
    // Ausdrücklich NICHT der ungekürzte Zuschlagswert: der wäre für jede
    // Anlage ausser einer mit Faktor 1,0 falsch.
    appliedReason = REASONS.noFactor;
  } else {
    applied = round4(input.awardValueCtPerKwh * input.correctionFactor);
  }

  // --- Marktprämie ---------------------------------------------------------
  let premiumCt: number | null = null;
  let premiumReason: string = REASONS.noMarketValue;

  if (applied === null) {
    premiumReason = appliedReason;
  } else if (input.marketValueCtPerKwh === null) {
    premiumReason = REASONS.noMarketValue;
  } else {
    // § 20 EEG: die Marktprämie wird nicht negativ. Liegt der Marktwert über
    // dem anzulegenden Wert, ist sie null — kein Abzug.
    const raw = applied - input.marketValueCtPerKwh;
    premiumCt = round4(Math.max(0, raw));
    if (raw < 0) {
      warnings.push(
        `Der Monatsmarktwert liegt ${Math.abs(round4(raw)).toFixed(4).replace(".", ",")} ct/kWh über dem anzulegenden Wert. Die Marktprämie beträgt null; ein Abzug findet nicht statt (§ 20 EEG).`,
      );
    }
  }

  // --- Menge ---------------------------------------------------------------
  let premiumEur: number | null = null;
  let premiumEurReason = premiumReason;
  if (premiumCt === null) {
    premiumEurReason = premiumReason;
  } else if (input.productionKwh === null) {
    premiumEurReason = REASONS.noProduction;
  } else {
    premiumEur = round2((premiumCt * input.productionKwh) / 100);
  }

  // --- Negative Preise -----------------------------------------------------
  let affectedHours: number | null = null;
  let forfeited: number | null = null;
  let forfeitedReason: string = REASONS.noHourlySeries;

  if (input.negativeHoursResult === null) {
    // Nicht 0 Stunden. „Keine Reihe geladen" ist nicht „keine negativen
    // Preise" — und der Unterschied ist bares Geld.
    affectedHours = null;
    forfeitedReason = REASONS.noHourlySeries;
  } else {
    affectedHours = input.negativeHoursResult.affectedHours;
    warnings.push(...input.negativeHoursResult.warnings);

    if (affectedHours === 0) {
      forfeited = 0;
      forfeitedReason = "";
    } else if (input.productionInNegativeHoursKwh === null) {
      forfeitedReason = REASONS.noNegativeProduction;
      warnings.push(
        `In ${affectedHours} Stunden entfällt der Anspruch nach § 51 EEG. ${REASONS.noNegativeProduction}`,
      );
    } else if (applied === null) {
      forfeitedReason = appliedReason;
    } else {
      forfeited = round2((applied * input.productionInNegativeHoursKwh) / 100);
    }
  }

  const statement = buildStatement({ applied, premiumCt, premiumEur, affectedHours, forfeited });

  return {
    appliedValueCtPerKwh: metric(applied, appliedReason),
    premiumCtPerKwh: metric(premiumCt, premiumReason),
    premiumEur: metric(premiumEur, premiumEurReason),
    forfeitedEur: metric(forfeited, forfeitedReason),
    affectedHours: metric(affectedHours, REASONS.noHourlySeries),
    warnings,
    statement,
  };
}

function buildStatement(input: {
  applied: number | null;
  premiumCt: number | null;
  premiumEur: number | null;
  affectedHours: number | null;
  forfeited: number | null;
}): string {
  const parts: string[] = [];

  if (input.applied !== null) {
    parts.push(`Anzulegender Wert ${fmt(input.applied, 4)} ct/kWh`);
  }
  if (input.premiumCt !== null) {
    parts.push(`Marktprämie ${fmt(input.premiumCt, 4)} ct/kWh`);
  }
  if (input.premiumEur !== null) {
    parts.push(`= ${fmt(input.premiumEur, 2)} EUR`);
  }
  if (input.affectedHours !== null && input.affectedHours > 0) {
    parts.push(
      input.forfeited !== null
        ? `abzüglich ${fmt(input.forfeited, 2)} EUR für ${input.affectedHours} Stunden mit negativen Preisen (§ 51 EEG)`
        : `${input.affectedHours} Stunden mit negativen Preisen (§ 51 EEG), Betrag nicht bezifferbar`,
    );
  }

  return parts.length > 0 ? parts.join(", ") + "." : "Nicht berechenbar — es fehlen Angaben.";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function fmt(value: number, digits: number): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
