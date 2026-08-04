/**
 * Wächter: ein Auswahlfeld lädt alles, was wählbar sein muss.
 *
 * ## Der Fehler
 *
 * Der Pacht- und der Energie-Assistent luden `/api/parks?limit=100`. Es gab
 * 117 Parks. Für die letzten siebzehn liess sich **keine Abrechnung anlegen**
 * — der Park stand einfach nicht in der Liste. Kein Fehler, keine Meldung,
 * keine Andeutung, dass da noch etwas fehlt.
 *
 * Das ist derselbe Fehler wie die Kennzahl, die die geladene Seite zählte,
 * nur eine Stufe schlimmer: dort log eine Zahl, hier ist eine Handlung
 * unmöglich.
 *
 * ## Warum der bestehende Wächter das nicht gefunden hat
 *
 * `pagination-limits.test.ts` prüft, dass kein Aufruf **mehr** anfordert, als
 * seine Route zulässt. 100 ≤ 1000 — bestanden. Er stellt die falsche Frage:
 * die Gefahr ist nicht, zu viel zu verlangen, sondern zu wenig.
 *
 * ## Was dieser Test prüft
 *
 * Wer aus einem Abruf ein `<Select>` befüllt, aus dem der Nutzer **einen**
 * Datensatz auswählt, muss `PAGE_SIZE_SELECTABLE` verwenden — nicht eine
 * hingeschriebene Zahl.
 *
 * Erkannt wird das grob: eine Datei, die ein Auswahlfeld baut UND einen
 * Listenabruf mit fester kleiner Obergrenze macht. Das ist absichtlich weit
 * gefasst; lieber ein Fehlalarm, den man mit einer Zeile begründet, als ein
 * Park, den niemand wählen kann.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const WURZEL = join(__dirname, "..", "..", "..");

/**
 * Abrufe, deren Ergebnis NICHT zur Auswahl steht — „die letzten fünf", ein
 * Vorschaustreifen, eine Zusammenfassung. Dort ist eine kleine Zahl richtig.
 *
 * Wer hier etwas einträgt, sagt damit: aus diesem Abruf wählt niemand einen
 * Datensatz aus.
 */
const KEINE_AUSWAHL = [
  "app/(dashboard)/energy/page.tsx", // "Neueste Produktionsdaten", limit=5
  "app/(dashboard)/contracts/calendar/page.tsx", // Kalenderansicht
  "app/(dashboard)/crm/tasks/page.tsx", // Aufgabenliste mit eigener Seitensteuerung
];

function ohneKommentare(quelle: string): string {
  return quelle
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function dateien(verzeichnis: string, gesammelt: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    if (eintrag === "node_modules" || eintrag === ".next") continue;
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) dateien(pfad, gesammelt);
    else if (/\.tsx$/.test(eintrag) && !/\.test\.tsx$/.test(eintrag)) {
      gesammelt.push(pfad);
    }
  }
  return gesammelt;
}

describe("Auswahlfelder", () => {
  /**
   * Stand 04.08.2026. Nur senken.
   *
   * Die zwei akut gefundenen sind behoben. Die übrigen sind nicht geprüft —
   * manche befüllen ein Auswahlfeld, manche nicht. Wer eine Datei anfasst,
   * entscheidet für sie: entweder `PAGE_SIZE_SELECTABLE`, oder ein Eintrag in
   * `KEINE_AUSWAHL` mit dem Grund.
   */
  const BASELINE = 40;

  it(`nicht mehr als ${BASELINE} Auswahl-Seiten mit fester kleiner Obergrenze`, () => {
    const funde: string[] = [];

    for (const pfad of dateien(join(WURZEL, "src"))) {
      const relativ = pfad
        .replace(WURZEL, "")
        .replace(/\\/g, "/")
        .replace(/^\/src\//, "");
      if (KEINE_AUSWAHL.includes(relativ)) continue;

      const quelle = ohneKommentare(readFileSync(pfad, "utf-8"));

      // Baut die Datei ueberhaupt ein Auswahlfeld?
      if (!/<Select\b|<Combobox\b/.test(quelle)) continue;

      // Und laedt sie eine Liste mit fester kleiner Obergrenze?
      const treffer = quelle.match(/["`]\/api\/[a-z0-9/_-]+\?[^"`]*limit=(\d+)/g);
      if (!treffer) continue;
      const zuKlein = treffer.filter((t) => {
        const n = Number(/limit=(\d+)/.exec(t)?.[1] ?? "0");
        return n > 0 && n <= 200;
      });
      if (zuKlein.length > 0) {
        funde.push(`${relativ} — ${zuKlein.join(", ")}`);
      }
    }

    expect(
      funde.length,
      funde.length > BASELINE
        ? `Ein neues Auswahlfeld laedt seine Eintraege mit einer fest ` +
            `hingeschriebenen Obergrenze. Steht der gesuchte Datensatz nicht ` +
            `darin, kann der Nutzer ihn NICHT waehlen — und nichts sagt ihm ` +
            `warum.\n\nEntweder PAGE_SIZE_SELECTABLE nutzen, oder die Datei in ` +
            `KEINE_AUSWAHL eintragen, wenn aus dem Abruf niemand etwas ` +
            `auswaehlt.\n\nGefunden:\n${funde.join("\n")}`
        : "",
    ).toBeLessThanOrEqual(BASELINE);
  });
});
