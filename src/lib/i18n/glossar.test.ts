/**
 * Glossar (UX-Durchsicht, Punkt 16) — je Sache ein Wort.
 *
 * - Abrechnungen: Menü und Seite /invoices; darunter Rechnungen UND
 *   Gutschriften. Abrechnung und Rechnung sind verschieden: abgerechnet
 *   werden die WEA, eine Rechnung stellt man jemandem.
 * - Netzbetreiber-Abrechnung: was bisher "Stromabrechnung" und
 *   "Netzbetreiber-Daten" hieß (EnergySettlement).
 * - Produktionsdaten und SCADA-Messdaten; "Ertragsdaten" war ein dritter Name.
 * - Gesellschaft: das, was "Fonds" und "Beteiligungen" hieß. "Beteiligung"
 *   bleibt für den Anteil einer Person (Portal: "Meine Beteiligungen").
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const de = JSON.parse(readFileSync(join(SRC, "messages", "de.json"), "utf8"));

function texte(o: unknown, pfad = ""): Array<[string, string]> {
  if (typeof o === "string") return [[pfad, o]];
  if (!o || typeof o !== "object") return [];
  return Object.entries(o).flatMap(([k, v]) => texte(v, pfad ? `${pfad}.${k}` : k));
}

const ALT = /Stromabrechnung|Netzbetreiber-Daten|Ertragsdaten|(?<![\w-])Fonds(?![\w-])|Fonds-/;

describe("Glossar", () => {
  it("Menü", () => {
    expect(de.nav.invoices).toBe("Abrechnungen");
    expect(de.nav.gridOperatorData).toBe("Netzbetreiber-Abrechnungen");
    expect(de.nav.scadaMeasurements).toBe("SCADA-Messdaten");
    expect(de.nav.funds).toBe("Gesellschaften");
    expect(de.nav.managementBillings).toBe("BF-Abrechnungen");
    expect(de.nav.billing).toBe("Abrechnungseinstellungen");
  });

  it("die Brotkrumen folgen dem Menü", () => {
    expect(de.breadcrumb.path.invoices).toBe("Abrechnungen");
    expect(de.breadcrumb.path.funds).toBe("Gesellschaften");
    expect(de.breadcrumb.path.energy).toBe("Energiedaten");
    expect(de.breadcrumb.path.productions).toBe("Produktionsdaten");
  });

  for (const datei of ["de", "de-personal"]) {
    it(`${datei}.json nutzt keine alten Namen`, () => {
      const m = JSON.parse(readFileSync(join(SRC, "messages", `${datei}.json`), "utf8"));
      const funde = texte(m).filter(([, v]) => ALT.test(v)).map(([k, v]) => `${k}: ${v}`);
      expect(funde).toEqual([]);
    });
  }

  it("auch kein fest verdrahteter Oberflächentext", () => {
    const funde: string[] = [];
    const lauf = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) { if (e !== "messages") lauf(p); continue; }
        if (!/\.tsx?$/.test(p) || p.includes(".test.")) continue;
        readFileSync(p, "utf8").split("\n").forEach((z, i) => {
          if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(z)) return; // comments keep history
          const ohneKommentar = z.replace(/\/\/.*$/, "").replace(/\{\/\*.*?\*\/\}/g, "");
          // user-facing: string literals and JSX text only
          const sichtbar = (ohneKommentar.match(/"[^"]*"|`[^`]*`|>[^<>{}]+</g) ?? []).join(" ");
          if (ALT.test(sichtbar)) funde.push(`${p.slice(SRC.length + 1)}:${i + 1}`);
        });
      }
    };
    lauf(SRC);
    expect(funde).toEqual([]);
  });
});
