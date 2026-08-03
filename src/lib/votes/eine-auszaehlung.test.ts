/**
 * Wächter: es gibt genau **eine** Auszählung für Abstimmungen.
 *
 * ## Warum
 *
 * Sie existierte zweimal — einmal für das Gesellschafterportal, einmal für
 * die Verwaltungsansicht — und die beiden wichen voneinander ab. Enthaltungen
 * zählten auf der einen Seite zur Mehrheitsgrundlage, auf der anderen nicht.
 * Bei 45 % Ja, 40 % Nein und 15 % Enthaltung sah der Gesellschafter
 * „angenommen", die Verwaltung „abgelehnt".
 *
 * Das ist die tückischste Sorte Fehler in diesem Codebase, und es ist nicht
 * das erste Mal: zwei Stellen kodieren dieselbe Regel, beide sind für sich
 * plausibel, und sie driften auseinander, weil niemand merkt, dass es die
 * zweite gibt. Ein Gesellschafterbeschluss ist dabei besonders unangenehm —
 * er ist rechtlich verbindlich, und welches Ergebnis gilt, hängt dann davon
 * ab, wer hinsieht.
 *
 * ## Was der Test prüft
 *
 * Keine Datei ausser `tally.ts` darf selbst auszählen. Erkennbar an den
 * Merkmalen, die eine Auszählung ausmachen: die Optionen über ihren Text
 * erkennen, oder das Stimmgewicht aus Stimmrecht und Kapitalanteil ableiten.
 *
 * Der Test ist bewusst grob. Er soll nicht jede denkbare Umsetzung erkennen,
 * sondern die naheliegende — jemanden aufhalten, der die Regel „schnell hier"
 * noch einmal hinschreibt.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const WURZEL = join(__dirname, "..", "..", "..");
const ERLAUBT = ["src/lib/votes/tally.ts"];

/** Merkmale einer eigenen Auszählung. */
const MUSTER: { name: string; regex: RegExp; erklaerung: string }[] = [
  {
    name: "Option über ihren Text erkennen",
    regex: /["'](?:Ja|Nein|Enthaltung)["']\s*(?:===|==|\.includes|\)\s*\|\|)/,
    erklaerung:
      'Vergleicht Antwortmoeglichkeiten mit "Ja"/"Nein"/"Enthaltung". Die ' +
      "Antwortmoeglichkeiten sind frei waehlbar — wer sie hier hart " +
      "vergleicht, verliert jede Abstimmung mit eigenen Bezeichnungen.",
  },
  {
    name: "Stimmgewicht selbst ableiten",
    // Gesucht ist die FALLBACK-KETTE — beide Felder in EINEM Ausdruck, durch
    // `||` oder `??` verbunden. Nicht das blosse Auslesen beider Felder: die
    // Routen muessen sie ja lesen, um sie an `zaehleAus` zu uebergeben. Dort
    // stehen sie als zwei getrennte Eigenschaften, durch ein Komma getrennt —
    // und genau daran unterscheiden sich die beiden Faelle.
    regex: /votingRightsPercentage[^,;{}]{0,60}(?:\|\||\?\?)[^,;{}]{0,60}ownershipPercentage/,
    erklaerung:
      "Leitet das Stimmgewicht aus Stimmrecht und Kapitalanteil ab. Das ist " +
      "`stimmgewicht()` in tally.ts — dort steht auch, warum `??` und nicht " +
      "`||` (eine ausdrueckliche 0 heisst „kein Stimmrecht\").",
  },
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
    else if (/\.tsx?$/.test(eintrag) && !/\.test\.tsx?$/.test(eintrag)) {
      gesammelt.push(pfad);
    }
  }
  return gesammelt;
}

describe("Abstimmungen: nur eine Auszaehlung", () => {
  it("zaehlt nirgends ausser in tally.ts selbst aus", () => {
    const funde: string[] = [];

    for (const pfad of dateien(join(WURZEL, "src"))) {
      const relativ = pfad.replace(WURZEL, "").replace(/\\/g, "/").replace(/^\//, "");
      if (ERLAUBT.includes(relativ)) continue;

      const quelle = ohneKommentare(readFileSync(pfad, "utf-8"));
      for (const muster of MUSTER) {
        if (muster.regex.test(quelle)) {
          funde.push(`${relativ} — ${muster.name}: ${muster.erklaerung}`);
        }
      }
    }

    expect(
      funde,
      `Diese Dateien zaehlen offenbar selbst aus:\n\n${funde.join("\n\n")}\n\n` +
        `Die Auszaehlung gehoert nach src/lib/votes/tally.ts und nirgendwo ` +
        `sonst hin. Sie existierte schon einmal zweimal, die beiden Fassungen ` +
        `sind auseinandergedriftet, und derselbe Beschluss galt je nach ` +
        `Ansicht als angenommen oder abgelehnt.\n\n` +
        `Wird hier wirklich etwas anderes gemacht, gehoert die Datei in ` +
        `ERLAUBT — mit einer Begruendung, die erklaert warum.`,
    ).toEqual([]);
  });
});
