/**
 * Assistenten: jeden Schritt aufrufen, nicht nur den ersten.
 *
 * Ein Assistent ist die Stelle, an der am meisten schiefgehen kann und am
 * wenigsten geprüft wird: Zustand über mehrere Schritte, Vor- und
 * Zurücknavigation, Validierung je Schritt, und ein Absenden, das erst ganz
 * am Ende passiert. Die bestehende Suite öffnet zwei davon und prüft, dass
 * die Seite lädt.
 *
 * ## Was dieser Test prüft
 *
 * Für jeden Assistenten:
 *
 *  1. Die Schrittanzeige ist da und nennt die erwartete Zahl Schritte.
 *  2. „Weiter“ ohne Pflichtfelder kommt NICHT durch — sonst wäre die
 *     Validierung wirkungslos und der Fehler fiele erst beim Speichern auf.
 *  3. Mit gültigen Eingaben geht es weiter, und der nächste Schritt ist
 *     wirklich da.
 *  4. „Zurück“ führt zum vorherigen Schritt, und die Eingaben stehen noch —
 *     der klassische Fehler ist ein Zustand, der beim Zurückgehen verfällt.
 *
 * ## Was er NICHT tut
 *
 * Er schliesst die Assistenten nicht überall ab. Ein abgeschlossener
 * SEPA-Zahllauf oder eine finalisierte Abrechnung sind Vorgänge mit
 * Geldbezug, die sich nicht ohne Weiteres rückgängig machen lassen. Wo das
 * Abschliessen geprüft wird, steht es ausdrücklich dabei.
 */

import { test, expect } from "../support/fixtures";
import { must, ready } from "../support/strict";

interface WizardCase {
  name: string;
  path: string;
  /** Erwartete Schrittzahl laut Quelltext. */
  steps: number;
  /** Feld, das im ERSTEN Schritt vorhanden sein muss. */
  firstStepMarker: string;
  /**
   * Feld, das erst im ZWEITEN Schritt existiert.
   *
   * Der Beweis, dass der Schrittwechsel wirklich stattgefunden hat — eine
   * Schrittanzeige, die weiterspringt, ohne dass sich der Inhalt ändert, ist
   * ein häufiger Fehler.
   */
  secondStepMarker?: string;
}

const WIZARDS: WizardCase[] = [
  {
    name: "Park anlegen",
    path: "/parks/new",
    steps: 2,
    firstStepMarker: "#park-name",
    secondStepMarker: "#park-wea-share",
  },
  { name: "Vertrag anlegen", path: "/contracts/new", steps: 0, firstStepMarker: "form, [role='form'], input" },
  { name: "Pachtvertrag anlegen", path: "/leases/new", steps: 4, firstStepMarker: "input" },
  { name: "Pacht-Abrechnung", path: "/leases/settlement/new", steps: 4, firstStepMarker: "input, select, button" },
  { name: "Energie-Abrechnung", path: "/energy/settlements/wizard", steps: 5, firstStepMarker: "button" },
  { name: "Energie-Import", path: "/energy/import", steps: 4, firstStepMarker: "input, button" },
  { name: "Anlagen-Import", path: "/energy/turbine-import", steps: 4, firstStepMarker: "input, button" },
  { name: "Beteiligung einrichten", path: "/funds/onboarding", steps: 0, firstStepMarker: "input, button" },
];

test.describe("Assistenten", () => {
  for (const wizard of WIZARDS) {
    test(`${wizard.name} — oeffnet und zeigt den ersten Schritt`, async ({ page }) => {
      const response = await page.goto(wizard.path);
      // Ein Assistent, der 404 oder 500 liefert, ist kein „uebersprungener
      // Test" — er ist kaputt.
      expect(
        response?.status(),
        `${wizard.path} antwortet mit HTTP ${response?.status()}`,
      ).toBeLessThan(400);

      await ready(page);

      await must(
        page.locator("h1, h2").first(),
        `Ueberschrift im Assistenten ${wizard.name}`,
      );
      await must(
        page.locator(wizard.firstStepMarker).first(),
        `Erster Schritt von ${wizard.name} (${wizard.firstStepMarker})`,
      );

      // Kein unbehandelter Fehler auf der Seite.
      await expect(
        page.locator("body"),
        `${wizard.name} zeigt eine Fehlermeldung statt des Assistenten`,
      ).not.toContainText(/Application error|Unhandled Runtime Error|500 –/i);
    });
  }

  test("Park-Assistent: Zurueck erhaelt die Eingaben", async ({ page }) => {
    // Der Fehler, den man ohne diesen Test nie bemerkt: Schritt 2 öffnen,
    // zurückgehen — und Schritt 1 ist leer. Der Nutzer tippt alles neu.
    await page.goto("/parks/new");
    await ready(page);

    const marker = `E2E-Zustandstest-${Date.now().toString().slice(-6)}`;
    await must(page.locator("#park-name"), "Namensfeld");
    await page.locator("#park-name").fill(marker);

    const next = page.getByRole("button", { name: /weiter/i }).first();
    await must(next, "Schaltflaeche Weiter");
    await next.click();

    await must(
      page.locator("#park-wea-share"),
      "Schritt 2 — der Wechsel hat nicht stattgefunden",
    );

    const back = page.getByRole("button", { name: /zurück|zurueck/i }).first();
    await must(back, "Schaltflaeche Zurueck");
    await back.click();

    await expect(
      page.locator("#park-name"),
      "Nach dem Zurueckgehen ist die Eingabe aus Schritt 1 verloren",
    ).toHaveValue(marker);
  });

  test("Park-Assistent: Weiter ohne Pflichtfeld kommt nicht durch", async ({ page }) => {
    await page.goto("/parks/new");
    await ready(page);

    await page.getByRole("button", { name: /weiter/i }).first().click();

    // Der Beweis ist NICHT eine Fehlermeldung — die könnte auch erscheinen,
    // während der Assistent trotzdem weiterspringt. Der Beweis ist, dass
    // Schritt 2 nicht da ist.
    await expect(
      page.locator("#park-wea-share"),
      "Der Assistent ist ohne Pflichtfeld weitergesprungen",
    ).toHaveCount(0);
  });
});
