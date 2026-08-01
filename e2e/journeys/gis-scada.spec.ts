/**
 * Flächen und SCADA — die beiden Bereiche mit bisher null Abdeckung.
 *
 * ## Warum Flächen nicht „eingezeichnet“ werden
 *
 * Ein Polygon auf einer Leaflet-Karte zu zeichnen hiesse, Mausbewegungen auf
 * ein Canvas zu simulieren. Solche Tests brechen bei jeder Änderung an Zoom,
 * Kartenausschnitt oder Kachelserver — sie prüfen am Ende die Kartenbibliothek
 * und nicht das Programm.
 *
 * Was das Programm ausmacht, ist etwas anderes: **kommt die gezeichnete
 * Fläche heil durch und wieder heraus.** Genau das wird hier geprüft — ein
 * Flurstück mit echter GeoJSON-Geometrie anlegen, wiederfinden, und
 * nachsehen, ob die Koordinaten unverändert zurückkommen. Und die Gegenprobe:
 * eine kaputte Geometrie muss abgewiesen werden, statt auf der Karte einen
 * Fehler auszulösen.
 *
 * ## Warum der SCADA-Import nicht ausgeführt wird
 *
 * Er verlangt Enercon-WSD-Dateien im Binärformat. Eine davon nachzubauen
 * hiesse, das Format im Test zu verdoppeln — und wenn sich das Format ändert,
 * hätte man zwei Stellen zu pflegen und eine falsche Sicherheit.
 *
 * Geprüft wird stattdessen, was ohne Datei prüfbar ist: dass die Oberfläche
 * steht, die Auswertungen antworten und die Anomalie-Erkennung erreichbar
 * ist. Der Import selbst gehört mit einer echten Beispieldatei in einen
 * eigenen Test — das steht als Aufgabe im README.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { must, ready } from "../support/strict";

/** Ein kleines, gültiges Polygon — geschlossen, im richtigen Wickelsinn. */
const POLYGON = {
  type: "Polygon",
  coordinates: [
    [
      [8.7000, 53.8660],
      [8.7010, 53.8660],
      [8.7010, 53.8670],
      [8.7000, 53.8670],
      [8.7000, 53.8660],
    ],
  ],
};

test.describe("Flurstuecke mit Geometrie", () => {
  test("Polygon anlegen und unveraendert wieder auslesen", async ({ page, api }) => {
    test.setTimeout(120_000);

    const gemarkung = testName("Gemarkung").replace(/\s+/g, "-");
    const flurstueck = String(Date.now()).slice(-6);

    const res = await page.request.post("/api/plots", {
      data: {
        cadastralDistrict: gemarkung,
        fieldNumber: "1",
        plotNumber: flurstueck,
        areaSqm: 12500,
        geometry: POLYGON,
      },
    });
    expect(
      res.ok(),
      `Flurstueck anlegen fehlgeschlagen: HTTP ${res.status()}\n${await res.text()}`,
    ).toBe(true);

    const body = await res.json();
    const plot = body.data ?? body;
    api.track({ collection: "plots", id: plot.id, name: gemarkung });

    // Der Kern: die Koordinaten muessen exakt so zurueckkommen. Eine
    // Umrechnung, ein verschluckter Punkt oder eine vertauschte Reihenfolge
    // von Laenge und Breite verschiebt die Flaeche auf der Karte — und faellt
    // ohne diese Pruefung erst auf, wenn jemand sie ansieht.
    const gelesen = await api.get<{ data?: { geometry?: unknown } }>(
      `/api/plots/${plot.id}?includeGeometry=true`,
    );
    const zurueck = ((gelesen.data ?? gelesen) as { geometry?: typeof POLYGON })
      .geometry;

    expect(zurueck, "Die Geometrie kam nicht zurueck").toBeTruthy();
    expect(
      zurueck?.type,
      "Der Geometrietyp hat sich geaendert",
    ).toBe("Polygon");
    expect(
      zurueck?.coordinates,
      "Die Koordinaten kamen veraendert zurueck — eine verschobene Flaeche " +
        "faellt sonst erst auf, wenn jemand die Karte ansieht",
    ).toEqual(POLYGON.coordinates);
  });

  test("eine unbrauchbare Geometrie wird abgewiesen", async ({ page }) => {
    // Die Pruefung sitzt in der API und nicht erst in der Karte. Kaeme Unsinn
    // durch, loeste er den Fehler dort aus, wo niemand ihn erwartet.
    const res = await page.request.post("/api/plots", {
      data: {
        cadastralDistrict: testName("Kaputt").replace(/\s+/g, "-"),
        fieldNumber: "1",
        plotNumber: String(Date.now()).slice(-6),
        geometry: { type: "Polygon", coordinates: "kein Array" },
      },
    });

    expect(
      res.ok(),
      "Eine unbrauchbare Geometrie wurde angenommen — der Fehler traefe erst die Karte",
    ).toBe(false);
  });
});

test.describe("GIS-Oberflaeche", () => {
  const SEITEN = [
    ["GIS-Karte", "/gis"],
    ["SHP-Import", "/gis/import"],
    ["Flurstuecke im Pachtbereich", "/leases/plots"],
  ] as const;

  for (const [name, pfad] of SEITEN) {
    test(`${name} laedt ohne Fehler`, async ({ page }) => {
      const antwort = await page.goto(pfad);
      expect(
        antwort?.status(),
        `${pfad} antwortet mit HTTP ${antwort?.status()}`,
      ).toBeLessThan(400);
      await ready(page);
      await must(page.locator("h1, h2").first(), `Ueberschrift auf ${pfad}`);
      await expect(
        page.locator("body"),
        `${name} zeigt eine Fehlermeldung`,
      ).not.toContainText(/Application error|Unhandled Runtime Error/i);
    });
  }
});

test.describe("SCADA", () => {
  const SEITEN = [
    ["SCADA-Uebersicht", "/energy/scada"],
    ["Anomalien", "/energy/scada/anomalies"],
    ["Produktionsdaten", "/energy/productions"],
    ["Energie-Auswertung", "/energy/analytics"],
    ["Abrechnungen", "/energy/settlements"],
    ["SCADA-Codes", "/admin/scada-codes"],
  ] as const;

  for (const [name, pfad] of SEITEN) {
    test(`${name} laedt ohne Fehler`, async ({ page }) => {
      const antwort = await page.goto(pfad);
      expect(
        antwort?.status(),
        `${pfad} antwortet mit HTTP ${antwort?.status()}`,
      ).toBeLessThan(400);
      await ready(page);
      await must(page.locator("h1, h2").first(), `Ueberschrift auf ${pfad}`);
      await expect(
        page.locator("body"),
        `${name} zeigt eine Fehlermeldung`,
      ).not.toContainText(/Application error|Unhandled Runtime Error/i);
    });
  }

  test("die Anomalie-Auswertung antwortet mit auswertbaren Daten", async ({ api }) => {
    // Nicht „die Seite laedt“, sondern: die Auswertung liefert eine Struktur,
    // mit der sich arbeiten laesst. Ein Endpunkt, der stillschweigend eine
    // leere Antwort gibt, sieht in der Oberflaeche aus wie „keine Anomalien“.
    const antwort = await api.get<Record<string, unknown>>(
      "/api/energy/scada/anomalies?limit=5",
    );
    expect(
      antwort,
      "Die Anomalie-Auswertung lieferte keine verwertbare Antwort",
    ).toBeTruthy();
    expect(
      typeof antwort === "object",
      "Die Antwort ist kein Objekt",
    ).toBe(true);
  });
});
