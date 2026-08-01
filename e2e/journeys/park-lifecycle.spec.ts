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

    // Geprueft wird der gespeicherte WERT, nicht seine Darstellung.
    //
    // Der erste Entwurf suchte „18.500" auf der Detailseite und scheiterte —
    // zu Recht, aber aus einem anderen Grund als vermutet: die Seite zeigt
    // unter „Leistung" die Summe ueber die ANLAGEN, nicht das Feld am Park.
    // Ohne erfasste Nennleistungen steht dort ein Strich, egal was am Park
    // hinterlegt ist. Das ist eine Beobachtung ueber die Oberflaeche und
    // gehoert nicht in die Pruefung des Speicherns.
    const reloaded = await api.get<{ data?: { totalCapacityKw?: unknown } }>(
      `/api/parks/${created.id}`,
    );
    const park = (reloaded.data ?? reloaded) as { totalCapacityKw?: unknown };
    expect(
      Number(park.totalCapacityKw),
      "Die geaenderte Leistung wurde nicht gespeichert",
    ).toBe(18500);

    // Und die Detailseite laedt den Park ueberhaupt.
    await page.goto(`/parks/${created.id}`);
    await ready(page);
    await expect(
      page.locator("body"),
      "Die Detailseite zeigt den Parknamen nicht",
    ).toContainText(name, { timeout: 15_000 });

    // ---------------------------------------------------------------------
    // 6 · Löschen — und zwar wirklich
    // ---------------------------------------------------------------------
    // Ein frisch angelegter Park MUSS loeschbar sein.
    //
    // Das war er nicht: POST /api/parks legt zu jedem Park zwei virtuelle
    // Geraete an (Netzverknuepfungspunkt, Parkrechner), und die Loeschsperre
    // zaehlte sie als "Anlagen" mit. Der Park blockierte sich damit selbst —
    // mit Objekten, die der Nutzer nie angelegt hat. Behoben, indem die Sperre
    // nur noch echte Windkraftanlagen (deviceType WEA) zaehlt.
    const del = await page.request.delete(`/api/parks/${created.id}`);
    expect(
      del.ok(),
      `Ein Park ohne echte Anlagen muss loeschbar sein. HTTP ${del.status()}: ` +
        `${await del.text()}`,
    ).toBe(true);

    // Aus der Ansicht verschwunden ist nicht dasselbe wie geloescht.
    const after = await api.findByName("parks", name);
    expect(after, "Der Park ist nach dem Loeschen noch ueber die API auffindbar").toBeNull();

    // Aus der Aufräumliste nehmen — sonst versucht die Nachbereitung ein
    // zweites Löschen und meldet einen Fehlschlag für etwas, das gerade
    // erfolgreich entfernt wurde.
    api.untrack(created.id);
  });

  test("Park mit echter Anlage bleibt gesperrt", async ({ page, api }) => {
    // Die Kehrseite des Fehlers oben: die Sperre muss WEITER greifen, sobald
    // eine echte Windkraftanlage haengt. Ohne diesen Test waere die Korrektur
    // ein Freibrief zum Loeschen bestueckter Parks.
    const name = testName("Park mit Anlage");
    const park = await api.create("parks", { name, status: "ACTIVE" });

    const turbine = await page.request.post("/api/turbines", {
      data: {
        designation: testName("WEA"),
        deviceType: "WEA",
        parkId: park.id,
        status: "ACTIVE",
      },
    });
    expect(
      turbine.ok(),
      `Anlage anlegen fehlgeschlagen: ${await turbine.text()}`,
    ).toBe(true);
    const created = await turbine.json();
    api.track({
      collection: "turbines",
      id: (created.data ?? created).id,
      name: testName("WEA"),
    });

    const del = await page.request.delete(`/api/parks/${park.id}`);
    expect(
      del.status(),
      "Ein Park MIT Windkraftanlage darf nicht loeschbar sein",
    ).toBe(400);
    expect(await del.text()).toMatch(/Anlagen/i);
  });

  test("Pflichtfeld: ohne Namen bleibt Weiter gesperrt", async ({ page }) => {
    await page.goto("/parks/new");
    await ready(page);

    await expect(
      page.getByRole("button", { name: /weiter/i }).first(),
      "Weiter muesste ohne Namen gesperrt sein",
    ).toBeDisabled();
    await expect(
      page.locator("#park-wea-share"),
      "Schritt 2 ist sichtbar, obwohl Schritt 1 unvollstaendig ist",
    ).toHaveCount(0);
  });

  test("Detailseite eines bestehenden Parks zeigt seine Anlagen", async ({ page }) => {
    await page.goto("/parks");
    await ready(page);

    const row = await firstRow(page, "Parkliste");
    // Die Zeile selbst traegt die Navigation — ein <a> darin gibt es nicht.
    // Erste Fassung suchte danach und scheiterte an einer falschen Annahme
    // ueber die Umsetzung, nicht an einem Fehler der Anwendung.
    await row.click();

    await expect(page, "Kein Wechsel auf eine Park-Detailseite").toHaveURL(
      /\/parks\/[0-9a-f-]{36}/,
      { timeout: 15_000 },
    );
    await ready(page);
    await must(page.locator("h1").first(), "Ueberschrift der Detailseite");
  });
});
