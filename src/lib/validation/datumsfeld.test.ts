/**
 * „Heute" und Datumsfelder in deutscher Zeit.
 *
 * `new Date().toISOString().slice(0, 10)` liefert den UTC-Tag. Zwischen
 * Mitternacht und 01:00 (Winter) bzw. 02:00 (Sommer) deutscher Zeit ist das
 * noch GESTERN. Acht Formulare setzten so ihr Vorgabedatum — darunter das
 * Zahlungsdatum und der Stichtag des Anteilsregisters.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { alsDatumsfeldWert, heuteKalendertag } from "./datumsfeld";

afterEach(() => {
  vi.useRealTimers();
});

describe("heuteKalendertag", () => {
  it("liefert kurz nach Mitternacht schon den neuen Tag", () => {
    // 1. April 2026, 00:30 Sommerzeit = 31. März, 22:30 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T22:30:00.000Z"));
    expect(heuteKalendertag()).toBe("2026-04-01");
    // Genau das lieferte das alte Muster falsch:
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-03-31");
  });

  it("stimmt auch im Winter", () => {
    // 15. Januar 2026, 00:15 Winterzeit = 14. Januar, 23:15 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-14T23:15:00.000Z"));
    expect(heuteKalendertag()).toBe("2026-01-15");
  });

  it("tagsüber ohne Unterschied", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T10:00:00.000Z"));
    expect(heuteKalendertag()).toBe("2026-06-10");
  });
});

describe("alsDatumsfeldWert", () => {
  it("ein Zeitstempel kurz vor Mitternacht UTC gehört zum deutschen Folgetag", () => {
    // Eine Rechnung vom 1. April, 00:30 deutscher Zeit
    expect(alsDatumsfeldWert("2026-03-31T22:30:00.000Z")).toBe("2026-04-01");
    expect(alsDatumsfeldWert(new Date("2026-03-31T22:30:00.000Z"))).toBe("2026-04-01");
  });

  it("reine Datumswerte bleiben, wie sie sind", () => {
    expect(alsDatumsfeldWert("2026-03-01")).toBe("2026-03-01");
    // Als UTC-Mitternacht gespeichert — in Berlin derselbe Tag
    expect(alsDatumsfeldWert("2026-03-01T00:00:00.000Z")).toBe("2026-03-01");
  });

  it("leere Werte werden zu einem leeren Feld", () => {
    expect(alsDatumsfeldWert(null)).toBe("");
    expect(alsDatumsfeldWert(undefined)).toBe("");
    expect(alsDatumsfeldWert("")).toBe("");
  });

  it("Unlesbares wird unverändert durchgereicht", () => {
    expect(alsDatumsfeldWert("kein Datum")).toBe("kein Datum");
  });
});
