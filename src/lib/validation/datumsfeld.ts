/**
 * „Heute" und Datumsfelder in deutscher Zeit.
 *
 * Ohne Server-Abhängigkeiten, damit Formulare im Browser es nutzen können.
 * Die Zeitzonenlogik steckt in `calendarDay()` — hier gibt es keine zweite.
 *
 * Warum nicht `toISOString().slice(0, 10)`: Das ist der UTC-Tag. Kurz nach
 * Mitternacht deutscher Zeit ist er noch gestern, und genau zu dieser Zeit
 * sitzt jemand am Monatsabschluss.
 */

import { calendarDay } from "./not-in-future";

/** Der heutige Kalendertag in deutscher Zeit, als `YYYY-MM-DD`. */
export function heuteKalendertag(): string {
  return calendarDay(new Date());
}

/**
 * Ein Wert für `<input type="date">`.
 *
 * Reine Datumswerte (`YYYY-MM-DD`) bleiben unverändert. Zeitstempel werden
 * auf den deutschen Kalendertag abgebildet — ein Beleg vom 1. April, 00:30,
 * steht in UTC am 31. März und darf im Feld nicht als 31. März erscheinen:
 * Wer die Zelle dann speichert, schreibt den falschen Tag zurück.
 */
export function alsDatumsfeldWert(wert: string | number | Date | null | undefined): string {
  if (wert === null || wert === undefined || wert === "") return "";
  if (wert instanceof Date) {
    return Number.isNaN(wert.getTime()) ? "" : calendarDay(wert);
  }
  const text = String(wert);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const zeitpunkt = new Date(text);
  return Number.isNaN(zeitpunkt.getTime()) ? text : calendarDay(zeitpunkt);
}
