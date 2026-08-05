/**
 * Wächter: jedes Modul im Rechte-Katalog hat eine Beschriftung.
 *
 * ## Der Fehler
 *
 * Die exportierte Berechtigungs-Matrix vom 05.08.2026 führte fünfzehn ihrer
 * zweiunddreissig Modulüberschriften als technische Schlüssel: `accounting`,
 * `faults`, `curtailment`, `wirtschaftsplan` … Die Beschriftungskarten kannten
 * 17 beziehungsweise 20 Module, es gab 32.
 *
 * Das war nicht bloss hässlich. Wer in `MODUL_REIHENFOLGE` fehlt, wird hinten
 * angehängt — in der Reihenfolge, in der die Datenbank liefert. Der
 * Buchhaltungsblock, mit zwanzig Rechten der grösste im Dokument, stand damit
 * im unsortierten Anhang unter „accounting".
 *
 * ## Warum ein Wächter
 *
 * Ein neues Modul entsteht im Katalog, nicht hier. Wer `insurance:read`
 * ergänzt, denkt an das Recht — nicht an eine Beschriftungsdatei zwei
 * Verzeichnisse weiter. Der Rückfall auf den Schlüssel sorgt dafür, dass
 * nichts abstürzt, und genau deshalb fällt es niemandem auf.
 *
 * Auffallen würde es erst im fertigen Dokument. Also hier.
 */

import { describe, expect, it } from "vitest";
import { PERMISSION_CATALOG } from "./permissions.catalog";
import {
  MODUL_BESCHRIFTUNGEN,
  MODUL_REIHENFOLGE,
  modulBeschriftung,
  sortiereModule,
} from "./module-labels";

const KATALOG_MODULE = [...new Set(PERMISSION_CATALOG.map((p) => p.module))];

describe("Modul-Beschriftungen", () => {
  it("jedes Modul aus dem Rechte-Katalog hat eine deutsche Beschriftung", () => {
    const ohne = KATALOG_MODULE.filter((m) => !MODUL_BESCHRIFTUNGEN[m]);

    expect(
      ohne,
      ohne.length > 0
        ? `Diese Module aus PERMISSION_CATALOG haben keine Beschriftung und ` +
            `erscheinen in der Berechtigungs-Matrix als technischer ` +
            `Schluessel — mitten in einem deutschen Dokument, das ein Pruefer ` +
            `zu lesen bekommt.\n\n` +
            `Ausserdem fehlen sie damit in der Anzeigereihenfolge und rutschen ` +
            `unsortiert ans Ende.\n\n` +
            `Bitte in MODUL_BESCHRIFTUNGEN ergaenzen (module-labels.ts) — an ` +
            `der Stelle, an die das Modul sachlich gehoert.\n\n` +
            `Fehlend:\n${ohne.join("\n")}`
        : "",
    ).toEqual([]);
  });

  it("keine Beschriftung fuer ein Modul, das es nicht mehr gibt", () => {
    // Die Gegenrichtung. Eine Beschriftung ohne Modul stoert niemanden, sie
    // sagt aber, dass hier jemand aufgeraeumt und die Haelfte vergessen hat.
    const verwaist = Object.keys(MODUL_BESCHRIFTUNGEN).filter(
      (m) => !KATALOG_MODULE.includes(m),
    );

    expect(
      verwaist,
      `Diese Module sind beschriftet, kommen im Rechte-Katalog aber nicht ` +
        `mehr vor:\n${verwaist.join("\n")}`,
    ).toEqual([]);
  });

  it("die Reihenfolge deckt sich mit den Beschriftungen", () => {
    // MODUL_REIHENFOLGE ist aus den Schluesseln abgeleitet. Der Test haelt
    // fest, dass das so bleibt: zwei getrennt gepflegte Listen waren der
    // urspruengliche Fehler.
    expect(MODUL_REIHENFOLGE).toEqual(Object.keys(MODUL_BESCHRIFTUNGEN));
  });

  it("ein unbekanntes Modul faellt auf seinen Schluessel zurueck", () => {
    // Der Rueckfall MUSS bleiben. Eine fehlende Beschriftung darf eine Zeile
    // nicht verschwinden lassen: eine fehlende Zeile in einer
    // Berechtigungs-Matrix behauptet, es gebe das Recht nicht.
    expect(modulBeschriftung("gibt-es-nicht")).toBe("gibt-es-nicht");
  });

  it("unbekannte Module haengen hinten an, aber sortiert", () => {
    const sortiert = sortiereModule(["zebra", "accounting", "alpha", "parks"]);

    expect(sortiert.slice(0, 2), "Bekannte Module zuerst, in Hausreihenfolge").toEqual([
      "parks",
      "accounting",
    ]);
    expect(sortiert.slice(2), "Unbekannte alphabetisch, nicht zufaellig").toEqual([
      "alpha",
      "zebra",
    ]);
  });
});
