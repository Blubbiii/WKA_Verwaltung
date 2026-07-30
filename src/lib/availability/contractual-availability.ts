/**
 * Vertragliche Verfügbarkeit und Bonus/Malus.
 *
 * Fehlende Funktion A2 (Audit 2026-07): Wartungsverträge liegen als
 * `Contract(SERVICE)` mit `annualValue`, aber ohne garantierte Verfügbarkeit,
 * Berechnungsmethode, Ausschlusstatbestände und Bonus/Malus-Staffel. Der
 * Hersteller rechnet die Verfügbarkeit selbst ab, der Betreiber hat keine
 * unabhängige Gegenrechnung.
 *
 * Zusammen damit gehört Finding F21 aus dem Rechenkorrektheits-Audit: die
 * bestehende Kennzahl `T1/(T1+T5)` ist **nicht** die, gegen die Garantien
 * abgerechnet werden.
 *
 * ## Warum es keine „richtige" Formel gibt
 *
 * Die vertragliche Verfügbarkeit steht im Vertrag, nicht in einer Norm. Zwei
 * Wartungsverträge derselben Anlage können unterschiedliche Zahlen ergeben,
 * und beide sind korrekt. Deshalb rechnet diese Datei nicht EINE Formel,
 * sondern die im Vertrag vereinbarte:
 *
 *   Basis        = alle Zeitkategorien − ausgeschlossene
 *   Verfügbar    = die als verfügbar vereinbarten Kategorien
 *   Verfügbarkeit = Verfügbar / Basis
 *
 * „Ausgeschlossen" bildet ab, was in Verträgen als nicht anrechenbar steht:
 * höhere Gewalt, Netzausfall, Eiswurf, behördliche Anordnung. Diese Zeiten
 * fallen aus Zähler UND Nenner — sie werden also weder dem Hersteller
 * angelastet noch ihm gutgeschrieben.
 *
 * ## Zeitkategorien
 *
 * Die SCADA-Daten liefern T1–T6 in Sekunden:
 *   T1 Produktion · T2 Windstille · T3 Umweltstopp · T4 Wartung
 *   T5 Störung · T6 Sonstiges
 * sowie die Unterkategorien T5.1–T5.3 als **Teilmengen von T5**.
 */

/** Zeitkategorien einer Anlage über einen Zeitraum, in Sekunden. */
export interface TimeBuckets {
  t1: number;
  t2: number;
  t3: number;
  t4: number;
  t5: number;
  t6: number;
  /** Teilmengen von T5. */
  t5_1: number;
  t5_2: number;
  t5_3: number;
}

export type MainCategory = "t1" | "t2" | "t3" | "t4" | "t5" | "t6";
export type SubCategory = "t5_1" | "t5_2" | "t5_3";
export type Category = MainCategory | SubCategory;

export const MAIN_CATEGORIES: readonly MainCategory[] = ["t1", "t2", "t3", "t4", "t5", "t6"];
export const SUB_CATEGORIES: readonly SubCategory[] = ["t5_1", "t5_2", "t5_3"];

export interface AvailabilityDefinition {
  /**
   * Kategorien, die als verfügbar gelten. Der Rest der Basis gilt als nicht
   * verfügbar.
   */
  availableCategories: readonly MainCategory[];
  /**
   * Kategorien, die aus der Basis herausfallen — weder verfügbar noch nicht
   * verfügbar. Unterkategorien mindern ihre Hauptkategorie.
   */
  excludedCategories: readonly Category[];
}

export interface AvailabilityResult {
  /** Verfügbarkeit in Prozent, auf zwei Stellen gerundet. */
  availabilityPct: number;
  /** Sekunden, die als verfügbar zählen. */
  availableSeconds: number;
  /** Sekunden der Bemessungsgrundlage. */
  basisSeconds: number;
  /** Sekunden, die durch Ausschlusstatbestände herausfielen. */
  excludedSeconds: number;
  warnings: string[];
}

export interface AvailabilityFailure {
  availabilityPct: null;
  reason: string;
}

/**
 * Vertragliche Verfügbarkeit nach der vereinbarten Definition.
 *
 * Gibt `null` mit Begründung zurück, wenn die Definition widersprüchlich ist
 * oder keine Basis übrigbleibt — nicht 0 %. Eine Verfügbarkeit von 0 % würde
 * die volle Pönale auslösen; das darf kein Ergebnis fehlender Daten sein.
 */
export function computeContractualAvailability(
  buckets: TimeBuckets,
  definition: AvailabilityDefinition,
): AvailabilityResult | AvailabilityFailure {
  const warnings: string[] = [];

  const availableSet = new Set<string>(definition.availableCategories);
  const excludedSet = new Set<string>(definition.excludedCategories);

  // Eine Kategorie kann nicht gleichzeitig verfügbar und ausgeschlossen sein.
  // Stillschweigend eines zu bevorzugen würde die Zahl unerklärbar machen.
  const conflict = definition.availableCategories.find((c) => excludedSet.has(c));
  if (conflict) {
    return {
      availabilityPct: null,
      reason: `Kategorie ${conflict.toUpperCase()} ist zugleich als verfügbar und als ausgeschlossen vereinbart`,
    };
  }

  if (definition.availableCategories.length === 0) {
    return {
      availabilityPct: null,
      reason: "Keine Kategorie als verfügbar vereinbart",
    };
  }

  // Unterkategorien von T5 mindern T5. Ohne diese Verrechnung würde eine
  // ausgeschlossene Unterkategorie doppelt zählen: einmal in T5, einmal im
  // Ausschluss.
  const excludedSubSeconds = SUB_CATEGORIES.filter((sub) => excludedSet.has(sub)).reduce(
    (sum, sub) => sum + Math.max(0, buckets[sub]),
    0,
  );

  const t5Total = Math.max(0, buckets.t5);
  let t5Remaining = t5Total - excludedSubSeconds;

  if (t5Remaining < 0) {
    // Datenfehler: die Unterkategorien summieren sich über T5 hinaus. Lieber
    // auf 0 begrenzen und melden, als eine negative Zeit in die Rechnung zu
    // tragen.
    warnings.push(
      `Unterkategorien von T5 (${Math.round(excludedSubSeconds / 3600)} h) übersteigen T5 (${Math.round(t5Total / 3600)} h) — auf 0 begrenzt`,
    );
    t5Remaining = 0;
  }

  // Effektive Sekunden je Hauptkategorie nach Verrechnung der Unterkategorien.
  const effective: Record<MainCategory, number> = {
    t1: Math.max(0, buckets.t1),
    t2: Math.max(0, buckets.t2),
    t3: Math.max(0, buckets.t3),
    t4: Math.max(0, buckets.t4),
    t5: t5Remaining,
    t6: Math.max(0, buckets.t6),
  };

  let basisSeconds = 0;
  let availableSeconds = 0;

  for (const category of MAIN_CATEGORIES) {
    if (excludedSet.has(category)) continue;
    basisSeconds += effective[category];
    if (availableSet.has(category)) availableSeconds += effective[category];
  }

  const excludedSeconds =
    MAIN_CATEGORIES.filter((c) => excludedSet.has(c)).reduce((sum, c) => sum + effective[c], 0) +
    Math.min(excludedSubSeconds, t5Total);

  if (basisSeconds <= 0) {
    return {
      availabilityPct: null,
      reason:
        "Keine Bemessungsgrundlage im Zeitraum — entweder fehlen die SCADA-Daten oder alle Zeiten sind ausgeschlossen",
    };
  }

  return {
    availabilityPct: round2((availableSeconds / basisSeconds) * 100),
    availableSeconds,
    basisSeconds,
    excludedSeconds,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Bonus / Malus
// ---------------------------------------------------------------------------

export type TierKind = "BONUS" | "MALUS";

/**
 * Wie der Betrag einer Staffel entsteht.
 *
 * `PER_PERCENTAGE_POINT` rechnet gegen die zur Zielmarke zeigende Grenze der
 * Staffel: bei einer Malus-Staffel bis 97 % und 95,4 % Ist sind das 1,6
 * Prozentpunkte.
 */
export type TierMode = "PER_PERCENTAGE_POINT" | "FIXED_EUR" | "PERCENT_OF_ANNUAL_VALUE";

/**
 * Rundung der Prozentpunkte. Steht so in Verträgen („je angefangenem
 * Prozentpunkt" / „je vollem Prozentpunkt") und entscheidet über den Betrag.
 */
export type PointRounding = "UP" | "DOWN" | "EXACT";

export interface BonusMalusTier {
  /** Untere Grenze (einschliesslich) in Prozent. */
  fromPct: number;
  /** Obere Grenze (ausschliesslich) in Prozent. */
  toPct: number;
  kind: TierKind;
  mode: TierMode;
  /** EUR, EUR je Prozentpunkt oder Prozent der Jahresvergütung — je nach mode. */
  amount: number;
}

export interface BonusMalusInput {
  availabilityPct: number;
  tiers: readonly BonusMalusTier[];
  /** Jahresvergütung des Wartungsvertrags in EUR. */
  annualValueEur: number;
  pointRounding: PointRounding;
  /** Obergrenze der Pönale in EUR. `null` = keine. */
  maxMalusEur: number | null;
  /** Obergrenze des Bonus in EUR. `null` = keine. */
  maxBonusEur: number | null;
}

export interface BonusMalusResult {
  kind: TierKind | null;
  /** Positiv = Forderung des Betreibers (Malus), negativ = Anspruch des Auftragnehmers (Bonus). */
  amountEur: number;
  /** Angewandte Staffel, für die Nachvollziehbarkeit. */
  appliedTier: BonusMalusTier | null;
  /** Prozentpunkte nach Rundung, sofern die Staffel danach rechnet. */
  points: number | null;
  /** Wurde eine Obergrenze wirksam? */
  cappedAt: number | null;
  warnings: string[];
}

/**
 * Bonus oder Malus zur erreichten Verfügbarkeit.
 *
 * Das Vorzeichen ist absichtlich aus Sicht des Betreibers: ein Malus ist eine
 * Forderung an den Auftragnehmer (positiv), ein Bonus eine Verbindlichkeit
 * (negativ). So lässt sich der Wert direkt in eine Gutschrift bzw. Rechnung
 * übernehmen, ohne dass jemand unterwegs das Vorzeichen dreht.
 */
export function computeBonusMalus(input: BonusMalusInput): BonusMalusResult {
  const { availabilityPct, tiers, annualValueEur, pointRounding, maxMalusEur, maxBonusEur } = input;
  const warnings: string[] = [];

  // Erste passende Staffel gewinnt. Überlappende Staffeln sind ein Fehler in
  // der Vertragserfassung — sie werden gemeldet, statt still die erste zu
  // nehmen und den Anwender im Unklaren zu lassen.
  const matching = tiers.filter(
    (tier) => availabilityPct >= tier.fromPct && availabilityPct < tier.toPct,
  );

  if (matching.length === 0) {
    // Kein Treffer heisst: im vereinbarten Korridor, weder Bonus noch Malus.
    return {
      kind: null,
      amountEur: 0,
      appliedTier: null,
      points: null,
      cappedAt: null,
      warnings,
    };
  }
  if (matching.length > 1) {
    warnings.push(
      `${matching.length} Staffeln treffen auf ${availabilityPct} % zu — die erste wurde angewandt, bitte die Staffelung prüfen`,
    );
  }

  const tier = matching[0];
  let points: number | null = null;
  let raw = 0;

  switch (tier.mode) {
    case "FIXED_EUR":
      raw = tier.amount;
      break;

    case "PERCENT_OF_ANNUAL_VALUE":
      raw = (annualValueEur * tier.amount) / 100;
      break;

    case "PER_PERCENTAGE_POINT": {
      // Gegen die zur Zielmarke zeigende Grenze rechnen: bei einem Malus ist
      // das die OBERE Grenze der Staffel, bei einem Bonus die untere.
      const distance =
        tier.kind === "MALUS" ? tier.toPct - availabilityPct : availabilityPct - tier.fromPct;
      points = roundPoints(distance, pointRounding);
      raw = points * tier.amount;
      break;
    }
  }

  raw = round2(Math.abs(raw));

  let cappedAt: number | null = null;
  if (tier.kind === "MALUS" && maxMalusEur !== null && raw > maxMalusEur) {
    cappedAt = maxMalusEur;
    raw = maxMalusEur;
  }
  if (tier.kind === "BONUS" && maxBonusEur !== null && raw > maxBonusEur) {
    cappedAt = maxBonusEur;
    raw = maxBonusEur;
  }

  return {
    kind: tier.kind,
    amountEur: tier.kind === "MALUS" ? raw : -raw,
    appliedTier: tier,
    points,
    cappedAt,
    warnings,
  };
}

function roundPoints(distance: number, rounding: PointRounding): number {
  const positive = Math.max(0, distance);
  switch (rounding) {
    case "UP":
      return Math.ceil(positive);
    case "DOWN":
      return Math.floor(positive);
    case "EXACT":
      // Auf zwei Stellen, sonst schleppt eine Fliesskommazahl Rundungsreste
      // in einen Eurobetrag.
      return round2(positive);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Die zwei gebräuchlichen Ausgangsdefinitionen als Vorlage.
 *
 * Sie sind ein Startpunkt beim Erfassen eines Vertrags, KEINE Vorgabe — was
 * gilt, steht im Vertragstext.
 */
export const DEFINITION_PRESETS: Record<string, AvailabilityDefinition> = {
  /** Zeitverfügbarkeit nach IEC 61400-26-1: Windstille zählt als verfügbar. */
  IEC_TIME_BASED: {
    availableCategories: ["t1", "t2", "t3", "t6"],
    excludedCategories: [],
  },
  /**
   * Übliche Herstellerdefinition: geplante Wartung und höhere Gewalt fallen
   * aus der Basis, alles andere zählt.
   */
  MANUFACTURER_TYPICAL: {
    availableCategories: ["t1", "t2", "t3", "t6"],
    excludedCategories: ["t4"],
  },
};
