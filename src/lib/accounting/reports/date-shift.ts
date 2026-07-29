/**
 * Schaltjahr-sichere Jahresverschiebung für Vorjahresvergleiche (Randfall 15).
 *
 * `new Date(d).setFullYear(y - 1)` normalisiert einen ungültigen Tag nach
 * vorne: aus dem 29.02.2024 wird der 01.03.2023. In EÜR und GuV wurde damit
 * der Vorjahres-Vergleichszeitraum in Schaltjahren um einen Tag verschoben —
 * an der unteren Grenze fiel ein Buchungstag heraus, an der oberen kam einer
 * zu viel dazu.
 *
 * shiftYears() klemmt den Tag stattdessen auf das Monatsende des Zieljahres:
 * 29.02.2024 − 1 Jahr = 28.02.2023. Uhrzeit und Zeitzonen-Semantik (UTC)
 * bleiben unverändert.
 */
export function shiftYears(date: Date, deltaYears: number): Date {
  const targetYear = date.getUTCFullYear() + deltaYears;
  const month = date.getUTCMonth();

  // Letzter Tag des Zielmonats im Zieljahr (Tag 0 des Folgemonats).
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, month + 1, 0),
  ).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDayOfTargetMonth);

  return new Date(
    Date.UTC(
      targetYear,
      month,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}
