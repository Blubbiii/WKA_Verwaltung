/**
 * Assistenten: jeden Schritt durchgehen, nicht nur den ersten aufrufen.
 *
 * Ein Assistent ist die Stelle, an der am meisten schiefgehen kann und am
 * wenigsten geprüft wird: Zustand über mehrere Schritte, Vor- und
 * Zurücknavigation, Validierung je Schritt, und ein Absenden, das erst ganz
 * am Ende passiert. Die alte Suite öffnete zwei davon und prüfte, dass die
 * Seite lädt.
 *
 * ## Drei Stufen
 *
 * **Erreichbar** — jeder Assistent antwortet, zeigt eine Überschrift und
 * keinen Absturz. Gilt für alle.
 *
 * **Schrittanzeiger** — die Zahl der Schritte stimmt mit dem Quelltext
 * überein, und beim Öffnen ist der erste aktiv. Weicht die Zahl ab, wurde ein
 * Schritt ergänzt oder entfernt, ohne dass jemand den Test angefasst hat.
 *
 * **Durchgeklickt** — der Läufer geht Schritt für Schritt bis zum letzten,
 * füllt unterwegs die Pflichtfelder und weist nach, dass der Schrittanzeiger
 * wirklich mitgeht.
 *
 * Die Trennung ist Absicht. Ein Assistent, der eine hochzuladende Datei oder
 * einen abgeschlossenen Abrechnungszeitraum braucht, lässt sich nicht
 * generisch durchklicken — ihn trotzdem in die dritte Stufe zu nehmen hiesse
 * einen dauerhaft roten Test, den bald jemand abschaltet.
 *
 * ## Abgeschlossen wird nicht
 *
 * Der letzte Klick erzeugt einen Vorgang — einen SEPA-Zahllauf, eine
 * finalisierte Abrechnung, einen Mandanten. Das gehört in einen eigenen Test
 * mit eigener Aufräumung, nicht in einen Reihendurchlauf.
 */

import { test, expect } from "../support/fixtures";
import { must, ready } from "../support/strict";
import {
  assertBackKeepsInput,
  currentStep,
  stepCount,
  walkToLastStep,
} from "../support/wizard";

interface WizardCase {
  name: string;
  path: string;
  /** Schritte laut Quelltext. 0 = kein Schrittanzeiger (einseitige Maske). */
  steps: number;
  /**
   * Lässt sich der Assistent ohne Vorbedingungen durchklicken?
   *
   * `false` heisst nicht „ungetestet“, sondern „braucht mehr, als der Läufer
   * herstellen kann" — mit Begründung in `needs`.
   */
  walkable: boolean;
  needs?: string;
  /** Datei mit einem eigenen Test — dann ist der fehlende Durchlauf keine Luecke. */
  ownTest?: string;
  /** Erstes Eingabefeld, für die Zustandsprüfung bei „Zurück“. */
  firstField?: string;
}

const WIZARDS: WizardCase[] = [
  {
    name: "Park anlegen",
    path: "/parks/new",
    steps: 2,
    walkable: true,
    firstField: "#park-name",
  },
  {
    name: "Vertrag anlegen",
    path: "/contracts/new",
    // Meine erste Einordnung war "einseitige Maske ohne Schrittanzeiger" —
    // falsch. Der Assistent hat vier Schritte; meine Zaehlung im Quelltext
    // hat sein Format nur nicht erkannt.
    steps: 4,
    walkable: false,
    needs: "Schritt 1 verlangt die Auswahl einer Vertragsart",
    ownTest: "contract-wizard.spec.ts",
  },
  {
    name: "Pachtvertrag anlegen",
    path: "/leases/new",
    steps: 4,
    walkable: false,
    // Der Laeufer hat es selbst diagnostiziert: „Weiter bleibt in Schritt 1
    // gesperrt, obwohl 1 Feld gefuellt wurde: feld-0(search)." Schritt 1
    // verlangt die AUSWAHL eines Verpaechters aus einer Suchliste — Tippen
    // allein reicht nicht.
    needs: "Schritt 1 verlangt die Auswahl eines bestehenden Verpaechters",
    ownTest: "lease-wizard.spec.ts",
  },
  {
    name: "Pacht-Abrechnung",
    path: "/leases/settlement/new",
    steps: 4,
    walkable: false,
    needs: "verlangt Park und Abrechnungsjahr als Auswahl",
  },
  {
    name: "Energie-Abrechnung",
    path: "/energy/settlements/wizard",
    steps: 5,
    walkable: false,
    needs: "verlangt Park, Zeitraum und Netzbetreiber-Daten",
  },
  {
    name: "Energie-Import",
    path: "/energy/import",
    steps: 4,
    walkable: false,
    needs: "verlangt eine hochzuladende Datei",
  },
  {
    name: "Anlagen-Import",
    path: "/energy/turbine-import",
    steps: 4,
    walkable: false,
    needs: "verlangt eine hochzuladende Datei",
  },
  {
    name: "Beteiligung einrichten",
    path: "/funds/onboarding",
    steps: 0,
    walkable: false,
    needs: "eigener Ablauf ohne Schrittanzeiger",
  },
  {
    name: "SEPA-Zahllauf",
    path: "/buchhaltung/sepa/new",
    steps: 0,
    walkable: false,
    needs: "erzeugt einen Zahllauf — gehoert in einen eigenen Test",
  },
  {
    name: "Ersteinrichtung",
    path: "/setup",
    steps: 0,
    walkable: false,
    needs: "einmaliger Ablauf je Mandant",
  },
];

test.describe("Assistenten · erreichbar", () => {
  for (const wizard of WIZARDS) {
    test(`${wizard.name} oeffnet ohne Fehler`, async ({ page }) => {
      const response = await page.goto(wizard.path);
      // Ein Assistent, der 404 oder 500 liefert, ist kein uebersprungener
      // Test — er ist kaputt.
      expect(
        response?.status(),
        `${wizard.path} antwortet mit HTTP ${response?.status()}`,
      ).toBeLessThan(400);

      await ready(page);
      await must(page.locator("h1, h2").first(), `Ueberschrift in ${wizard.name}`);

      await expect(
        page.locator("body"),
        `${wizard.name} zeigt eine Fehlermeldung statt des Assistenten`,
      ).not.toContainText(/Application error|Unhandled Runtime Error/i);
    });
  }
});

test.describe("Assistenten · Schrittanzeiger", () => {
  for (const wizard of WIZARDS.filter((w) => w.steps > 0)) {
    test(`${wizard.name} zeigt ${wizard.steps} Schritte`, async ({ page }) => {
      await page.goto(wizard.path);
      await ready(page);

      expect(
        await stepCount(page),
        `${wizard.name}: erwartet ${wizard.steps} Schritte laut Quelltext`,
      ).toBe(wizard.steps);

      expect(
        await currentStep(page),
        `${wizard.name}: beim Oeffnen muss Schritt 1 aktiv sein`,
      ).toBe(0);
    });
  }
});

test.describe("Assistenten · durchklicken", () => {
  for (const wizard of WIZARDS.filter((w) => w.walkable)) {
    test(`${wizard.name} laesst sich bis zum letzten Schritt durchklicken`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.goto(wizard.path);
      await ready(page);

      const total = await stepCount(page);
      const last = await walkToLastStep(page, wizard.name);
      expect(last, `${wizard.name}: letzter Schritt nicht erreicht`).toBe(total - 1);

      // Im letzten Schritt steht eine abschliessende Schaltflaeche und keine
      // weitere „Weiter“. Sonst waere der Anzeiger am Ende, die Maske aber
      // nicht.
      await expect(
        page.getByRole("button", { name: /^weiter/i }),
        `${wizard.name}: im letzten Schritt gibt es noch ein Weiter`,
      ).toHaveCount(0);
    });
  }

  for (const wizard of WIZARDS.filter((w) => w.walkable && w.firstField)) {
    test(`${wizard.name}: Zurueck erhaelt die Eingaben`, async ({ page }) => {
      await page.goto(wizard.path);
      await ready(page);
      await assertBackKeepsInput(page, wizard.name, wizard.firstField!);
    });
  }
});

test.describe("Assistenten · Validierung", () => {
  test("Park: Weiter ist ohne Pflichtfeld gesperrt und loest sich damit", async ({
    page,
  }) => {
    // Erste Fassung wollte klicken und pruefen, dass nichts passiert. Der Lauf
    // zeigte etwas Besseres: die Schaltflaeche ist gesperrt. Die Anwendung
    // laesst den Fehler gar nicht erst zu, statt ihn hinterher zu melden.
    await page.goto("/parks/new");
    await ready(page);

    const next = page.getByRole("button", { name: /^weiter/i }).first();
    await expect(next, "Weiter muesste ohne Namen gesperrt sein").toBeDisabled();

    await page.locator("#park-name").fill("E2E-Sperrtest");
    await expect(
      next,
      "Weiter bleibt trotz ausgefuelltem Pflichtfeld gesperrt",
    ).toBeEnabled();
  });
});

test.describe("Assistenten · noch ohne Durchlauf", () => {
  // Kein test.skip: das waere ein Eintrag, den man wegklickt. Diese Zahl ist
  // eine sichtbare Aufgabe — waechst sie, ist ein Assistent dazugekommen, den
  // niemand durchklickt.
  // Ein Assistent zaehlt nur dann als offen, wenn er WEDER generisch
  // durchklickbar ist NOCH einen eigenen Test hat. Der Pacht-Assistent hat
  // seit lease-wizard.spec.ts einen — er ist keine Luecke mehr, auch wenn der
  // Laeufer ihn nicht bedienen kann.
  const offen = WIZARDS.filter((w) => !w.walkable && !w.ownTest);

  test("nicht mehr Assistenten ohne Pruefung als bekannt", () => {
    expect(
      offen.length,
      `Ohne generischen Durchlauf:\n${offen
        .map((w) => `  - ${w.name}: ${w.needs}`)
        .join("\n")}\nJeder braucht einen eigenen Test mit eigener Vorbereitung.`,
      // Stand 02.08.2026: sieben, nachdem Pacht- und Vertrags-Assistent je
      // einen eigenen Test bekommen haben. Die Schranke wird bei jedem neuen
      // Test mit nachgezogen — bliebe sie auf acht stehen, waere sie kein
      // Sperrklinken-Wert mehr, sondern nur noch eine Zahl, die immer passt.
    ).toBeLessThanOrEqual(7);
  });
});
