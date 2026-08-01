/**
 * Die Prüfung, die den Fehler festhält, statt ihn nur zu beheben.
 *
 * Der entscheidende Fall ist der erste: Mitternacht UTC des heutigen Tages,
 * bewertet zu einem Zeitpunkt kurz nach lokaler Mitternacht. Genau da ist die
 * alte Prüfung gescheitert, und genau da würde sie es wieder tun, wenn jemand
 * sie zurückbaut.
 */

import { describe, it, expect } from "vitest";
import { calendarDay, isNotInFuture } from "./not-in-future";

describe("isNotInFuture", () => {
  it("laesst den heutigen Tag zu, auch kurz nach lokaler Mitternacht", () => {
    // 01.08.2026 22:30 UTC = 02.08.2026 00:30 in Berlin (Sommerzeit, UTC+2).
    const jetzt = new Date("2026-08-01T22:30:00.000Z");
    // Die Oberflaeche schickt den gewaehlten Tag als Mitternacht UTC.
    const heuteAusSichtDesNutzers = "2026-08-02T00:00:00.000Z";

    expect(
      isNotInFuture(heuteAusSichtDesNutzers, jetzt),
      "Der heutige Tag wurde als Zukunft abgelehnt — genau der Fehler, " +
        "wegen dem diese Datei existiert",
    ).toBe(true);
  });

  it("weist den naechsten Tag weiterhin ab", () => {
    // Die Regel darf sich nicht ins Gegenteil verkehren: § 146 AO verbietet
    // die Vordatierung, und das muss sie weiterhin tun.
    const jetzt = new Date("2026-08-01T22:30:00.000Z");
    expect(
      isNotInFuture("2026-08-03T00:00:00.000Z", jetzt),
      "Eine Buchung auf uebermorgen kam durch",
    ).toBe(false);
  });

  it("weist auch den Folgetag ab, wenn er in Berlin gerade erst begonnen hat", () => {
    // 02.08. 23:00 Berlin = 21:00 UTC. Der 03.08. ist Zukunft, auch wenn er
    // in UTC nur zwei Stunden entfernt ist.
    const jetzt = new Date("2026-08-02T21:00:00.000Z");
    expect(isNotInFuture("2026-08-03T00:00:00.000Z", jetzt)).toBe(false);
  });

  it("laesst die Vergangenheit zu", () => {
    const jetzt = new Date("2026-08-02T10:00:00.000Z");
    expect(isNotInFuture("2025-12-31T00:00:00.000Z", jetzt)).toBe(true);
  });

  it("laesst eine spaetere Uhrzeit desselben Tages zu", () => {
    // Bewusst: ein Buchungsdatum ist ein Datum. Die Uhrzeit darin ist eine
    // Darstellungsfrage, keine Aussage ueber die Periode.
    //
    // 18:00 UTC und nicht 22:00 — in Berlin ist 22:00 UTC bereits der
    // Folgetag. Mein erster Versuch stand genau dort, und der Test hat es
    // gemeldet. Das ist derselbe Denkfehler wie der, um den es hier geht:
    // eine Uhrzeit in UTC sagt nichts darueber, welcher Tag es beim Nutzer
    // gerade ist.
    const jetzt = new Date("2026-08-02T08:00:00.000Z");
    expect(isNotInFuture("2026-08-02T18:00:00.000Z", jetzt)).toBe(true);
  });

  it("weist ein unlesbares Datum ab", () => {
    expect(isNotInFuture("kein Datum")).toBe(false);
    expect(isNotInFuture("")).toBe(false);
  });

  it("nimmt auch ein Date-Objekt entgegen", () => {
    const jetzt = new Date("2026-08-02T10:00:00.000Z");
    expect(isNotInFuture(new Date("2026-08-02T00:00:00.000Z"), jetzt)).toBe(true);
  });
});

describe("calendarDay", () => {
  it("rechnet in die angegebene Zeitzone um", () => {
    const zeitpunkt = new Date("2026-08-01T22:30:00.000Z");
    expect(calendarDay(zeitpunkt, "Europe/Berlin")).toBe("2026-08-02");
    expect(calendarDay(zeitpunkt, "UTC")).toBe("2026-08-01");
  });

  it("liefert ein sortierbares Format", () => {
    // Darauf beruht der String-Vergleich in isNotInFuture. Ein Format wie
    // "01.08.2026" wuerde die Pruefung still falsch machen.
    const a = calendarDay(new Date("2026-08-09T12:00:00.000Z"), "UTC");
    const b = calendarDay(new Date("2026-08-10T12:00:00.000Z"), "UTC");
    expect(a < b).toBe(true);
  });
});
