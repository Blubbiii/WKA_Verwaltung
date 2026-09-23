/**
 * Tabellenzustand in URL und LocalStorage.
 *
 * Aufgefallen im E2E-Lauf vom 23.09.2026: Die Rechnungsliste warf in der
 * Browserkonsole „Cannot update a component (Router) while rendering a
 * different component (InvoicesPage)". Ursache: `router.replace()` und das
 * Schreiben in den LocalStorage standen INNERHALB der Updater-Funktion von
 * `setState`. React darf Updater waehrend des Renderns ausfuehren — im
 * StrictMode sogar doppelt. Seiteneffekte gehoeren dort nicht hin.
 *
 * Die Berechnung ist jetzt eine reine Funktion und hier getestet; der Hook
 * fuehrt ihr Ergebnis nur noch aus.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { naechsterTabellenZustand } from "./usePersistedTableState";

const DEFAULTS = { page: 1, sort: "invoiceDate", dir: "desc", q: "" };

describe("naechsterTabellenZustand", () => {
  it("uebernimmt die Aenderung und schreibt sie in die Adresse", () => {
    const { next, query } = naechsterTabellenZustand(DEFAULTS, { page: 3 }, DEFAULTS, "");
    expect(next.page).toBe(3);
    expect(new URLSearchParams(query).get("page")).toBe("3");
  });

  it("laesst Vorgabewerte aus der Adresse heraus", () => {
    const { query } = naechsterTabellenZustand(
      { ...DEFAULTS, page: 3 },
      { page: 1 },
      DEFAULTS,
      "?page=3",
    );
    expect(new URLSearchParams(query).has("page")).toBe(false);
  });

  it("leere Suchbegriffe verschwinden aus der Adresse", () => {
    const { query } = naechsterTabellenZustand(
      { ...DEFAULTS, q: "RG-1" },
      { q: "" },
      DEFAULTS,
      "?q=RG-1",
    );
    expect(new URLSearchParams(query).has("q")).toBe(false);
  });

  it("fremde Parameter der Seite bleiben erhalten", () => {
    // Etwa ?tab= einer anderen Komponente auf derselben Seite.
    const { query } = naechsterTabellenZustand(DEFAULTS, { page: 2 }, DEFAULTS, "?tab=offen");
    const p = new URLSearchParams(query);
    expect(p.get("tab")).toBe("offen");
    expect(p.get("page")).toBe("2");
  });

  it("veraendert den vorherigen Zustand nicht", () => {
    const vorher = { ...DEFAULTS };
    naechsterTabellenZustand(vorher, { page: 5 }, DEFAULTS, "");
    expect(vorher.page).toBe(1);
  });
});

describe("Wächter: keine Seiteneffekte in setState-Updatern", () => {
  it("der Hook ruft den Router nicht innerhalb eines Updaters auf", () => {
    const quelle = readFileSync(join(__dirname, "usePersistedTableState.ts"), "utf8");
    // Jeder Updater der Form setState((prev) => { ... }) wird herausgeschnitten
    // und auf Router- und Speicherzugriffe geprueft.
    const updater = [...quelle.matchAll(/setState\(\s*\(\w*\)\s*=>\s*\{([\s\S]*?)\n\s{6}\}\)/g)];
    for (const [, rumpf] of updater) {
      expect(rumpf, "router.* in einem setState-Updater").not.toMatch(/router\./);
      expect(rumpf, "writeToStorage in einem setState-Updater").not.toMatch(/writeToStorage/);
    }
  });
});
