/**
 * Pachtvertrag: Schritt 1 des Assistenten, mit echter Auswahl.
 *
 * Der generische Läufer scheiterte hier — mit einer Meldung, die genau sagte
 * warum:
 *
 *     "Weiter bleibt in Schritt 1 gesperrt, obwohl 1 Feld gefuellt wurde:
 *      feld-0(search). Vermutlich verlangt der Schritt eine Auswahl, die der
 *      Laeufer nicht bedienen kann."
 *
 * Genau so ist es: Schritt 1 verlangt die **Auswahl** eines Verpächters aus
 * einem Combobox. Das sichtbare Element ist eine Schaltfläche; das Suchfeld
 * erscheint erst im Popover. Ein `fill()` darauf bewirkt nichts.
 *
 * ## Wie weit dieser Test geht — und warum nicht weiter
 *
 * Bis Schritt 2. Der verlangt die nächste Vorbedingung: **Flurstücke**, die
 * es geben und die man auswählen muss. Sie hier mit anzulegen hiesse, in
 * einem Test drei Dinge gleichzeitig zu prüfen — und beim Fehlschlag wäre
 * unklar, welches davon kaputt ist.
 *
 * Was hier bewiesen wird, ist die Kette, an der es vorher hakte: Verpächter
 * anlegen, im Assistenten finden, auswählen, und dass die Auswahl den Schritt
 * freischaltet. Der Rest steht als eigene Aufgabe in
 * `e2e/journeys/README.md`.
 *
 * Ein Test, der bis zum Ende laufen WILL und dabei an einer fehlenden
 * Vorbedingung scheitert, ist kein Fortschritt — er ist ein roter Eintrag,
 * den bald jemand abschaltet.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { ready } from "../support/strict";
import { currentStep, selectFromCombobox, stepCount } from "../support/wizard";

test.describe("Pachtvertrag-Assistent", () => {
  test("Verpaechter auswaehlen schaltet Schritt 1 frei", async ({ page, api }) => {
    test.setTimeout(120_000);

    // Vorbedingung ueber die API: einen Verpaechter ueber die Oberflaeche
    // anzulegen wuerde das Kontaktformular pruefen, nicht diesen Assistenten.
    const nachname = testName("Verpaechter").replace(/\s+/g, "-");
    const person = await api.create(
      "persons",
      {
        personType: "natural",
        firstName: "E2E",
        lastName: nachname,
        city: "Teststadt",
      },
      "lastName",
    );
    expect(person.id, "Verpaechter konnte nicht angelegt werden").toBeTruthy();

    await page.goto("/leases/new");
    await ready(page);

    expect(await stepCount(page), "Der Assistent hat nicht vier Schritte").toBe(4);
    expect(await currentStep(page), "Beim Oeffnen muss Schritt 1 aktiv sein").toBe(0);

    const weiter = page.getByRole("button", { name: /^weiter/i }).first();
    await expect(
      weiter,
      "Weiter muesste ohne gewaehlten Verpaechter gesperrt sein",
    ).toBeDisabled();

    // Der Kern: der neu angelegte Verpaechter muss im Assistenten auffindbar
    // und auswaehlbar sein. Scheitert das, laedt die Liste ihn nicht — und
    // ein Nutzer koennte einen gerade erfassten Kontakt nicht verwenden.
    await selectFromCombobox(page, /verpächter|verpaechter|auswahl/i, nachname);

    await expect(
      weiter,
      "Weiter bleibt gesperrt, obwohl ein Verpaechter gewaehlt wurde",
    ).toBeEnabled({ timeout: 10_000 });

    // Die Auswahl wird auch angezeigt — der Assistent zeigt unter dem Feld
    // eine Zusammenfassung des Gewaehlten. Ohne sie waere nicht erkennbar,
    // WEN man gewaehlt hat.
    await expect(
      page.locator("body"),
      "Der gewaehlte Verpaechter wird nicht angezeigt",
    ).toContainText(nachname);

    await weiter.click();
    await expect
      .poll(() => currentStep(page), {
        message: "Der Wechsel auf Schritt 2 hat nicht stattgefunden",
        timeout: 10_000,
      })
      .toBe(1);
  });

  test("ohne Verpaechter kommt man nicht in Schritt 2", async ({ page }) => {
    await page.goto("/leases/new");
    await ready(page);

    await expect(
      page.getByRole("button", { name: /^weiter/i }).first(),
      "Weiter ist ohne Verpaechter nicht gesperrt",
    ).toBeDisabled();

    expect(
      await currentStep(page),
      "Der Assistent steht nicht mehr auf Schritt 1",
    ).toBe(0);
  });
});
