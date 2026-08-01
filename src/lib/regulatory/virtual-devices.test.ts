/**
 * `Turbine` ist nicht gleich Windkraftanlage.
 *
 * `POST /api/parks` legt zu jedem Park zwei virtuelle Geräte an — einen
 * Netzverknüpfungspunkt und einen Parkrechner — und speichert sie in
 * derselben Tabelle wie die Anlagen, unterschieden nur durch `deviceType`.
 *
 * Das ist eine sinnvolle Modellierung und zugleich eine Falle, in die ich am
 * 01.08.2026 zweimal getappt bin:
 *
 *  1. Die Löschsperre für Parks zählte sie als Anlagen mit. Ein frisch
 *     angelegter Park war damit NIE löschbar — er blockierte sich selbst mit
 *     Objekten, die der Nutzer nie angelegt hat.
 *  2. Die Zerlegungs-Auswertung nach § 29 GewStG führte sie als „Anlage ohne
 *     Standortgemeinde" und löste damit die Warnung aus, die ausgewiesenen
 *     Anteile seien zu hoch — für Geräte, die keine Betriebsstätte begründen
 *     und keine Nennleistung haben.
 *
 * Beide Male fiel es erst an der laufenden Instanz auf, nicht im Test: die
 * Testdaten hatten keine Parks mit Infrastruktur.
 *
 * Dieser Test ist deshalb eine Sperre auf Quelltextebene. Er prüft nicht das
 * Verhalten, sondern dass die Einschränkung überhaupt dasteht — wer eine neue
 * Auswertung über Anlagen schreibt, soll hier stolpern und nicht erst in der
 * Produktion.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf-8");

/**
 * Stellen, die über Anlagen auswerten und deshalb echte von virtuellen
 * unterscheiden MÜSSEN.
 */
const MUST_FILTER = [
  {
    file: "app/api/parks/[id]/route.ts",
    why: "Loeschsperre — sonst ist ein frisch angelegter Park nie loeschbar",
  },
  {
    file: "app/api/regulatory/capacity-by-municipality/route.ts",
    why: "Zerlegung § 29 GewStG — virtuelle Geraete begruenden keine Betriebsstaette",
  },
  {
    file: "app/api/regulatory/municipality-benefit/route.ts",
    why: "§ 6 EEG — der 2.500-m-Umkreis haengt am Turm, ein Parkrechner hat keinen",
  },
];

describe("Virtuelle Geraete werden von echten Anlagen unterschieden", () => {
  for (const { file, why } of MUST_FILTER) {
    it(`${file} filtert auf deviceType`, () => {
      const source = read(file);
      expect(
        /deviceType:\s*"WEA"/.test(source),
        `${file} wertet ueber Anlagen aus, ohne die virtuelle Infrastruktur ` +
          `auszunehmen.\nGrund: ${why}`,
      ).toBe(true);
    });
  }

  it("die virtuellen Geraete werden weiterhin angelegt", () => {
    // Die Gegenprobe: waeren sie irgendwann entfernt worden, waeren die
    // Filter oben zwar harmlos, aber die Begruendung stimmte nicht mehr — und
    // jemand raeumte sie als vermeintlich ueberfluessig wieder weg.
    const source = read("app/api/parks/route.ts");
    expect(source).toContain('deviceType: "NVP"');
    expect(source).toContain('deviceType: "PARKRECHNER"');
  });

  it("die Auswahl im §-6-EEG-Dialog zeigt nur echte Anlagen", () => {
    // Stuenden Netzverknuepfungspunkt und Parkrechner zur Wahl, waere die
    // erste fehlerhafte Vereinbarung nur eine Frage der Zeit.
    const source = read("components/regulatory/MunicipalityBenefitSection.tsx");
    expect(source).toMatch(/deviceType\s*\?\?\s*"WEA"\)\s*===\s*"WEA"/);
  });
});
