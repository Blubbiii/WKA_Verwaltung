/**
 * "Aus der Auswahl anlegen" bleibt verdrahtet.
 *
 * - Jede Listenseite und der Dialog aus der Auswahl nutzen DASSELBE Formular.
 *   Zwei Formulare für dieselbe Sache laufen auseinander.
 * - Die Formulare, in denen Stammdaten fehlen können, nutzen die Auswahl mit
 *   Anlegen statt eines nackten Selects.
 * - Der Dialog über einem anderen Formular darf dessen Absenden nicht
 *   auslösen (React reicht submit durch Portale weiter).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lies = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

describe("ein Formular für Liste und Auswahl", () => {
  const auswahl = lies("components/auswahl/index.tsx");
  const paare: Array<[string, string, string]> = [
    ["Gesellschaft", "app/(dashboard)/funds/new/page.tsx", "FundCreateForm"],
    ["Windpark", "app/(dashboard)/parks/new/page.tsx", "ParkWizard"],
    ["Kontakt", "app/(dashboard)/crm/contacts/page.tsx", "KontaktAnlegenDialog"],
    ["Lieferant", "app/(dashboard)/vendors/page.tsx", "VendorDialog"],
    ["Gemeinde", "app/(dashboard)/verwaltung/gemeinden/page.tsx", "GemeindeDialog"],
    ["Kostenstelle", "app/(dashboard)/wirtschaftsplan/cost-centers/page.tsx", "KostenstelleDialog"],
  ];
  for (const [name, seite, formular] of paare) {
    it(`${name}: Seite und Auswahl nutzen ${formular}`, () => {
      expect(lies(seite)).toContain(`<${formular}`);
      expect(auswahl).toContain(`<${formular}`);
    });
  }
});

describe("Formulare mit Anlegen aus der Auswahl", () => {
  const erwartet: Array<[string, string[]]> = [
    ["components/contracts/contract-wizard.tsx", ["ParkAuswahl", "GesellschaftAuswahl", "KontaktAuswahl"]],
    ["app/(dashboard)/contracts/[id]/edit/page.tsx", ["ParkAuswahl", "GesellschaftAuswahl", "KontaktAuswahl"]],
    ["app/(dashboard)/invoices/new/page.tsx", ["ParkAuswahl", "GesellschaftAuswahl"]],
    ["app/(dashboard)/invoices/[id]/edit/page.tsx", ["ParkAuswahl", "GesellschaftAuswahl"]],
    ["components/ppa/ppa-dialog.tsx", ["ParkAuswahl"]],
    ["components/inbox/split-editor.tsx", ["GesellschaftAuswahl"]],
    ["components/funds/onboarding-steps/step-participation.tsx", ["GesellschaftAuswahl"]],
    ["components/parks/turbine-dialogs/TurbineFormFields.tsx", ["GemeindeAuswahl"]],
    ["components/regulatory/MunicipalityBenefitSection.tsx", ["GemeindeAuswahl"]],
    ["app/(dashboard)/wirtschaftsplan/budget/[id]/page.tsx", ["KostenstelleAuswahl"]],
  ];
  for (const [datei, felder] of erwartet) {
    it(datei, () => {
      const quelle = lies(datei);
      for (const f of felder) expect(quelle, f).toContain(`<${f}`);
    });
  }

  it("die Lieferantensuche der Eingangsrechnung kann anlegen", () => {
    const suche = lies("components/inbox/vendor-autocomplete.tsx");
    expect(suche).toContain("<VendorDialog");
    expect(suche).toContain("anlegenEintrag(");
  });
});

describe("Dialog über einem Formular", () => {
  it("das Gesellschafts-Formular hält sein Absenden bei sich", () => {
    expect(lies("components/funds/fund-create-form.tsx")).toContain("e.stopPropagation()");
  });

  it("der Anlegen-Eintrag steht immer da, auch wenn die Suche nichts findet", () => {
    expect(lies("components/ui/combobox.tsx")).toMatch(/<Command\.Item\s+forceMount\s+value="__anlegen__"/);
  });
});
