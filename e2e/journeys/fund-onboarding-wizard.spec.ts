/**
 * Beteiligung einrichten: fünf Schritte bis zum angelegten Gesellschafter.
 *
 * ## Zwei Schutzschichten, und beide gehören geprüft
 *
 * Ich hatte den Assistenten zuerst als „prüft erst beim Klick" eingeordnet,
 * weil `handleNext()` sichtbar validiert. Falsch: `canGoNext()` sperrt die
 * Schaltfläche zusätzlich, und dieselbe Prüfung läuft zweimal.
 *
 * Das ist kein Fehler, sondern eine sinnvolle Doppelung — die Sperre
 * verhindert den Klick, die Prüfung im Klick fängt ab, was über die Tastatur
 * oder einen Sprung im Schrittanzeiger doch durchkommt. Geprüft wird deshalb
 * die Sperre, denn sie ist das, was der Nutzer zuerst trifft.
 *
 * ## Was am Ende zählt
 *
 * Der Kapitalanteil. Er entscheidet über jede spätere Ausschüttung, wird
 * über fünf Schritte hinweg getragen und ist am Ende eine Zahl in einer
 * Datenbank — dass sie dieselbe ist wie die eingegebene, prüft sonst niemand.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { must, ready } from "../support/strict";
import { currentStep, selectOption, stepCount } from "../support/wizard";

/** Krumm gewählt: eine gerundete Zahl verstellt den Blick auf Rundungsfehler. */
const KAPITALANTEIL = 12_345.67;

test.describe("Beteiligung einrichten", () => {
  test("fuenf Schritte durchklicken und den Gesellschafter anlegen", async ({
    page,
    api,
  }) => {
    test.setTimeout(300_000);

    // --- Vorbedingung: eine Gesellschaft ---------------------------------
    const fondsName = testName("Fonds Onboarding");
    const fonds = await api.create("funds", {
      name: fondsName,
      legalForm: "GmbH & Co. KG",
      status: "ACTIVE",
    });
    expect(fonds.id, "Gesellschaft konnte nicht angelegt werden").toBeTruthy();

    const nachname = testName("Gesellschafter").replace(/\s+/g, "-");
    const email = `e2e-${Date.now()}@example.invalid`;

    await page.goto("/funds/onboarding");
    await ready(page);

    expect(await stepCount(page), "Der Assistent hat nicht fuenf Schritte").toBe(5);
    expect(await currentStep(page), "Beim Oeffnen muss Schritt 1 aktiv sein").toBe(0);

    const weiter = () => page.getByRole("button", { name: /^weiter/i }).first();

    // --- Ohne Stammdaten geht es nicht weiter ----------------------------
    await expect(
      weiter(),
      "Weiter ist ohne Vorname, Nachname und E-Mail frei",
    ).toBeDisabled();

    // --- Schritt 1: Stammdaten -------------------------------------------
    await must(page.locator("#onb-firstName"), "Feld Vorname");
    await page.locator("#onb-firstName").fill("E2E");
    await page.locator("#onb-lastName").fill(nachname);
    await page.locator("#onb-email").fill(email);

    await expect(
      weiter(),
      "Weiter bleibt gesperrt, obwohl die Stammdaten vollstaendig sind",
    ).toBeEnabled({ timeout: 10_000 });
    await weiter().click();
    await expect.poll(() => currentStep(page), { timeout: 15_000 }).toBe(1);

    // --- Schritt 2: Beteiligung ------------------------------------------
    await expect(
      weiter(),
      "Weiter ist ohne Gesellschaft, Kapitalanteil und Beitrittsdatum frei — " +
        "ein Gesellschafter ohne Anteil bekaeme nie eine Ausschuettung",
    ).toBeDisabled();

    await selectOption(page, "onb-fund", new RegExp(fondsName));
    await must(page.locator("#onb-capitalContribution"), "Feld Kapitalanteil");
    await page.locator("#onb-capitalContribution").fill(String(KAPITALANTEIL));

    const heuteInBerlin = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    await page.locator("#onb-entryDate").fill(heuteInBerlin);

    await expect(
      weiter(),
      "Weiter bleibt gesperrt, obwohl Gesellschaft, Anteil und Datum gesetzt sind",
    ).toBeEnabled({ timeout: 10_000 });
    await weiter().click();
    await expect.poll(() => currentStep(page), { timeout: 15_000 }).toBe(2);

    // --- Schritte 3 und 4: freiwillig ------------------------------------
    await weiter().click();
    await expect.poll(() => currentStep(page), { timeout: 15_000 }).toBe(3);
    await weiter().click();
    await expect.poll(() => currentStep(page), { timeout: 15_000 }).toBe(4);

    // --- Schritt 5: Anlegen ----------------------------------------------
    const antwort = page.waitForResponse(
      (r) =>
        r.url().includes("/api/shareholders/onboard") &&
        r.request().method() === "POST",
      { timeout: 60_000 },
    );

    const anlegen = page
      .getByRole("button", { name: /gesellschafter anlegen|anlegen|erstellen/i })
      .last();
    await must(anlegen, "Schaltflaeche zum Anlegen");
    await anlegen.click();

    const res = await antwort;
    expect(
      res.ok(),
      `Anlegen fehlgeschlagen: HTTP ${res.status()}\n${await res.text()}`,
    ).toBe(true);

    const rumpf = await res.json();
    const angelegt = rumpf.data ?? rumpf;
    const shareholderId: string =
      angelegt.shareholder?.id ?? angelegt.shareholderId ?? angelegt.id;
    expect(shareholderId, "Die Antwort enthielt keine Kennung").toBeTruthy();
    api.track({
      collection: "shareholders",
      id: shareholderId,
      name: nachname,
    });

    // --- Der Kapitalanteil ist die Zahl, auf die es ankommt --------------
    // Aus ihm wird jede spaetere Ausschuettung gerechnet. Er hat fuenf
    // Schritte ueberlebt, und ob er dabei unveraendert blieb, prueft sonst
    // niemand.
    const gelesen = await api.get<Record<string, unknown>>(
      `/api/shareholders/${shareholderId}`,
    );
    const daten = (gelesen.data ?? gelesen) as Record<string, unknown>;

    expect(
      Number(daten.capitalContribution),
      `Der Kapitalanteil betraegt ${daten.capitalContribution} statt ` +
        `${KAPITALANTEIL}. Aus ihm wird jede Ausschuettung gerechnet.`,
    ).toBeCloseTo(KAPITALANTEIL, 2);

    expect(
      daten.fundId,
      "Der Gesellschafter haengt an einer anderen Gesellschaft als gewaehlt",
    ).toBe(fonds.id);
  });
});
