/**
 * Anlagen-Import: die Beispieldatei des Programms muss das Programm passieren.
 *
 * ## Der Rundlauf, um den es geht
 *
 * Der Assistent bietet auf Schritt 1 eine Beispieldatei zum Herunterladen an.
 * Sie wird aus den echten Anlagen des Mandanten erzeugt. Genau diese Datei
 * wird hier zurückgegeben — und muss dann parsen, sich automatisch zuordnen
 * lassen und die Validierung bestehen.
 *
 * Ein Beispiel, das der eigene Import nicht annimmt, ist ein Fehler mit
 * besonders unangenehmer Wirkung: der Nutzer tut genau das, wozu die
 * Oberfläche ihn auffordert, und bekommt einen Fehler. Er hat dann keinen
 * Grund, den Fehler bei sich zu suchen — und keinen Weg, ihn zu umgehen.
 *
 * ## Warum der Import NICHT ausgeführt wird
 *
 * Das ist keine Bequemlichkeit, sondern die Grenze zwischen Prüfen und
 * Anrichten. Die Beispieldatei enthält zwölf Monate Produktionsdaten für die
 * **echten** Anlagen des Mandanten. Sie einzuspielen hiesse, erfundene
 * Erträge in den Bestand zu schreiben, aus dem die Energieabrechnung und die
 * Ausschüttungen gerechnet werden. Kein Aufräumen macht das zuverlässig
 * rückgängig, und die Zahlen sähen plausibel aus — das ist die schlechteste
 * Art von Fehler.
 *
 * Der Assistent trennt das selbst sauber: Schritt 1 → 2 ruft die API mit
 * `action: "validate"`, erst Schritt 2 → 3 mit `action: "import"`. Dieser
 * Test geht bis Schritt 3 (Validierung) und keinen Schritt weiter.
 *
 * Geprüft wird damit alles ausser dem Schreiben: Hochladen, Zerlegen,
 * automatische Spaltenzuordnung, Validierung durch die API.
 */

import { test, expect } from "../support/fixtures";
import { must, ready, requireOrSkip } from "../support/strict";
import { currentStep, stepCount } from "../support/wizard";

test.describe("Anlagen-Import", () => {
  test("die eigene Beispieldatei laeuft bis zur Validierung durch", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // Die Beispieldatei wird aus den Anlagen des Mandanten erzeugt. Gibt es
    // keine, ist das keine Panne, sondern ein leerer Bestand — sichtbar
    // uebersprungen statt stillschweigend gruen.
    const beispiel = await page.request.get(
      "/api/energy/productions/sample-turbine-csv",
    );
    await requireOrSkip(
      beispiel.ok(),
      `Beispieldatei nicht verfuegbar (HTTP ${beispiel.status()}) — ` +
        `der Mandant hat vermutlich keine aktiven Anlagen`,
    );

    const csv = await beispiel.text();
    expect(
      csv.split("\n").length,
      "Die Beispieldatei hat ausser der Kopfzeile keine Zeilen",
    ).toBeGreaterThan(1);
    expect(
      csv,
      "Der Kopfzeile fehlen die Pflichtspalten — dann kann die automatische " +
        "Zuordnung sie auch nicht finden",
    ).toContain("Produktion_kWh");

    await page.goto("/energy/turbine-import");
    await ready(page);

    expect(await stepCount(page), "Der Assistent hat nicht vier Schritte").toBe(4);
    expect(await currentStep(page), "Beim Oeffnen muss Schritt 1 aktiv sein").toBe(0);

    const weiter = page.getByRole("button", { name: /^weiter/i }).first();
    await expect(
      weiter,
      "Weiter muesste ohne hochgeladene Datei gesperrt sein",
    ).toBeDisabled();

    // --- Schritt 1: hochladen -------------------------------------------
    // Das Eingabefeld ist versteckt; bedient wird es sonst ueber die
    // Ablageflaeche. setInputFiles kommt trotzdem daran — und prueft damit
    // denselben Weg, den auch der Dateidialog nimmt.
    const dateifeld = page.locator('input[type="file"]').first();
    await dateifeld.setInputFiles({
      name: "turbinendaten_beispiel.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });

    await expect(
      weiter,
      "Weiter bleibt gesperrt — die hochgeladene Beispieldatei wurde nicht " +
        "zerlegt oder ergab null Zeilen",
    ).toBeEnabled({ timeout: 30_000 });

    await weiter.click();
    await expect
      .poll(() => currentStep(page), { timeout: 15_000 })
      .toBe(1);

    // --- Schritt 2: Zuordnung -------------------------------------------
    // Der Kern dieses Schritts ist die automatische Zuordnung. Erkennt sie
    // die Spalten der eigenen Beispieldatei, ist Weiter sofort frei — ohne
    // dass hier eine einzige Auswahl getroffen wird. Muss der Test von Hand
    // zuordnen, waere die Automatik kaputt und der Test wuerde es verdecken.
    await expect(
      weiter,
      "Die automatische Spaltenzuordnung hat die eigene Beispieldatei nicht " +
        "erkannt — jeder Nutzer muesste hier von Hand zuordnen",
    ).toBeEnabled({ timeout: 20_000 });

    await weiter.click();

    // --- Schritt 3: Validierung -----------------------------------------
    // Ab hier wird nichts mehr geklickt. Der naechste Klick waere der Import.
    await expect
      .poll(() => currentStep(page), {
        message: "Der Wechsel auf die Validierung hat nicht stattgefunden",
        timeout: 20_000,
      })
      .toBe(2);

    await expect(
      page.locator("body"),
      "Die Validierung meldet einen Fehler",
    ).not.toContainText(/Fehler bei der Validierung|Application error/i);

    // Die Validierung muss ein Ergebnis zeigen. Eine leere Ergebnisliste
    // sieht aus wie „nichts zu beanstanden“ — und ist doch das Gegenteil:
    // dann wurde nichts geprueft.
    await must(
      page.getByText(/erfolgreich|gültig|gueltig|warnung|fehler/i).first(),
      "Ergebnis der Validierung",
    );
  });

  test("eine unbrauchbare Datei kommt nicht ueber Schritt 1 hinaus", async ({
    page,
  }) => {
    await page.goto("/energy/turbine-import");
    await ready(page);

    // Eine CSV ohne verwertbaren Inhalt. Kaeme sie durch, waere in Schritt 2
    // nichts zuzuordnen — und der Fehler traefe erst die Validierung.
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "leer.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("nur;eine;kopfzeile\n", "utf-8"),
    });

    await expect(
      page.getByRole("button", { name: /^weiter/i }).first(),
      "Eine Datei ohne Datenzeilen wurde angenommen",
    ).toBeDisabled({ timeout: 20_000 });

    expect(
      await currentStep(page),
      "Der Assistent hat trotz unbrauchbarer Datei weitergeschaltet",
    ).toBe(0);
  });
});
