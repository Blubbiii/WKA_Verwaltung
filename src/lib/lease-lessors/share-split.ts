/**
 * Aufteilung eines Pachtbetrags auf mehrere Verpächter — nach Quote und Stichtag.
 *
 * Fehlende Funktion A5 (Audit 2026-07): `Lease.lessorId` ist genau EINE Person.
 * Keine Quote, kein Stichtag, keine Historie. Nach 20 Jahren Vertragslaufzeit
 * ist die Erbengemeinschaft der Normalfall, ebenso der Flurstücksverkauf mitten
 * in der Abrechnungsperiode.
 *
 * Behelfslösungen heute: eine Sammel-Person „Erbengemeinschaft Müller" mit
 * einem Konto, oder Vertragsdubletten. **Beides bricht SEPA und die
 * Umsatzsteuerzuordnung** — jeder Miteigentümer ist ein eigenes
 * Umsatzsteuersubjekt und braucht seine eigene Gutschrift auf sein eigenes
 * Konto.
 *
 * ## Zusammenhang mit den Findings F1 und F2
 *
 * Beide sind bereits behoben — mit **Kopfteilung** als Zwischenannahme, weil
 * es keine Quote im Schema gab. Beide Stellen tragen ein
 * `TODO(schema): LeasePlot.sharePercent`. Diese Datei ist die Fortsetzung: mit
 * echten Quoten ist die Kopfteilung nur noch der Sonderfall „alle gleich".
 *
 * ## Warum Zeitanteil UND Quote
 *
 * Ein Eigentümerwechsel zum 30. Juni teilt das Jahr. Nur nach Quote zu
 * verteilen gäbe dem Verkäufer den vollen Jahresanteil, nur nach Zeit zu
 * teilen ignorierte die Miteigentumsquote. Beides zusammen ist die einzige
 * richtige Rechnung — und beides zusammen macht niemand von Hand korrekt.
 */

import {
  splitIntoSegments,
  isActiveInSegment,
  startOfDay,
  addDays,
  formatDay,
  roundCents,
} from "@/lib/period-shares/segments";

export interface LessorShare {
  /** Person, die den Anteil hält. */
  personId: string;
  /** Miteigentumsquote in Prozent (0–100). */
  sharePercent: number;
  /** Ab wann der Anteil gilt. `null` = seit jeher. */
  validFrom: Date | null;
  /** Bis wann (einschliesslich). `null` = offen. */
  validTo: Date | null;
}

export interface SplitAllocation {
  personId: string;
  amountEur: number;
  /** Tage, an denen die Person am Zeitraum beteiligt war. */
  days: number;
  /**
   * Wirksamer Anteil am Gesamtbetrag in Prozent — Quote mal Zeitanteil.
   * Das ist die Zahl, die in einer Gutschrift erklärt werden muss.
   */
  effectiveSharePercent: number;
}

export interface SplitResult {
  allocations: SplitAllocation[];
  /** Teilabschnitte, in die der Zeitraum zerfällt (bei Eigentümerwechsel > 1). */
  segmentCount: number;
  warnings: string[];
}

export interface SplitFailure {
  allocations: null;
  reason: string;
}

/**
 * Toleranz für die Anteilssumme. 0,01 Prozentpunkte fangen Rundungen aus
 * Bruchquoten ab (1/3 = 33,33 %), ohne echte Lücken zu verstecken.
 */
const SHARE_TOLERANCE = 0.011;

/**
 * Betrag auf die Verpächter verteilen.
 *
 * Gibt `null` mit Begründung zurück, wenn die Anteile in einem Teilabschnitt
 * nicht 100 % ergeben. Das ist der wichtigste Teil: eine Lücke oder
 * Überschneidung würde Geld stillschweigend falsch zuordnen — und bei einer
 * Pachtgutschrift fällt das erst auf, wenn ein Miteigentümer sich meldet.
 *
 * Die Zerlegung in Abschnitte teilt sich diese Datei mit der
 * Gesellschafterverteilung (A8); die REGEL unterscheidet sich: dort ist eine
 * Lücke zulässig und wird als nicht verteilter Rest ausgewiesen.
 */
export function splitByLessor(input: {
  shares: readonly LessorShare[];
  /** Abrechnungszeitraum, beide Grenzen einschliesslich. */
  periodStart: Date;
  periodEnd: Date;
  amountEur: number;
}): SplitResult | SplitFailure {
  const { shares, periodStart, periodEnd, amountEur } = input;

  if (periodEnd < periodStart) {
    return { allocations: null, reason: "Das Ende des Zeitraums liegt vor dem Beginn" };
  }
  if (shares.length === 0) {
    return { allocations: null, reason: "Keine Verpächter hinterlegt" };
  }

  const warnings: string[] = [];
  const segments = splitIntoSegments(shares, periodStart, periodEnd);

  if (segments.length === 0) {
    return { allocations: null, reason: "Zeitraum umfasst keine Tage" };
  }

  const byPerson = new Map<string, { amountEur: number; days: number; effective: number }>();

  for (const segment of segments) {
    if (segment.active.length === 0) {
      return {
        allocations: null,
        reason: `Für den Abschnitt ${formatDay(segment.start)}–${formatDay(
          segment.end,
        )} ist kein Verpächter hinterlegt`,
      };
    }

    if (Math.abs(segment.sumPercent - 100) > SHARE_TOLERANCE) {
      return {
        allocations: null,
        reason: `Die Anteile im Abschnitt ${formatDay(segment.start)}–${formatDay(
          segment.end,
        )} ergeben ${segment.sumPercent.toFixed(2)} % statt 100 %`,
      };
    }

    for (const share of segment.active) {
      const entry = byPerson.get(share.personId) ?? { amountEur: 0, days: 0, effective: 0 };
      const effective = (share.sharePercent / 100) * segment.timeShare;
      entry.amountEur += amountEur * effective;
      entry.days += segment.days;
      entry.effective += effective * 100;
      byPerson.set(share.personId, entry);
    }
  }

  if (segments.length > 1) {
    warnings.push(
      `Eigentümerwechsel im Zeitraum — der Betrag ist auf ${segments.length} Abschnitte zeitanteilig verteilt.`,
    );
  }

  // Runden und den Rest zuweisen. Ohne diesen Schritt summieren sich die
  // Einzelbeträge nicht exakt auf den Gesamtbetrag — bei einer Gutschrift wäre
  // das ein Cent, der nirgends steht.
  const allocations: SplitAllocation[] = [...byPerson.entries()].map(([personId, value]) => ({
    personId,
    amountEur: roundCents(value.amountEur),
    days: value.days,
    effectiveSharePercent: Math.round(value.effective * 10000) / 10000,
  }));

  const distributed = roundCents(allocations.reduce((sum, a) => sum + a.amountEur, 0));
  const difference = roundCents(amountEur - distributed);

  if (difference !== 0) {
    // Auf den grössten Anteil legen: dort fällt ein Cent am wenigsten ins
    // Gewicht, und die Zuweisung ist reproduzierbar statt zufällig.
    const largest = allocations.reduce((best, current) =>
      Math.abs(current.amountEur) > Math.abs(best.amountEur) ? current : best,
    );
    largest.amountEur = roundCents(largest.amountEur + difference);
    if (Math.abs(difference) > 0.01 * allocations.length + 0.01) {
      warnings.push(
        `Rundungsdifferenz von ${difference.toFixed(2)} EUR auf den grössten Anteil gelegt — bitte die Quoten prüfen.`,
      );
    }
  }

  return { allocations, segmentCount: segments.length, warnings };
}

/**
 * Prüft eine Anteilsdefinition unabhängig von einem Zeitraum.
 *
 * Für die Erfassungsmaske: sie soll melden, bevor gespeichert wird, nicht erst
 * bei der Abrechnung ein halbes Jahr später.
 */
export function validateShares(shares: readonly LessorShare[]): string[] {
  const problems: string[] = [];

  if (shares.length === 0) {
    problems.push("Mindestens ein Verpächter erforderlich");
    return problems;
  }

  for (const share of shares) {
    if (share.sharePercent <= 0 || share.sharePercent > 100) {
      problems.push(`Ungültige Quote: ${share.sharePercent} %`);
    }
    if (share.validFrom && share.validTo && share.validTo < share.validFrom) {
      problems.push("Ende eines Anteils liegt vor dessen Beginn");
    }
  }

  // Summe je Stichtag prüfen: an jedem Wechseltag muss sie 100 % ergeben.
  const dates = new Set<number>();
  for (const share of shares) {
    if (share.validFrom) dates.add(startOfDay(share.validFrom).getTime());
    if (share.validTo) dates.add(startOfDay(addDays(share.validTo, 1)).getTime());
  }
  // Auch ein Stichtag ohne jeden Wechsel muss geprüft werden — sonst bliebe
  // eine Definition ganz ohne Datumsangaben ungeprüft.
  if (dates.size === 0) dates.add(startOfDay(new Date()).getTime());

  for (const time of dates) {
    const at = new Date(time);
    const active = shares.filter((share) => isActiveInSegment(share, at, at));
    const sum = active.reduce((total, share) => total + share.sharePercent, 0);
    if (active.length > 0 && Math.abs(sum - 100) > SHARE_TOLERANCE) {
      problems.push(`Am ${formatDay(at)} ergeben die Anteile ${sum.toFixed(2)} % statt 100 %`);
    }
  }

  return problems;
}
