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

/**
 * Volle Kalendertage zwischen zwei Zeitpunkten, gezählt in der Zeitzone des
 * Betriebs. Nie negativ.
 *
 * ## Warum nicht einfach UTC-Mitternacht
 *
 * Die Verzugsrechnung normalisierte beide Seiten auf UTC-Mitternacht, mit der
 * Begründung, das halte Zeitzonen und Sommerzeit heraus. Für das Fälligkeits-
 * datum stimmt das — es ist ohnehin als Mitternacht UTC gespeichert. Für den
 * **Jetzt**-Zeitpunkt stimmt es nicht: der ist ein echter Zeitstempel, und
 * sein UTC-Datum weicht zwischen 00:00 und 02:00 deutscher Zeit vom
 * deutschen Kalendertag ab.
 *
 * In diesem Fenster zählte die Anwendung einen Tag zu wenig. Das entscheidet
 * über die Mahnstufe und geht als Tageszahl in die Verzugszinsen nach § 288
 * BGB ein. Nächtliche Läufe fallen genau hinein — dort war es nicht die
 * Ausnahme, sondern der Normalfall.
 *
 * Aufgefallen ist es einem Testlauf um 00:52 Uhr, der 13 statt 14 Tage sah.
 */
export function kalendertageSeit(
  von: Date,
  bis: Date,
  timeZone: string = APP_TIMEZONE,
): number {
  // Über den Kalendertag-String, damit es nur EINE Zeitzonen-Umrechnung gibt.
  // Aus `YYYY-MM-DD` wieder einen UTC-Zeitpunkt zu bauen ist verlustfrei —
  // beide Seiten sind dann derselbe, zeitzonenfreie Kalendertag.
  const alsTag = (d: Date) => {
    const [j, m, t] = calendarDay(d, timeZone).split("-").map(Number);
    return Date.UTC(j, m - 1, t);
  };
  const tage = Math.floor((alsTag(bis) - alsTag(von)) / 86_400_000);
  return Math.max(0, tage);
}

/** Einheitlicher Text für alle Routen, die diese Regel durchsetzen. */
export function futureDateMessage(feld: string): string {
  return `${feld} darf nicht in der Zukunft liegen`;
}
