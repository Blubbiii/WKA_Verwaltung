/**
 * Welcher Menüeintrag ist aktiv? Der mit der längsten passenden Adresse.
 *
 * Vorher galt jeder Eintrag als aktiv, dessen Adresse ein Präfix des Pfads
 * war: auf "/energy/productions" leuchteten "Übersicht" (/energy) und
 * "Produktionsdaten" zugleich; auf "/energy/scada/data" auch "SCADA-Zuordnung"
 * (/energy/scada) — die jetzt in einer anderen Gruppe steht.
 */

import { describe, expect, it } from "vitest";
import { aktivesZiel } from "./aktiv";

const hrefs = ["/energy", "/energy/productions", "/energy/scada", "/energy/scada/data", "/leases", "/leases/settlement"];

describe("aktivesZiel", () => {
  it("genau getroffen", () => {
    expect(aktivesZiel("/energy", hrefs)).toBe("/energy");
    expect(aktivesZiel("/energy/scada", hrefs)).toBe("/energy/scada");
  });

  it("die längste passende Adresse gewinnt", () => {
    expect(aktivesZiel("/energy/scada/data", hrefs)).toBe("/energy/scada/data");
    expect(aktivesZiel("/energy/productions/abc", hrefs)).toBe("/energy/productions");
    expect(aktivesZiel("/leases/settlement/new", hrefs)).toBe("/leases/settlement");
  });

  it("Unterseite ohne eigenen Eintrag: der nächste Vorfahr", () => {
    expect(aktivesZiel("/leases/abc/edit", hrefs)).toBe("/leases");
  });

  it("kein Präfix auf halbem Wort", () => {
    expect(aktivesZiel("/energyx", hrefs)).toBeNull();
  });
});
