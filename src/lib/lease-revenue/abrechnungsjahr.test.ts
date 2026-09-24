/**
 * Abrechnungsjahr vor der Inbetriebnahme.
 *
 * Der Assistent ließ 2025 für einen Park mit Inbetriebnahme 2026 zu, schrieb
 * in Schritt 2 Umsätze und eine offene Abrechnung — und scheiterte erst in
 * Schritt 3 an "0. Betriebsjahr". Schritt 1 prüft das jetzt selbst.
 */

import { describe, expect, it } from "vitest";
import { jahrVorInbetriebnahme } from "./abrechnungsjahr";

describe("jahrVorInbetriebnahme", () => {
  it("erkennt ein Jahr vor der Inbetriebnahme", () => {
    expect(jahrVorInbetriebnahme(2025, "2026-03-01T00:00:00.000Z")).toBe(true);
  });

  it("lässt das Jahr der Inbetriebnahme und spätere zu", () => {
    expect(jahrVorInbetriebnahme(2026, "2026-03-01T00:00:00.000Z")).toBe(false);
    expect(jahrVorInbetriebnahme(2030, "2026-03-01T00:00:00.000Z")).toBe(false);
  });

  it("ohne Datum entscheidet die Berechnung (sie meldet das fehlende Datum)", () => {
    expect(jahrVorInbetriebnahme(2025, null)).toBe(false);
    expect(jahrVorInbetriebnahme(2025, undefined)).toBe(false);
  });

  it("zählt nach Kalenderjahr in Berlin, nicht nach UTC", () => {
    // 01.01.2026 00:30 Berlin = 31.12.2025 23:30 UTC
    expect(jahrVorInbetriebnahme(2025, "2025-12-31T23:30:00.000Z")).toBe(true);
  });
});
