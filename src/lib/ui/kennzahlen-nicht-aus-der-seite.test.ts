/**
 * Wächter: eine Kennzahl über einer Liste zählt den Bestand, nicht die Seite.
 *
 * ## Der Fehler
 *
 * Über der Parkliste standen drei Kennzahlen: „Windparks 20", „Anlagen 53",
 * „36,0 MW". Sie wurden im Client aus den geladenen Zeilen summiert — und die
 * Liste lädt zwanzig Zeilen je Seite. Tatsächlich waren es 93 Parks.
 *
 * Die Zahl **war exakt die Seitengröße**. Genau das macht den Fehler so
 * heimtückisch: 20 sieht aus wie ein Bestand, nicht wie ein Artefakt. Und
 * gleichzeitig meldete das Dashboard 93 — zwei Bildschirme, zwei Wahrheiten.
 *
 * Für eine Verwaltungssoftware ist das schlimmer als jeder Schönheitsfehler.
 * Wer den Zahlen nicht traut, benutzt sie nicht.
 *
 * ## Was der Test prüft
 *
 * Kein `reduce` über die geladene Liste, dessen Ergebnis in `StatsCards`
 * landet. Summen über einen Bestand gehören auf den Server, wo der ganze
 * Filter sichtbar ist — nicht in den Client, der nur eine Seite kennt.
 *
 * Der Test ist bewusst grob: er soll nicht jede denkbare Umsetzung erkennen,
 * sondern die naheliegende — jemanden aufhalten, der die Summe „schnell hier"
 * noch einmal aus den Zeilen bildet.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const WURZEL = join(__dirname, "..", "..", "..");

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

describe("Kennzahlen ueber Listen", () => {
  it("werden nicht aus der geladenen Seite summiert", () => {
    const funde: string[] = [];

    for (const pfad of dateien(join(WURZEL, "src", "app"))) {
      const quelle = ohneKommentare(readFileSync(pfad, "utf-8"));

      // Nur Seiten, die ueberhaupt Kennzahlen zeigen UND paginiert sind.
      // Eine Liste ohne Paginierung darf ihre Zeilen summieren — dort IST
      // die geladene Liste der Bestand.
      const zeigtKennzahlen = /<StatsCards\b/.test(quelle);
      const istPaginiert = /\bpagination\b/.test(quelle);
      if (!zeigtKennzahlen || !istPaginiert) continue;

      // Ein reduce ueber irgendeine Liste, das eine Summe bildet.
      const summiert = /\.reduce\(\s*\(\s*\w+\s*,\s*\w+\s*\)\s*=>\s*\(?\s*\{[^}]*\+/.test(
        quelle,
      );
      if (summiert) {
        funde.push(pfad.replace(WURZEL, "").replace(/\\/g, "/"));
      }
    }

    expect(
      funde,
      `Diese Seiten zeigen Kennzahlen, sind paginiert und summieren trotzdem ` +
        `im Client:\n\n${funde.join("\n")}\n\n` +
        `Eine solche Summe zaehlt die geladene SEITE, nicht den Bestand. Ueber ` +
        `der Parkliste stand dadurch "Windparks 20" — exakt die Seitengroesse ` +
        `— waehrend es 93 waren, und das Dashboard sagte gleichzeitig 93.\n\n` +
        `Summen gehoeren auf den Server, wo der ganze Filter sichtbar ist. Das ` +
        `Muster steht in src/app/api/parks/route.ts: ein zweites count() bzw. ` +
        `aggregate() neben der Seitenabfrage, ausgeliefert als \`totals\`.`,
    ).toEqual([]);
  });
});
