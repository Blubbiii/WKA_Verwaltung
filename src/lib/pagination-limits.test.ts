/**
 * Was die Oberfläche anfordert, muss die API auch liefern dürfen.
 *
 * ## Der Fehler, den das festhält
 *
 * Der Pacht-Assistent fordert `/api/plots?limit=500` an. Die Route deckelte
 * bei 100. Bei 188 Flurstücken fehlten **88 in der Auswahl** — und das
 * Suchfeld daneben filtert nur die geladenen Zeilen, gibt aber vor, den
 * ganzen Bestand zu durchsuchen. Wer sein Flurstück sucht und nicht findet,
 * schliesst daraus, dass es nicht existiert.
 *
 * Gefunden am 02.08.2026 beim Durchklicken von Schritt 2. Dasselbe Muster
 * fand sich an **siebzehn** Stellen quer durch die Oberfläche: angefordert
 * 200, 500 oder 1000, geliefert 100.
 *
 * Nichts daran war laut. Die Antwort enthielt sogar `pagination.total` — die
 * Information war da, nur schaute niemand hin.
 *
 * ## Was dieser Test prüft
 *
 * Für jede Stelle, an der die Oberfläche eine feste Menge anfordert: die
 * zuständige Route muss sie auch herausgeben. Der Test liest beide Seiten aus
 * dem Quelltext, statt eine Liste zu pflegen, die veraltet.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Alle Dateien unter einem Verzeichnis, rekursiv. */
function dateien(verzeichnis: string, endungen: string[]): string[] {
  const treffer: string[] = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) {
      treffer.push(...dateien(pfad, endungen));
    } else if (endungen.some((e) => eintrag.endsWith(e))) {
      treffer.push(pfad);
    }
  }
  return treffer;
}

/** Die Obergrenze einer Route — `maxLimit` oder die Vorgabe 100. */
function obergrenze(routenDatei: string): number | null {
  let quelle: string;
  try {
    quelle = readFileSync(routenDatei, "utf-8");
  } catch {
    return null;
  }
  if (!quelle.includes("parsePaginationParams")) return null;

  const m = /maxLimit:\s*(\d+)/.exec(quelle);
  // Die Vorgabe steht in api-utils.ts: 100.
  return m ? Number(m[1]) : 100;
}

/** Alle `?…limit=N`-Anforderungen aus der Oberfläche. */
function anforderungen(): { datei: string; route: string; limit: number }[] {
  const quellen = [
    ...dateien("src/components", [".ts", ".tsx"]),
    ...dateien("src/app", [".ts", ".tsx"]),
  ].filter((d) => !d.includes(".test.") && !d.endsWith("route.ts"));

  const gefunden: { datei: string; route: string; limit: number }[] = [];
  for (const datei of quellen) {
    const quelle = readFileSync(datei, "utf-8");
    for (const m of quelle.matchAll(/["'`]\/api\/([a-zA-Z0-9/[\]-]+)\?[^"'`]*limit=(\d+)/g)) {
      gefunden.push({ datei, route: m[1], limit: Number(m[2]) });
    }
  }
  return gefunden;
}

/** Route-Pfad → Datei. `energy/productions` → src/app/api/energy/productions/route.ts */
function routenDatei(route: string): string {
  return join("src/app/api", route, "route.ts");
}

const ANFORDERUNGEN = anforderungen();

describe("Angeforderte Mengen passen zur Obergrenze", () => {
  it("es gibt ueberhaupt Anforderungen zu pruefen", () => {
    // Sonst waere die Schleife unten leer und alles gruen, ohne dass etwas
    // geprueft wurde.
    expect(ANFORDERUNGEN.length).toBeGreaterThan(10);
  });

  it("keine Oberflaeche fordert mehr an, als ihre Route herausgibt", () => {
    const zuKlein: string[] = [];

    for (const { datei, route, limit } of ANFORDERUNGEN) {
      const grenze = obergrenze(routenDatei(route));
      // Routen ohne Pagination oder mit dynamischem Segment ueberspringen —
      // dort gibt es nichts zu vergleichen.
      if (grenze === null) continue;
      if (limit > grenze) {
        zuKlein.push(
          `${datei.replace(/\\/g, "/")}\n` +
            `    fordert /api/${route}?limit=${limit} an, die Route gibt hoechstens ${grenze} heraus`,
        );
      }
    }

    expect(
      zuKlein,
      `Diese Stellen bekommen weniger, als sie anfordern — und merken es nicht:\n\n` +
        `${zuKlein.join("\n\n")}\n\n` +
        `Die Liste sieht dann vollstaendig aus und ist es nicht. Entweder die ` +
        `Route bekommt ein hoeheres maxLimit, oder die Oberflaeche blaettert ` +
        `durch, oder sie sucht serverseitig.`,
    ).toEqual([]);
  });
});
