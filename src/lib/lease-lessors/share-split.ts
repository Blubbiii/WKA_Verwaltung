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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Betrag auf die Verpächter verteilen.
 *
 * Gibt `null` mit Begründung zurück, wenn die Anteile in einem Teilabschnitt
 * nicht 100 % ergeben. Das ist der wichtigste Teil: eine Lücke oder
 * Überschneidung würde Geld stillschweigend falsch zuordnen — und bei einer
 * Pachtgutschrift fällt das erst auf, wenn ein Miteigentümer sich meldet.
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

  // Zeitraum an jedem Wechseltag zerschneiden. Die Grenzen sind der
  // Periodenanfang, jedes validFrom und jeder Tag nach einem validTo.
  const boundaries = new Set<number>([startOfDay(periodStart).getTime()]);
  for (const share of shares) {
    if (share.validFrom && share.validFrom > periodStart && share.validFrom <= periodEnd) {
      boundaries.add(startOfDay(share.validFrom).getTime());
    }
    if (share.validTo && share.validTo >= periodStart && share.validTo < periodEnd) {
      boundaries.add(startOfDay(addDays(share.validTo, 1)).getTime());
    }
  }

  const cuts = [...boundaries].sort((a, b) => a - b);
  const periodEndDay = startOfDay(periodEnd).getTime();

  const totalDays = daysBetween(periodStart, periodEnd);
  if (totalDays <= 0) {
    return { allocations: null, reason: "Zeitraum umfasst keine Tage" };
  }

  const byPerson = new Map<string, { amountEur: number; days: number; effective: number }>();

  for (const [index, cutTime] of cuts.entries()) {
    const segmentStart = new Date(cutTime);
    const segmentEnd =
      index + 1 < cuts.length ? new Date(cuts[index + 1] - MS_PER_DAY) : new Date(periodEndDay);

    const segmentDays = daysBetween(segmentStart, segmentEnd);
    if (segmentDays <= 0) continue;

    const active = shares.filter((share) => isActive(share, segmentStart, segmentEnd));

    if (active.length === 0) {
      return {
        allocations: null,
        reason: `Für den Abschnitt ${formatDate(segmentStart)}–${formatDate(segmentEnd)} ist kein Verpächter hinterlegt`,
      };
    }

    const sum = active.reduce((total, share) => total + share.sharePercent, 0);
    if (Math.abs(sum - 100) > SHARE_TOLERANCE) {
      return {
        allocations: null,
        reason: `Die Anteile im Abschnitt ${formatDate(segmentStart)}–${formatDate(
          segmentEnd,
        )} ergeben ${sum.toFixed(2)} % statt 100 %`,
      };
    }

    const timeShare = segmentDays / totalDays;

    for (const share of active) {
      const entry = byPerson.get(share.personId) ?? { amountEur: 0, days: 0, effective: 0 };
      const effective = (share.sharePercent / 100) * timeShare;
      entry.amountEur += amountEur * effective;
      entry.days += segmentDays;
      entry.effective += effective * 100;
      byPerson.set(share.personId, entry);
    }
  }

  if (cuts.length > 1) {
    warnings.push(
      `Eigentümerwechsel im Zeitraum — der Betrag ist auf ${cuts.length} Abschnitte zeitanteilig verteilt.`,
    );
  }

  // Runden und den Rest zuweisen. Ohne diesen Schritt summieren sich die
  // Einzelbeträge nicht exakt auf den Gesamtbetrag — bei einer Gutschrift wäre
  // das ein Cent, der nirgends steht.
  const entries = [...byPerson.entries()];
  const allocations: SplitAllocation[] = entries.map(([personId, value]) => ({
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

  return { allocations, segmentCount: cuts.length, warnings };
}

/** Gilt der Anteil im gesamten Abschnitt? */
function isActive(share: LessorShare, segmentStart: Date, segmentEnd: Date): boolean {
  if (share.validFrom && startOfDay(share.validFrom) > segmentStart) return false;
  if (share.validTo && startOfDay(share.validTo) < segmentEnd) return false;
  return true;
}

/**
 * Tage zwischen zwei Datumsangaben, beide einschliesslich.
 *
 * Bewusst auf Tagesebene und über UTC-Mitternacht: eine Berechnung mit
 * Zeitstempeln würde bei einem Sommerzeitwechsel im Zeitraum einen Tag mit
 * 23 oder 25 Stunden zählen und die Verteilung um Cent-Beträge verschieben.
 */
function daysBetween(from: Date, to: Date): number {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.round((b - a) / MS_PER_DAY) + 1;
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatDate(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, "0")}.${String(
    date.getUTCMonth() + 1,
  ).padStart(2, "0")}.${date.getUTCFullYear()}`;
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
    const active = shares.filter((share) => isActive(share, at, at));
    const sum = active.reduce((total, share) => total + share.sharePercent, 0);
    if (active.length > 0 && Math.abs(sum - 100) > SHARE_TOLERANCE) {
      problems.push(`Am ${formatDate(at)} ergeben die Anteile ${sum.toFixed(2)} % statt 100 %`);
    }
  }

  return problems;
}
