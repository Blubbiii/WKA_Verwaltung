/**
 * Wächter: kein Übersetzungsschlüssel, den es nicht gibt.
 *
 * ## Der Fehler
 *
 * Auf der Rechnungsliste stand als Beschriftung eines Auswahlfelds wörtlich
 * `invoices.list.filterAllFunds`. Der Text existierte — nur unter
 * `invoices.filterAllFunds`, während die Seite aus dem Namensraum
 * `invoices.list` liest. next-intl zeigt in so einem Fall den vollen Pfad an.
 *
 * Das ist die unangenehmste Sorte Anzeigefehler: nichts stürzt ab, nichts
 * wird protokolliert, kein Test schlägt an. Es steht einfach Programmiererlatein
 * in der Oberfläche, und wer es sieht, hält das Produkt für unfertig — zu
 * Recht.
 *
 * ## Was der Test prüft
 *
 * Für jede Datei: welche Namensräume über `useTranslations("…")` geholt werden
 * und welche Schlüssel auf den zugehörigen Variablen aufgerufen werden. Jeder
 * dieser Schlüssel muss in `de.json` vorhanden sein.
 *
 * Geprüft wird gegen **Deutsch** — das ist die führende Sprache. Ob `en` und
 * `de-personal` vollständig sind, ist eine eigene Frage; hier geht es darum,
 * dass niemandem ein roher Pfad angezeigt wird.
 *
 * Nur wörtliche Schlüssel werden geprüft. `t(variable)` oder `t("a." + b)`
 * lässt sich statisch nicht auflösen und wird übersprungen — lieber eine Lücke
 * als Fehlalarme, die den Test unglaubwürdig machen.
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
    else if (/\.tsx?$/.test(eintrag) && !/\.test\.tsx?$/.test(eintrag)) {
      gesammelt.push(pfad);
    }
  }
  return gesammelt;
}

/** Existiert `a.b.c` in den Nachrichten? */
function vorhanden(nachrichten: unknown, pfad: string): boolean {
  let aktuell: unknown = nachrichten;
  for (const teil of pfad.split(".")) {
    if (typeof aktuell !== "object" || aktuell === null) return false;
    if (!(teil in (aktuell as Record<string, unknown>))) return false;
    aktuell = (aktuell as Record<string, unknown>)[teil];
  }
  // Ein Namensraum ist kein Text. `t("invoices")` wuerde ein Objekt liefern.
  return typeof aktuell === "string";
}

describe("Uebersetzungen", () => {
  it("ruft keinen Schluessel auf, den es nicht gibt", () => {
    const nachrichten = JSON.parse(
      readFileSync(join(WURZEL, "src", "messages", "de.json"), "utf-8"),
    );

    const funde: string[] = [];

    for (const pfad of dateien(join(WURZEL, "src"))) {
      const quelle = ohneKommentare(readFileSync(pfad, "utf-8"));
      if (!quelle.includes("useTranslations")) continue;

      // Variable → Namensraum. `const t = useTranslations("invoices.list")`
      const namensraeume = new Map<string, string>();
      for (const m of quelle.matchAll(
        /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*["'`]([\w.]+)["'`]\s*\)/g,
      )) {
        namensraeume.set(m[1], m[2]);
      }
      if (namensraeume.size === 0) continue;

      for (const [variable, namensraum] of namensraeume) {
        // `t("schluessel")` und `t.rich("schluessel", …)`
        const aufrufe = quelle.matchAll(
          new RegExp(`\\b${variable}(?:\\.rich|\\.markup)?\\(\\s*["'\`]([\\w.]+)["'\`]`, "g"),
        );
        for (const aufruf of aufrufe) {
          const voll = `${namensraum}.${aufruf[1]}`;
          if (!vorhanden(nachrichten, voll)) {
            const zeile = quelle.slice(0, aufruf.index).split("\n").length;
            funde.push(
              `${pfad.replace(WURZEL, "").replace(/\\/g, "/")}:${zeile} — ${voll}`,
            );
          }
        }
      }
    }

    expect(
      [...new Set(funde)].sort(),
      `Diese Schluessel werden aufgerufen, existieren aber nicht in ` +
        `src/messages/de.json:\n\n${[...new Set(funde)].sort().join("\n")}\n\n` +
        `next-intl zeigt in dem Fall den vollen Pfad an — dem Nutzer steht ` +
        `dann woertlich "invoices.list.filterAllFunds" in der Oberflaeche. ` +
        `Nichts stuerzt ab, nichts wird protokolliert; es sieht nur unfertig ` +
        `aus.\n\n` +
        `Entweder fehlt der Text, oder er liegt unter einem anderen Pfad als ` +
        `dem, aus dem die Datei liest.`,
    ).toEqual([]);
  });
});
