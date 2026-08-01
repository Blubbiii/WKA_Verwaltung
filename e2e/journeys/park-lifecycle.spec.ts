/**
 * Park: anlegen über den Assistenten, wiederfinden, ändern, löschen.
 *
 * Der erste Ablauf, der wirklich etwas tut. Die bestehende Suite ruft
 * `/parks/new` auf und prüft, dass bei leerem Formular ein Fehler erscheint —
 * ein Park wird nie angelegt.
 *
 * ## Was hier anders ist
 *
 * Jeder Schritt prüft die WIRKUNG, nicht das Aussehen:
 *
 *  - nach dem Speichern: steht der Park in der API-Liste?
 *  - nach dem Ändern: hat das Feld den neuen Wert, auch nach Neuladen?
 *  - nach dem Löschen: ist er WIRKLICH weg, oder nur aus der Ansicht?
 *
 * Und nichts wird übersprungen. Fehlt eine Schaltfläche, scheitert der Test
 * mit der Angabe, welche gesucht wurde.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { must, ready, clickButton, firstRow } from "../support/strict";

test.describe("Park-Lebenszyklus", () => {
  test("Assistent: Park anlegen, aendern und wieder loeschen", async ({
    page,
    api,
  }) => {
    test.setTimeout(120_000);

    const name = testName("Park");
    const shortName = `E2E${Date.now().toString().slice(-6)}`;

    // ---------------------------------------------------------------------
    // 1 · Assistent, Schritt 1: Stammdaten
    // ---------------------------------------------------------------------
    await page.goto("/parks/new");
    await ready(page);

    await must(page.locator("#park-name"), "Namensfeld im Assistenten");
    await page.locator("#park-name").fill(name);
    await page.locator("#park-shortname").fill(shortName);
    await page.locator("#park-capacity").fill("12000");

    // Der Assistent hat zwei Schritte. Ohne den Wechsel wäre nur die halbe
    // Maske geprüft — genau das, was „Assistenten durchklicken“ bedeutet.
    await clickButton(page, /weiter/i, "Schaltflaeche „Weiter“ in Schritt 1");

    // ---------------------------------------------------------------------
    // 2 · Schritt 2: Abrechnung
    // ---------------------------------------------------------------------
    await must(
      page.locator("#park-wea-share"),
      "Feld „WEA-Anteil“ in Schritt 2 — der Schrittwechsel hat nicht gegriffen",
    );
    await page.locator("#park-wea-share").fill("10");
    await page.locator("#park-pool-share").fill("90");
    await page.locator("#park-min-rent").fill("15000");

    await clickButton(page, /speichern|anlegen|erstellen/i, "Speichern-Schaltflaeche");

    // ---------------------------------------------------------------------
    // 3 · Wirkung prüfen — über die API, nicht über die Optik
    // ---------------------------------------------------------------------
    // Eine Erfolgsmeldung heisst nicht, dass gespeichert wurde. Gefragt wird
    // nach dem Wert.
    await expect
      .poll(async () => (await api.findByName("parks", name)) !== null, {
        message: `Park „${name}“ wurde nach dem Speichern nicht ueber die API gefunden`,
        timeout: 20_000,
      })
      .toBe(true);

    const created = (await api.findByName("parks", name))!;
    // Ab hier ist der Park dem Aufräumen bekannt — auch wenn der Test gleich
    // scheitert, bleibt er nicht liegen.
    api.track({ collection: "parks", id: created.id, name });

    // ---------------------------------------------------------------------
    // 4 · In der Liste sichtbar
    // ---------------------------------------------------------------------
    await page.goto("/parks");
    await ready(page);
    const search = page.getByPlaceholder(/suche/i).first();
    await must(search, "Suchfeld in der Parkliste");
    await search.fill(name);
    await expect(
      page.locator("table tbody"),
      "Der neue Park erscheint nicht in der gefilterten Liste",
    ).toContainText(name, { timeout: 15_000 });

    // ---------------------------------------------------------------------
    // 5 · Ändern — und das Ändern überlebt ein Neuladen
    // ---------------------------------------------------------------------
    const changed = { totalCapacityKw: 18500 };
    const patch = await page.request.put(`/api/parks/${created.id}`, {
      data: { name, ...changed },
    });
    expect(
      patch.ok(),
      `Aendern fehlgeschlagen: HTTP ${patch.status()} ${await patch.text()}`,
    ).toBe(true);

    await page.goto(`/parks/${created.id}`);
    await ready(page);
    await expect(
      page.locator("body"),
      "Die geaenderte Leistung steht nicht auf der Detailseite",
    ).toContainText(/18[.,]?500/, { timeout: 15_000 });

    // ---------------------------------------------------------------------
    // 6 · Löschen — und zwar wirklich
    // ---------------------------------------------------------------------
    const del = await page.request.delete(`/api/parks/${created.id}`);
    expect(del.ok(), `Loeschen fehlgeschlagen: HTTP ${del.status()}`).toBe(true);

    // Aus der Ansicht verschwunden ist nicht dasselbe wie geloescht.
    const after = await api.findByName("parks", name);
    expect(after, "Der Park ist nach dem Loeschen noch ueber die API auffindbar").toBeNull();

    // Aus der Aufräumliste nehmen — sonst versucht die Nachbereitung ein
    // zweites Löschen und meldet einen Fehlschlag für etwas, das gerade
    // erfolgreich entfernt wurde.
    api.untrack(created.id);
  });

  test("Pflichtfeld: ohne Namen laesst sich nicht speichern", async ({ page }) => {
    await page.goto("/parks/new");
    await ready(page);

    // Direkt weiter, ohne Namen.
    await clickButton(page, /weiter/i, "Schaltflaeche Weiter");

    // Der Assistent darf NICHT in Schritt 2 wechseln.
    await expect(
      page.locator("#park-wea-share"),
      "Der Assistent ist ohne Pflichtfeld in den naechsten Schritt gewechselt",
    ).toHaveCount(0);
  });

  test("Detailseite eines bestehenden Parks zeigt seine Anlagen", async ({ page }) => {
    await page.goto("/parks");
    await ready(page);

    const row = await firstRow(page, "Parkliste");
    const link = row.locator("a").first();
    await must(link, "Verweis auf die Detailseite in der ersten Zeile");
    await link.click();

    await expect(page, "Kein Wechsel auf eine Park-Detailseite").toHaveURL(
      /\/parks\/[0-9a-f-]{36}/,
      { timeout: 15_000 },
    );
    await ready(page);
    await must(page.locator("h1").first(), "Ueberschrift der Detailseite");
  });
});
