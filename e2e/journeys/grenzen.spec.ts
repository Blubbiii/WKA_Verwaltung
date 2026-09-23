/**
 * Export und Karte mit Obergrenze — die normalen Aufrufe laufen weiter.
 *
 * Die Unit-Tests prüfen die Grenze selbst. Hier wird geprüft, dass sie im
 * echten Programm nichts bricht: Der Export liefert weiter eine Datei, und die
 * Karte liefert ihre Ebenen samt der neuen Angabe, ob gekürzt wurde.
 */

import { test, expect } from "../support/fixtures";

test.describe("Grenzen für Export und Karte", () => {
  test("der Park-Export liefert weiter eine Excel-Datei", async ({ page }) => {
    const res = await page.request.get("/api/export/parks?format=xlsx", { timeout: 90_000 });
    // Ohne Parks antwortet die Route mit 404 "Keine Daten" — beides ist ein
    // gültiger Ausgang, 422 (Grenze) oder 500 sind es nicht.
    expect([200, 404], `Unerwartete Antwort: HTTP ${res.status()}\n${(await res.text()).slice(0, 200)}`)
      .toContain(res.status());
    if (res.status() === 200) {
      expect(res.headers()["content-type"]).toContain("spreadsheet");
    }
  });

  test("die Karte liefert ihre Ebenen und sagt, ob gekürzt wurde", async ({ page }) => {
    const res = await page.request.get("/api/gis/features", { timeout: 90_000 });
    expect(res.ok(), `HTTP ${res.status()}`).toBe(true);
    const daten = await res.json();
    for (const ebene of ["parks", "turbines", "plots", "annotations"]) {
      expect(Array.isArray(daten[ebene]), `Ebene ${ebene} fehlt`).toBe(true);
    }
    expect(Array.isArray(daten.gekuerzt), "Angabe 'gekuerzt' fehlt").toBe(true);
    expect(typeof daten.grenze).toBe("number");
  });
});
