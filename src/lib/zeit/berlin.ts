/**
 * Europe/Berlin wall clock without a timezone library (Intl only).
 * Used where a schedule or a data source speaks local German time.
 */

const TZ = "Europe/Berlin";
const teileFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Berlin wall-clock parts of an instant. */
export function berlinTeile(zeit: Date) {
  const t = Object.fromEntries(teileFormat.formatToParts(zeit).map((p) => [p.type, p.value]));
  return { y: +t.year, m: +t.month, d: +t.day, h: +t.hour, min: +t.minute, s: +t.second };
}

/** Offset of Berlin against UTC at that instant, in ms. */
function versatz(zeit: Date) {
  const t = berlinTeile(zeit);
  return Date.UTC(t.y, t.m - 1, t.d, t.h, t.min, t.s) - Math.floor(zeit.getTime() / 1000) * 1000;
}

/**
 * UTC instant of a Berlin wall-clock time. In the repeated hour of the
 * autumn switch this is the later (winter time) occurrence — callers that
 * read a sequence pick the earlier one themselves (see smard-csv).
 */
export function ausBerlin(y: number, m: number, d: number, h: number, min: number) {
  const naiv = Date.UTC(y, m - 1, d, h, min);
  const erster = naiv - versatz(new Date(naiv));
  // Second pass settles the hour around a DST switch.
  return new Date(naiv - versatz(new Date(erster)));
}

/**
 * A calendar month in German local time as a half-open UTC interval
 * [von, bis) — the delivery month of the German market. 743 hours in March,
 * 745 in October.
 */
export function berlinerMonat(jahr: number, monat: number) {
  const von = ausBerlin(jahr, monat, 1, 0, 0);
  const bis = ausBerlin(monat === 12 ? jahr + 1 : jahr, monat === 12 ? 1 : monat + 1, 1, 0, 0);
  return { von, bis, stunden: Math.round((bis.getTime() - von.getTime()) / 3_600_000) };
}
