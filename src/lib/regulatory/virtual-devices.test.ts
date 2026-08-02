/**
 * `Turbine` ist nicht gleich Windkraftanlage.
 *
 * `POST /api/parks` legt zu jedem Park zwei virtuelle Geräte an — einen
 * Netzverknüpfungspunkt und einen Parkrechner — und speichert sie in
 * derselben Tabelle wie die Anlagen, unterschieden nur durch `deviceType`.
 *
 * Das ist eine sinnvolle Modellierung und zugleich eine Falle, die inzwischen
 * VIERMAL zugeschnappt ist:
 *
 *  1. Die Löschsperre für Parks zählte sie als Anlagen mit. Ein frisch
 *     angelegter Park war damit NIE löschbar — er blockierte sich selbst mit
 *     Objekten, die der Nutzer nie angelegt hat.
 *  2. Die Zerlegungs-Auswertung nach § 29 GewStG führte sie als „Anlage ohne
 *     Standortgemeinde" und löste damit die Warnung aus, die ausgewiesenen
 *     Anteile seien zu hoch — für Geräte, die keine Betriebsstätte begründen
 *     und keine Nennleistung haben.
 *
 *  3. Die Pacht-Berechnung multiplizierte die Mindestpacht mit der Zahl ALLER
 *     aktiven Geraete. Jeder ueber die Anwendung angelegte Park hat zwei
 *     virtuelle — bei zwei echten Anlagen war die Mindestpacht damit doppelt
 *     so hoch. Gefunden am 02.08.2026 von
 *     `e2e/journeys/lease-settlement-wizard.spec.ts`, weil der Test den
 *     Betrag NACHRECHNET statt zu pruefen, dass eine Zahl dasteht.
 *  4. Der Verteiler der Betreiberanteile hatte sie im Nenner.
 *
 * Die ersten drei fielen erst an einer laufenden Instanz auf, nicht im Test:
 * die Testdaten hatten keine Parks mit Infrastruktur.
 *
 * Vier Fundstellen derselben Ursache sind kein Zufall mehr. Wer irgendwo
 * `park.turbines` laedt und zaehlt, muss sich fragen, ob er Anlagen meint
 * oder Geraete.
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
  // 02.08.2026, dritter und vierter Fund derselben Falle — diesmal nicht in
  // einer Auswertung, sondern in der Berechnung von Geld.
  {
    file: "lib/lease-revenue/calculator.ts",
    why:
      "Mindestpacht = Mindestentgelt je WEA x Anzahl WEA. Ohne Filter zaehlen " +
      "Netzverknuepfungspunkt und Parkrechner mit, und JEDER Park zahlt zwei " +
      "Anlagen zu viel — bei zwei echten Anlagen also das Doppelte",
  },
  {
    file: "lib/lease-revenue/allocator.ts",
    why:
      "Die virtuellen Geraete haben keinen Betreiber und fallen aus der " +
      "Zuordnung — standen aber im Nenner und rechneten jeden Betreiberanteil " +
      "zu klein",
  },
  // Nach dem vierten Fund einmal systematisch durchgesucht statt auf den
  // fuenften zu warten. Diese Stellen zeigen dem Nutzer eine Zahl, die
  // "Anlagen" heisst.
  {
    file: "app/api/admin/onboarding-status/route.ts",
    why:
      "Der Schritt \"Anlagen angelegt\" galt als erledigt, sobald ein Park " +
      "existierte — ein Haken fuer etwas, das der Nutzer nie getan hat",
  },
  {
    file: "app/api/admin/system/stats/route.ts",
    why: "Systemstatistik wies je Park zwei Anlagen zu viel aus",
  },
  {
    file: "app/api/reports/route.ts",
    why: "Berichts-Uebersicht zeigt \"Anlagen: N\"",
  },
  {
    file: "app/api/reports/[type]/route.ts",
    why: "Bericht \"Anlagen-Uebersicht\" listete die virtuelle Infrastruktur mit",
  },
  {
    file: "app/api/export/[type]/route.ts",
    why: "Park-Export mit Anlagenzahl je Park",
  },
  {
    file: "app/api/funds/[id]/parks/route.ts",
    why: "Anlagenzahl je Park einer Beteiligung",
  },
  {
    file: "app/api/funds/[id]/route.ts",
    why: "Anlagenzahl in der Beteiligungs-Detailansicht",
  },
  {
    file: "app/api/gis/features/route.ts",
    why: "Anlagenzahl an der Park-Markierung auf der Karte",
  },
];

/**
 * Stellen, die BEWUSST alle Geräte liefern.
 *
 * Ohne diese Liste räumt früher oder später jemand einen vermeintlich
 * vergessenen Filter nach — und nimmt der SCADA-Zuordnung ihre Auswahl.
 * Hier ist „Gerät" gemeint und nicht „Anlage".
 */
const MUST_NOT_FILTER = [
  {
    file: "app/api/turbines/route.ts",
    why:
      "Geraeteliste. Die SCADA-Zuordnung waehlt daraus Parkrechner und " +
      "Netzverknuepfungspunkte aus — mit Filter stuenden sie nicht zur Wahl",
  },
];

/**
 * Nimmt diese Quelle die virtuellen Geräte aus?
 *
 * Zwei zulässige Schreibweisen: die gemeinsame Konstante `NUR_ANLAGEN` aus
 * `lib/turbines/real-turbines.ts` — die bevorzugte — oder das Literal
 * `deviceType: "WEA"`, wie es an den älteren Stellen steht.
 *
 * Mein erster Entwurf prüfte nur das Literal und meldete daraufhin acht
 * korrekte Stellen als kaputt: sie benutzen die Konstante. Ein Prüfmuster,
 * das nur eine Schreibweise kennt, erzwingt genau diese Schreibweise.
 */
function nimmtGeraeteAus(source: string): boolean {
  return /deviceType:\s*"WEA"/.test(source) || /NUR_ANLAGEN/.test(source);
}

describe("Virtuelle Geraete werden von echten Anlagen unterschieden", () => {
  for (const { file, why } of MUST_FILTER) {
    it(`${file} nimmt die virtuellen Geraete aus`, () => {
      const source = read(file);
      expect(
        nimmtGeraeteAus(source),
        `${file} wertet ueber Anlagen aus, ohne die virtuelle Infrastruktur ` +
          `auszunehmen.\nGrund: ${why}\n\n` +
          `Zu ergaenzen: "...NUR_ANLAGEN" aus @/lib/turbines/real-turbines in ` +
          `der where-Bedingung.`,
      ).toBe(true);
    });
  }

  for (const { file, why } of MUST_NOT_FILTER) {
    it(`${file} filtert bewusst NICHT`, () => {
      const source = read(file);
      expect(
        nimmtGeraeteAus(source),
        `${file} nimmt die virtuellen Geraete aus. Das sieht nach der ` +
          `Korrektur aus, die an den Stellen oben richtig war, ist hier aber ` +
          `falsch.\nGrund: ${why}`,
      ).toBe(false);
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
