/**
 * Pachtvertrag-Assistent: alle vier Schritte bis zum gespeicherten Vertrag.
 *
 * ## Warum das lange offen war — und warum es keine Fleissarbeit ist
 *
 * Als Grund stand in der Liste „braucht Flurstücke". Die lassen sich
 * herstellen; die eigentliche Hürde ist eine andere: **kein einziger Schritt
 * lässt sich durch Tippen erledigen.**
 *
 *  - Schritt 1 verlangt die Auswahl eines Verpächters aus einer Suchliste.
 *  - Schritt 2 verlangt die Auswahl von Flurstücken aus einer Kachelliste —
 *    ohne Kästchen, die ganze Zeile ist anklickbar.
 *  - Schritt 3 verlangt ein Datum aus einem Popover-Kalender.
 *
 * Der generische Läufer füllt Felder. Hier gibt es keine.
 *
 * Das ist der Weg, auf dem in diesem Programm **jeder** Pachtvertrag entsteht.
 * Geprüft war davon bis heute Schritt 1.
 *
 * ## Was am Ende zählt
 *
 * Nicht „gespeichert", sondern: **kommen Verpächter und Fläche beide an.** Ein
 * Pachtvertrag ohne Verpächter oder ohne Flurstück ist wertlos, und beides
 * wird über vier Seitenwechsel hinweg eingesammelt. Genau da geht so etwas
 * verloren — und die Erfolgsmeldung sähe gleich aus.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { must, ready } from "../support/strict";
import { currentStep, pickDate, selectFromCombobox } from "../support/wizard";

test.describe("Pachtvertrag-Assistent · vollstaendig", () => {
  test("vier Schritte durchklicken und den Pachtvertrag speichern", async ({
    page,
    api,
  }) => {
    test.setTimeout(300_000);

    const nachname = testName("Verpaechter voll").replace(/\s+/g, "-");
    const person = await api.create(
      "persons",
      { personType: "natural", firstName: "E2E", lastName: nachname, city: "Cuxhaven" },
      "lastName",
    );

    const gemarkung = testName("Gemarkung voll").replace(/\s+/g, "-");
    const flurstueck = String(Date.now()).slice(-6);
    const plotRes = await page.request.post("/api/plots", {
      data: {
        cadastralDistrict: gemarkung,
        fieldNumber: "1",
        plotNumber: flurstueck,
        areaSqm: 25_000,
        plotAreas: [{ areaType: "POOL", areaSqm: 20_000 }],
      },
    });
    expect(
      plotRes.ok(),
      `Flurstueck anlegen fehlgeschlagen: HTTP ${plotRes.status()}\n${await plotRes.text()}`,
    ).toBe(true);
    const plotRumpf = await plotRes.json();
    api.track({
      collection: "plots",
      id: (plotRumpf.data ?? plotRumpf).id,
      name: gemarkung,
    });

    await page.goto("/leases/new");
    await ready(page);

    // --- Schritt 1: Verpaechter ------------------------------------------
    const weiter = () => page.getByRole("button", { name: /^weiter/i }).first();
    await expect(weiter(), "Weiter ist ohne Verpaechter frei").toBeDisabled();

    await selectFromCombobox(page, /verpächter|verpaechter|auswahl/i, nachname);
    await expect(weiter(), "Weiter bleibt trotz Verpaechter gesperrt").toBeEnabled({
      timeout: 10_000,
    });
    await weiter().click();
    await expect.poll(() => currentStep(page), { timeout: 15_000 }).toBe(1);

    // --- Schritt 2: Flurstuecke ------------------------------------------
    await expect(
      weiter(),
      "Weiter ist ohne Flurstueck frei — der Pachtvertrag haette keine Flaeche",
    ).toBeDisabled();

    const suche = page.getByPlaceholder(/gemarkung/i).first();
    await must(suche, "Suchfeld fuer Flurstuecke");
    await suche.fill(gemarkung);

    // Ueber die Suche und nicht ueber die erste Zeile: sonst haengt der Test
    // davon ab, was zufaellig oben steht.
    await expect(
      page.locator("body"),
      `Das Flurstueck ${gemarkung} ${flurstueck} erscheint nicht in der Auswahl`,
    ).toContainText(flurstueck, { timeout: 15_000 });

    await page.getByText(flurstueck, { exact: false }).last().click();

    await expect(
      weiter(),
      "Weiter bleibt gesperrt, obwohl ein Flurstueck gewaehlt wurde",
    ).toBeEnabled({ timeout: 10_000 });
    await weiter().click();
    await expect.poll(() => currentStep(page), { timeout: 15_000 }).toBe(2);

    // --- Schritt 3: Vertragsbeginn ---------------------------------------
    await expect(weiter(), "Weiter ist ohne Vertragsbeginn frei").toBeDisabled();

    await pickDate(page);

    await expect(
      weiter(),
      "Weiter bleibt gesperrt, obwohl ein Vertragsbeginn gewaehlt wurde",
    ).toBeEnabled({ timeout: 10_000 });
    await weiter().click();
    await expect.poll(() => currentStep(page), { timeout: 15_000 }).toBe(3);

    // --- Schritt 4: Speichern --------------------------------------------
    const antwort = page.waitForResponse(
      (r) => r.url().includes("/api/leases") && r.request().method() === "POST",
      { timeout: 60_000 },
    );

    const speichern = page
      .getByRole("button", { name: /pachtvertrag erstellen/i })
      .first();
    await must(speichern, "Schaltflaeche zum Speichern");
    await speichern.click();

    const res = await antwort;
    expect(
      res.ok(),
      `Speichern fehlgeschlagen: HTTP ${res.status()}\n${await res.text()}`,
    ).toBe(true);

    const rumpf = await res.json();
    const pacht = rumpf.data ?? rumpf;
    expect(pacht.id, "Die Antwort enthielt keine Kennung").toBeTruthy();
    api.track({ collection: "leases", id: pacht.id, name: nachname });

    // --- Kommen beide Auswahlen an? --------------------------------------
    const gelesen = await api.get<Record<string, unknown>>(`/api/leases/${pacht.id}`);
    const daten = (gelesen.data ?? gelesen) as Record<string, unknown>;

    expect(
      daten.lessorId,
      "Der in Schritt 1 gewaehlte Verpaechter kam nicht an",
    ).toBe(person.id);

    const flaechen = (daten.leasePlots ?? []) as { plot?: { plotNumber?: string } }[];
    expect(
      flaechen.length,
      "Der Pachtvertrag hat kein Flurstueck — die Auswahl aus Schritt 2 ging " +
        "ueber die Seitenwechsel verloren",
    ).toBe(1);
    expect(
      flaechen[0]?.plot?.plotNumber,
      "Am Vertrag haengt ein anderes Flurstueck als gewaehlt",
    ).toBe(flurstueck);
  });

  test("ein bereits verpachtetes Flurstueck laesst sich nicht erneut waehlen", async ({
    page,
    api,
  }) => {
    test.setTimeout(300_000);

    // Die Regel gegen doppelte Verpachtung. Ohne sie entstuenden zwei
    // Vertraege ueber dieselbe Flaeche — und die Pacht wuerde zweimal
    // gerechnet, ohne dass irgendwo ein Widerspruch auffiele.
    //
    // Zwei Schutzschichten, und beide gehoeren geprueft: der Assistent BLENDET
    // verpachtete Flaechen standardmaessig aus (Schalter "Nur verfuegbare
    // Flurstuecke"), und selbst mit ausgeschaltetem Filter laesst er sie nicht
    // waehlen. Meine erste Fassung kannte nur die zweite Schicht und suchte
    // ein Flurstueck, das gar nicht angezeigt wurde.
    const nachname = testName("Verpaechter doppelt").replace(/\s+/g, "-");
    const gemarkung = testName("Gemarkung doppelt").replace(/\s+/g, "-");
    const flurstueck = String(Date.now()).slice(-6);

    const plotRes = await page.request.post("/api/plots", {
      data: {
        cadastralDistrict: gemarkung,
        fieldNumber: "1",
        plotNumber: flurstueck,
        areaSqm: 10_000,
      },
    });
    expect(plotRes.ok(), `Flurstueck anlegen: ${await plotRes.text()}`).toBe(true);
    const plotRumpf = await plotRes.json();
    const plotId = (plotRumpf.data ?? plotRumpf).id;
    api.track({ collection: "plots", id: plotId, name: gemarkung });

    const pachtRes = await page.request.post("/api/leases", {
      data: {
        plotIds: [plotId],
        newLessor: {
          personType: "natural",
          firstName: "E2E",
          lastName: nachname,
          city: "Cuxhaven",
        },
        startDate: "2020-01-01",
        status: "ACTIVE",
      },
    });
    expect(pachtRes.ok(), `Pachtvertrag anlegen: ${await pachtRes.text()}`).toBe(true);
    const pachtRumpf = await pachtRes.json();
    api.track({
      collection: "leases",
      id: (pachtRumpf.data ?? pachtRumpf).id,
      name: nachname,
    });

    await page.goto("/leases/new");
    await ready(page);
    await selectFromCombobox(page, /verpächter|verpaechter|auswahl/i, nachname);
    await page.getByRole("button", { name: /^weiter/i }).first().click();
    await expect.poll(() => currentStep(page), { timeout: 15_000 }).toBe(1);

    const suche = page.getByPlaceholder(/gemarkung/i).first();
    await must(suche, "Suchfeld fuer Flurstuecke");
    await suche.fill(gemarkung);

    // --- Erste Schicht: es wird gar nicht erst angezeigt -----------------
    await expect(
      page.locator("body"),
      "Ein verpachtetes Flurstueck steht trotz aktivem Filter zur Auswahl",
    ).not.toContainText(flurstueck, { timeout: 10_000 });

    // --- Zweite Schicht: auch sichtbar bleibt es unwaehlbar --------------
    const schalter = page.getByRole("switch").first();
    await must(schalter, "Schalter „Nur verfuegbare Flurstuecke“");
    await schalter.click();

    await expect(
      page.locator("body"),
      "Nach dem Abschalten des Filters fehlt das verpachtete Flurstueck immer " +
        "noch — dann kann man es auch nicht als vergeben erkennen",
    ).toContainText(flurstueck, { timeout: 15_000 });

    await page.getByText(flurstueck, { exact: false }).last().click();

    await expect(
      page.getByRole("button", { name: /^weiter/i }).first(),
      "Ein bereits verpachtetes Flurstueck wurde uebernommen — damit entstuende " +
        "ein zweiter Vertrag ueber dieselbe Flaeche, und die Pacht wuerde " +
        "zweimal gerechnet",
    ).toBeDisabled({ timeout: 10_000 });
  });
});
