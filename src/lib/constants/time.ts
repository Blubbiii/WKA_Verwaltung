/**
 * Time constants in milliseconds.
 *
 * Use these instead of hand-rolled `1000 * 60 * 60 * 24` multiplications.
 * The named constants make intent obvious and eliminate arithmetic typos.
 */

export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
export const MS_PER_WEEK = 7 * MS_PER_DAY;

/**
 * Mittlere Jahreslänge in Tagen — 365,25 statt 365.
 *
 * ## Wann dieser Wert richtig ist
 *
 * Für DAUERN, die sich über viele Jahre erstrecken und bei denen die
 * Schaltjahre statistisch mitlaufen sollen: das Alter einer Anlage, die
 * verbrauchte Lebensdauer eines Getriebes. Über 20 Jahre liegen fünf
 * Schaltjahre; mit 365 wäre das Alter um gut fünf Tage zu hoch.
 *
 * ## Wann er FALSCH ist
 *
 * Für FRISTEN mit kalendarischem Bezug. „Zehn Jahre ab dem 15. März" endet am
 * 15. März, nicht 3652,5 Tage später. Dafür gibt es `addYearsSafe()` in
 * `@/lib/date-utils` — die behandelt auch den 29. Februar richtig.
 *
 * ## Und wann 365 exakt
 *
 * Bei Verzugszinsen. `accounting/interest.ts` rechnet bewusst mit dem
 * kalendergenauen 365-Tage-Jahr und nicht mit dem Bankjahr 30/360; das ist
 * eine juristische Festlegung, keine Näherung, und bleibt deshalb dort stehen.
 */
export const DAYS_PER_YEAR_AVERAGE = 365.25;

/**
 * Compute whole days between two timestamps (flooring).
 * Returns 0 if `to` is before `from`.
 */
export function daysBetween(from: Date, to: Date): number {
  const diffMs = to.getTime() - from.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / MS_PER_DAY);
}
