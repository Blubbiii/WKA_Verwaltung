/**
 * Reste des Buchhaltungsausbaus — was man in der Oberfläche davon sah.
 *
 * Jeder dieser Tests hält einen Fehler fest, der nach dem Ausbau im Programm
 * stand und den weder Compiler noch Unit-Tests sahen:
 *
 * 1. Die Periodensperre war gerettet, aber über kein Menü erreichbar.
 * 2. „Mahnwesen" stand zweimal untereinander im Menü.
 * 3. Die Rechnungsliste bot noch den DATEV-Buchungsstapel an; an seine Stelle
 *    tritt der Belegexport.
 * 4. Der Admin-Reiter „Feature-Flags" zeigte einen Schalter „Buchhaltung".
 *    Ein Klick darauf blendete eine Karte ein, die auf Daten zugriff, die die
 *    API nie lieferte — der Admin-Bereich stürzte ab.
 */

import { test, expect } from "../support/fixtures";
import { must, ready } from "../support/strict";

test.describe("Reste des Buchhaltungsausbaus", () => {
  test("die Periodensperre ist über das Menü erreichbar", async ({ page }) => {
    const konsole: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") konsole.push(m.text());
    });
    page.on("pageerror", (e) => konsole.push(e.message));

    await page.goto("/invoices");
    await ready(page);

    const eintrag = page.getByRole("link", { name: "Periodensperre" });
    await must(eintrag, "Menüeintrag Periodensperre unter Rechnungen");
    await eintrag.click();

    // Im Entwicklungsmodus kompiliert die Zielseite beim ersten Aufruf; das
    // dauerte im ersten Lauf knapp zehn Sekunden.
    await expect(page).toHaveURL(/\/admin\/periodensperre/, { timeout: 30_000 });
    await must(page.getByRole("heading", { level: 1 }), "Überschrift der Periodensperre");
    expect(konsole, `Fehler in der Browserkonsole: ${konsole.join(" | ")}`).toEqual([]);
  });

  test("Mahnwesen steht genau einmal im Menü", async ({ page }) => {
    await page.goto("/invoices");
    await ready(page);

    const navigation = page.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(navigation.getByRole("link", { name: /^Mahnwesen/ })).toHaveCount(1);
    await expect(navigation.getByRole("link", { name: /^Zahlungserinnerungen/ })).toHaveCount(1);
  });

  test("die Rechnungsliste führt zum Belegexport statt zum DATEV-Stapel", async ({ page }) => {
    await page.goto("/invoices");
    await ready(page);

    const knopf = page.getByRole("link", { name: "Belegexport" }).last();
    await must(knopf, "Knopf Belegexport in der Rechnungsliste");
    await expect(knopf).toHaveAttribute("href", "/invoices/beleg-export");
    await expect(page.getByRole("button", { name: /DATEV/ })).toHaveCount(0);
  });

  test("die Feature-Flags zeigen keinen Buchhaltungsschalter mehr", async ({ page }) => {
    const fehler: string[] = [];
    page.on("pageerror", (e) => fehler.push(e.message));

    await page.goto("/admin/tenants?tab=features");
    await ready(page);

    // Erst muss die Tabelle mit echten Modulen stehen — sonst bewiese die
    // Abwesenheit von "Buchhaltung" nur, dass noch nichts geladen ist.
    const tabelle = page.getByRole("table").filter({ hasText: "Wirtschaftsplan" }).first();
    await must(tabelle, "Tabelle der Module mit Eintrag Wirtschaftsplan", 20_000);
    await expect(tabelle).not.toContainText("Buchhaltung");
    expect(fehler, `Laufzeitfehler auf der Seite: ${fehler.join(" | ")}`).toEqual([]);
  });
});
