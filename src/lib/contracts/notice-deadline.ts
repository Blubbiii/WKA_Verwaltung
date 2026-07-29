/**
 * Kuendigungsfrist-Berechnung fuer Vertraege.
 *
 * Bewusst als eigene Funktion, weil die Rueckwaertsrechnung ab einem
 * Monatsende die klassische setMonth()-Falle ist:
 *
 *   const d = new Date(2026, 2, 31);      // 31.03.2026
 *   d.setMonth(d.getMonth() - 1);         // fragt nach dem "31. Februar"
 *   // → 03.03.2026 statt 28.02.2026
 *
 * Das Ergebnis liegt *nach* dem korrekten Termin: der Nutzer glaubt, er habe
 * noch bis zum 03.03. Zeit, tatsaechlich war der 28.02. der letzte Tag. Eine
 * verpasste Kuendigungsfrist verlaengert den Vertrag um eine volle Periode.
 */

import { addMonthsSafe } from "@/lib/date-utils";

/**
 * Kuendigungstermin = Vertragsende minus Kuendigungsfrist (in Monaten).
 *
 * Der Zieltag wird an die Laenge des Zielmonats geklemmt, nie darueber hinaus
 * gerollt. 31.03. minus 1 Monat ergibt daher den 28.02. (bzw. 29.02. im
 * Schaltjahr) — der letzte Tag, an dem die Frist noch gewahrt ist.
 *
 * @param endDate            Vertragsende
 * @param noticePeriodMonths Kuendigungsfrist in Monaten (>= 0)
 */
export function calculateNoticeDeadline(
  endDate: Date,
  noticePeriodMonths: number
): Date {
  return addMonthsSafe(endDate, -noticePeriodMonths);
}
