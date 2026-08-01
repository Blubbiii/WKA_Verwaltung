/**
 * Vertrag: der Assistent über alle vier Schritte, bis zum gespeicherten Vertrag.
 *
 * ## Eine Korrektur an meiner eigenen Einordnung
 *
 * Ich hatte diesen Assistenten als „einseitige Maske ohne Schrittanzeiger“
 * geführt. Das war falsch — er hat vier Schritte. Meine Zählung im Quelltext
 * hat sein Format nur nicht erkannt, weil die Schritt-Liste anders formatiert
 * ist als bei den übrigen.
 *
 * Der Fehler ist lehrreich: eine Einordnung, die auf einem `grep` beruht,
 * gehört überprüft, bevor sie zur Begründung wird, etwas NICHT zu testen.
 *
 * ## Warum er trotzdem einen eigenen Test braucht
 *
 * Die Vertragsart wird über Schaltflächen mit Symbolen gewählt, nicht über
 * ein Eingabefeld. Der generische Läufer füllt Felder — Schaltflächen kann er
 * nicht erraten, und `canProceed()` verlangt in Schritt 1 ausdrücklich
 * `contractType` UND `title`.
 *
 * ## Und dieser hier speichert wirklich
 *
 * Anders als beim Pacht-Assistenten, wo ein Vertrag Folgewirkungen in der
 * Abrechnung hätte: ein Vertrag steht für sich, lässt sich über die API
 * wieder löschen, und erst das Speichern beweist, dass der über vier Schritte
 * gesammelte Zustand vollständig ankommt.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { must, ready } from "../support/strict";
import { currentStep, goToNextStep, pickDate, stepCount } from "../support/wizard";

test.describe("Vertrags-Assistent", () => {
  test("vier Schritte durchklicken und den Vertrag speichern", async ({
    page,
    api,
  }) => {
    test.setTimeout(150_000);

    const titel = testName("Vertrag");

    await page.goto("/contracts/new");
    await ready(page);

    expect(await stepCount(page), "Der Assistent hat nicht vier Schritte").toBe(4);
    expect(await currentStep(page), "Beim Oeffnen muss Schritt 1 aktiv sein").toBe(0);

    const weiter = page.getByRole("button", { name: /^weiter/i }).first();
    await expect(
      weiter,
      "Weiter muesste ohne Vertragsart und Titel gesperrt sein",
    ).toBeDisabled();

    // --- Schritt 1: Art und Titel ----------------------------------------
    // Die Art wird ueber eine Schaltflaeche gewaehlt, nicht ueber ein Feld.
    const art = page.getByRole("button", { name: /Betriebsführungsvertrag/i }).first();
    await must(art, "Schaltflaeche fuer die Vertragsart");
    await art.click();

    await must(page.locator("#title"), "Titelfeld");
    await page.locator("#title").fill(titel);

    await expect(
      weiter,
      "Weiter bleibt gesperrt, obwohl Art und Titel gesetzt sind",
    ).toBeEnabled({ timeout: 10_000 });

    await weiter.click();
    await expect.poll(() => currentStep(page), { timeout: 10_000 }).toBe(1);

    // --- Schritt 2: Vertragsbeginn ---------------------------------------
    // Auch hier scheitert der generische Laeufer, und zwar mit derselben
    // Meldung wie beim Pacht-Assistenten: er hat drei Felder gefuellt, und
    // Weiter blieb gesperrt. Der Grund ist ein Pflichtfeld, das kein Feld
    // ist — der Vertragsbeginn haengt an einem Popover-Kalender.
    await expect(
      weiter,
      "Weiter muesste ohne Vertragsbeginn gesperrt sein",
    ).toBeDisabled();

    await pickDate(page);

    await expect(
      weiter,
      "Weiter bleibt gesperrt, obwohl ein Vertragsbeginn gewaehlt wurde",
    ).toBeEnabled({ timeout: 10_000 });

    // --- Schritte 3 und 4 -------------------------------------------------
    // Ab hier ist alles freiwillig; der generische Laeufer traegt.
    const gesamt = await stepCount(page);
    for (let i = await currentStep(page); i < gesamt - 1; i = await currentStep(page)) {
      await goToNextStep(page, "Vertrag anlegen");
    }
    expect(
      await currentStep(page),
      "Der letzte Schritt wurde nicht erreicht",
    ).toBe(gesamt - 1);

    // --- Speichern ---------------------------------------------------------
    const speichern = page.getByRole("button", { name: /vertrag erstellen/i }).first();
    await must(speichern, "Schaltflaeche „Vertrag erstellen“");

    // Die Antwort des Servers mitlesen. Ohne das meldet der Test nur „nicht
    // gefunden" und verschweigt, was der Server geantwortet hat — und man
    // sucht den Fehler im Assistenten, obwohl die Antwort ihn nennt.
    const antwort = page.waitForResponse(
      (r) => r.url().includes("/api/contracts") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await speichern.click();

    const res = await antwort;
    expect(
      res.ok(),
      `Speichern fehlgeschlagen: HTTP ${res.status()}\n${await res.text()}`,
    ).toBe(true);

    // Erst das Speichern beweist, dass der ueber vier Schritte gesammelte
    // Zustand vollstaendig ankommt. Eine Erfolgsmeldung beweist es nicht.
    await expect
      .poll(async () => (await api.findByName("contracts", titel)) !== null, {
        message:
          `Der Vertrag „${titel}“ wurde nach dem Speichern nicht ueber die API ` +
          `gefunden — der Zustand aus den vier Schritten ist unterwegs verloren ` +
          `gegangen oder das Speichern ist stumm gescheitert.`,
        timeout: 25_000,
      })
      .toBe(true);

    const angelegt = (await api.findByName("contracts", titel))!;
    api.track({ collection: "contracts", id: angelegt.id, name: titel });

    // Die Vertragsart muss die gewaehlte sein — nicht die erste der Liste.
    const detail = await api.get<{
      contractType?: string;
      data?: { contractType?: string };
    }>(`/api/contracts/${angelegt.id}`);
    expect(
      detail.data?.contractType ?? detail.contractType,
      "Die gewaehlte Vertragsart kam nicht an",
    ).toBe("SERVICE");
  });

  test("ohne Vertragsart bleibt Weiter gesperrt", async ({ page }) => {
    await page.goto("/contracts/new");
    await ready(page);

    // Nur den Titel — die Art fehlt. canProceed() verlangt beides.
    await must(page.locator("#title"), "Titelfeld");
    await page.locator("#title").fill("E2E-Nur-Titel");

    await expect(
      page.getByRole("button", { name: /^weiter/i }).first(),
      "Weiter ist ohne Vertragsart nicht gesperrt",
    ).toBeDisabled();
  });
});
