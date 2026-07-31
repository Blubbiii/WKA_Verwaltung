/**
 * Zeitraum in Abschnitte zerlegen und die je Abschnitt gültigen Anteile
 * bestimmen.
 *
 * Gemeinsamer Kern zweier Aufteilungen mit gleicher Arithmetik, aber
 * verschiedener Regel:
 *
 * - **A5, Verpächteranteile**: Die Anteile MÜSSEN in jedem Abschnitt 100 %
 *   ergeben. Eine Lücke wäre Geld, das niemandem zugeordnet ist, und fiele
 *   erst auf, wenn ein Miteigentümer sich meldet.
 * - **A8, Gesellschafteranteile**: Sie müssen es NICHT. Wird ein Anteil
 *   eingezogen statt übertragen, bleibt der Rest beim Fonds — und genau der
 *   darf nicht auf die übrigen Gesellschafter hochnormalisiert werden
 *   (Finding 4.1).
 *
 * Die Zerlegung selbst ist identisch. Sie hier zu teilen ist besser, als sie
 * zweimal zu pflegen — zwei Fassungen derselben Datumsarithmetik driften
 * auseinander, und der Unterschied fällt bei Geldbeträgen erst spät auf.
 */

/**
 * Ein Anteil mit Gültigkeitszeitraum.
 *
 * Bewusst OHNE Kennung des Inhabers: die Zerlegung teilt Zeit und summiert
 * Quoten — wem der Anteil gehört, ist Sache des Aufrufers. So passt derselbe
 * Kern auf Verpächter (`personId`) und Gesellschafter (`shareholderId`), ohne
 * dass einer von beiden ein fremdes Feld mitschleppen muss.
 */
export interface TimedShare {
  /** Quote in Prozent. */
  sharePercent: number;
  /** Ab wann. `null` = seit jeher. */
  validFrom: Date | null;
  /** Bis einschliesslich. `null` = offen. */
  validTo: Date | null;
}

export interface PeriodSegment<T extends TimedShare> {
  start: Date;
  end: Date;
  /** Tage im Abschnitt, beide Grenzen einschliesslich. */
  days: number;
  /** Anteil des Abschnitts am Gesamtzeitraum, 0–1. */
  timeShare: number;
  /** Anteile, die im GESAMTEN Abschnitt gelten. */
  active: T[];
  /** Summe der Quoten im Abschnitt. */
  sumPercent: number;
}

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Zeitraum an jedem Wechseltag zerschneiden.
 *
 * Die Grenzen sind der Periodenanfang, jedes `validFrom` und jeder Tag NACH
 * einem `validTo`. Dadurch fällt der Wechseltag selbst bereits in den neuen
 * Abschnitt — `validTo: 30.06.` heisst „bis einschliesslich 30. Juni".
 */
export function splitIntoSegments<T extends TimedShare>(
  shares: readonly T[],
  periodStart: Date,
  periodEnd: Date,
): PeriodSegment<T>[] {
  const totalDays = daysBetween(periodStart, periodEnd);
  if (totalDays <= 0) return [];

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
  const segments: PeriodSegment<T>[] = [];

  for (const [index, cutTime] of cuts.entries()) {
    const start = new Date(cutTime);
    const end =
      index + 1 < cuts.length ? new Date(cuts[index + 1] - MS_PER_DAY) : new Date(periodEndDay);

    const days = daysBetween(start, end);
    if (days <= 0) continue;

    const active = shares.filter((share) => isActiveInSegment(share, start, end));

    segments.push({
      start,
      end,
      days,
      timeShare: days / totalDays,
      active,
      sumPercent: active.reduce((sum, share) => sum + share.sharePercent, 0),
    });
  }

  return segments;
}

/** Gilt der Anteil im GESAMTEN Abschnitt? */
export function isActiveInSegment(
  share: TimedShare,
  segmentStart: Date,
  segmentEnd: Date,
): boolean {
  if (share.validFrom && startOfDay(share.validFrom) > segmentStart) return false;
  if (share.validTo && startOfDay(share.validTo) < segmentEnd) return false;
  return true;
}

/**
 * Tage zwischen zwei Datumsangaben, beide einschliesslich.
 *
 * Bewusst auf Tagesebene über UTC-Mitternacht: eine Rechnung mit Zeitstempeln
 * zählte am Tag der Zeitumstellung 23 oder 25 Stunden und verschöbe die
 * Verteilung um Cent-Beträge.
 */
export function daysBetween(from: Date, to: Date): number {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.round((b - a) / MS_PER_DAY) + 1;
}

export function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function formatDay(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, "0")}.${String(
    date.getUTCMonth() + 1,
  ).padStart(2, "0")}.${date.getUTCFullYear()}`;
}

export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}
