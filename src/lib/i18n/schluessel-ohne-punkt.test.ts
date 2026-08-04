/**
 * Wächter: kein Übersetzungsschlüssel enthält einen Punkt.
 *
 * ## Der Fehler
 *
 * In `admin.featureFlagsUI.accounting` standen sechzehn Schlüssel, die
 * `accounting.reports`, `accounting.bank` … hiessen. Der Punkt kam aus den
 * Flag-Namen der Datenbank, wo er richtig ist: er trennt Modul und Funktion.
 *
 * In next-intl trennt derselbe Punkt aber Verschachtelungsebenen. Ein
 * Schlüssel, der ihn enthält, ist dort kein Schlüssel, sondern ein Pfad — und
 * next-intl lehnt das ab:
 *
 * > INVALID_KEY: Namespace keys cannot contain the character "."
 *
 * ## Warum das so teuer war
 *
 * Es fielen nicht die sechzehn Beschriftungen aus. Es fiel der **ganze
 * Namensraum** aus: `useTranslations("admin.featureFlagsUI")` warf beim
 * Anlegen, also blieb keine einzige Beschriftung dieser Ansicht übrig. Ein
 * Fehler an einer Stelle, der alles daneben mitreisst.
 *
 * Dazu kam: `t("accounting.accounting.reports")` — der Aufruf setzte den
 * Präfix noch einmal davor — hätte die Texte auch dann nicht gefunden, wenn
 * next-intl sie durchgelassen hätte. Zwei Fehler, die einander verdeckten.
 *
 * ## Warum ein Wächter und nicht bloss der Fix
 *
 * Der Punkt kommt aus den Daten. Wer das nächste Feature-Flag einträgt, kopiert
 * den Namen aus der Datenbank in die Sprachdatei — und der Punkt kommt mit.
 * Das ist keine Unachtsamkeit, das ist der naheliegende Handgriff.
 *
 * Auffallen würde es erst beim Öffnen genau dieser Ansicht, im Browser, mit
 * einer Meldung, die nach einem next-intl-Problem aussieht statt nach einem
 * Tippfehler in einer JSON-Datei.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SPRACHEN = ["de", "en", "de-personal"] as const;

function schluesselMitPunkt(baum: unknown, pfad: string[] = []): string[] {
  if (typeof baum !== "object" || baum === null || Array.isArray(baum)) return [];

  const funde: string[] = [];
  for (const [schluessel, wert] of Object.entries(baum)) {
    if (schluessel.includes(".")) {
      funde.push([...pfad, schluessel].join(" → "));
    }
    funde.push(...schluesselMitPunkt(wert, [...pfad, schluessel]));
  }
  return funde;
}

describe("Übersetzungsschlüssel", () => {
  for (const sprache of SPRACHEN) {
    it(`${sprache}.json: kein Schlüssel enthält einen Punkt`, () => {
      const pfad = join(__dirname, "..", "..", "messages", `${sprache}.json`);
      const nachrichten = JSON.parse(readFileSync(pfad, "utf-8"));

      const funde = schluesselMitPunkt(nachrichten);

      expect(
        funde,
        funde.length > 0
          ? `In ${sprache}.json enthalten ${funde.length} Schlüssel einen Punkt. ` +
              `next-intl liest den Punkt als Verschachtelung und lehnt den ` +
              `KOMPLETTEN umgebenden Namensraum mit INVALID_KEY ab — nicht nur ` +
              `diese Schlüssel. Jede Beschriftung der betroffenen Ansicht ` +
              `verschwindet.\n\n` +
              `Kommt der Punkt aus einem Flag- oder Modulnamen: den Namen so ` +
              `lassen, wie er ist, und beim Nachschlagen nur den Teil hinter ` +
              `dem Punkt verwenden.\n\nGefunden:\n${funde.join("\n")}`
          : "",
      ).toEqual([]);
    });
  }

  it("alle drei Sprachdateien haben dieselben Schlüssel unter featureFlagsUI.accounting", () => {
    // Die Gegenprobe zum Umbenennen: wird der Präfix in nur zwei von drei
    // Dateien gestrichen, faellt es niemandem auf — die dritte ist die, die
    // kaum jemand oeffnet.
    const gruppen = SPRACHEN.map((sprache) => {
      const pfad = join(__dirname, "..", "..", "messages", `${sprache}.json`);
      const nachrichten = JSON.parse(readFileSync(pfad, "utf-8"));
      return {
        sprache,
        schluessel: Object.keys(
          nachrichten.admin?.featureFlagsUI?.accounting ?? {},
        ).sort(),
      };
    });

    const referenz = gruppen[0];
    for (const gruppe of gruppen.slice(1)) {
      expect(
        gruppe.schluessel,
        `${gruppe.sprache}.json hat unter admin.featureFlagsUI.accounting andere ` +
          `Schlüssel als ${referenz.sprache}.json`,
      ).toEqual(referenz.schluessel);
    }
  });
});
