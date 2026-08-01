/**
 * "Nicht in der Zukunft" — auf Kalendertage, nicht auf Zeitstempel.
 *
 * ## Der Fehler, den das behebt
 *
 * Fünf API-Routen prüften `new Date(v).getTime() <= Date.now()`. Das klingt
 * richtig und ist es die meiste Zeit auch. Es bricht in einem schmalen
 * Fenster, das aber jeden Tag wiederkommt:
 *
 * Die Oberfläche schickt ein gewähltes Datum als **Mitternacht UTC**. Wer in
 * Deutschland um 00:30 Uhr den heutigen Tag wählt, schickt damit einen
 * Zeitstempel, der in UTC noch 1½ Stunden in der Zukunft liegt — Berlin ist
 * UTC+1 bzw. +2. Die Buchung wird abgelehnt mit „Buchungsdatum darf nicht in
 * der Zukunft liegen", obwohl der Nutzer den heutigen Tag gewählt hat.
 *
 * Gefunden hat das ein Testlauf, der zufällig kurz nach Mitternacht startete.
 * Vorher lief derselbe Test monatelang grün — das Fenster ist ein bis zwei
 * Stunden breit und wandert mit der Sommerzeit.
 *
 * ## Warum Kalendertag die richtige Körnung ist
 *
 * § 146 AO verbietet die **Vor**datierung: eine Buchung auf einen späteren
 * Tag als heute. Ein Buchungsdatum ist ein Datum, keine Uhrzeit. Der heutige
 * Tag ist nie eine Vordatierung — egal, welcher Zeitstempel ihn darstellt.
 * Die Prüfung auf Zeitstempel war also nicht nur zu streng, sie hat die
 * falsche Grösse gemessen.
 *
 * Das Kassenbuch machte es schon vorher richtig („heute inklusive erlaubt",
 * über Ende-des-Tages). Diese Datei zieht die übrigen nach und rechnet
 * zusätzlich in der Zeitzone des Betriebs statt in UTC.
 *
 * ## Zeitzone
 *
 * Aus `APP_TIMEZONE`, sonst Europe/Berlin — dieselbe Voreinstellung wie die
 * Cron-Zeitzone und die Einstellung `general.app.timezone`. Bewusst aus der
 * Umgebung und nicht aus den Mandanten-Einstellungen: Zod-Prüfungen laufen
 * synchron, ein Datenbankzugriff ist hier nicht möglich. Wer echte
 * Mandanten-Zeitzonen braucht, muss die Prüfung aus dem Schema in die Route
 * ziehen.
 */

export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Europe/Berlin";

/**
 * Der Kalendertag eines Zeitpunkts in der angegebenen Zeitzone, als
 * `YYYY-MM-DD`. Das Format ist bewusst sortierbar — damit genügt ein
 * String-Vergleich, und es gibt keine zweite Zeitzonen-Umrechnung, die
 * danebengehen könnte.
 */
export function calendarDay(date: Date, timeZone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Liegt der Wert auf einem Kalendertag, der nicht nach heute liegt?
 *
 * Heute selbst ist erlaubt. Ein unlesbares Datum ist es nicht — `false` ist
 * hier die sichere Antwort, sonst käme Unsinn durch die Prüfung.
 *
 * @param jetzt Nur für Tests. In der Anwendung immer die aktuelle Zeit.
 */
export function isNotInFuture(
  value: string | Date,
  jetzt: Date = new Date(),
): boolean {
  const datum = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(datum.getTime())) return false;
  return calendarDay(datum) <= calendarDay(jetzt);
}

/** Einheitlicher Text für alle Routen, die diese Regel durchsetzen. */
export function futureDateMessage(feld: string): string {
  return `${feld} darf nicht in der Zukunft liegen`;
}
