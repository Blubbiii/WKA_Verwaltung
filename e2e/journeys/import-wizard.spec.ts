/**
 * Import-Assistenten: die Beispieldatei des Programms muss das Programm
 * passieren.
 *
 * Es gibt zwei davon — Netzbetreiber-Daten (`/energy/import`) und
 * Anlagendaten (`/energy/turbine-import`). Sie sind gleich gebaut: vier
 * Schritte, dieselbe Trennung von Validierung und Einspielen, je eine eigene
 * Beispieldatei. Deshalb ein Test über beide statt zweier fast gleicher.
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
 * ## Bis zur Validierung — und warum nicht weiter
 *
 * Beide Assistenten trennen sauber: Schritt 1 → 2 ruft die API mit
 * `action: "validate"`, erst Schritt 2 → 3 mit `action: "import"`. Dieser
 * Test geht bis zur Validierung.
 *
 * Der Grund ist nicht mehr „nicht rückholbar" — die Instanz ist die
 * Testumgebung. Er ist ein anderer: die Beispieldatei wird aus den **echten
 * Anlagen des Mandanten** erzeugt und enthält zwölf Monate erfundener
 * Erträge für genau diese. Sie einzuspielen verfälschte den Bestand, aus dem
 * jede Energieabrechnung und jede Ausschüttung gerechnet wird — und zwar für
 * Anlagen, die andere Tests benutzen. Die Zahlen sähen dabei plausibel aus.
 *
 * Das Einspielen wird deshalb **mit eigenen Anlagen** geprüft, in
 * `import-execute.spec.ts`. Dort gehören die Daten dem Test, und was er
 * anrichtet, betrifft nur ihn.
 *
 * Geprüft wird hier: Hochladen, Zerlegen, automatische Spaltenzuordnung,
 * Validierung durch die API.
 */

import { test, expect } from "../support/fixtures";
import { must, ready, requireOrSkip } from "../support/strict";
import { currentStep, stepCount } from "../support/wizard";

const IMPORTE = [
  {
    name: "Anlagen-Import",
    pfad: "/energy/turbine-import",
    beispiel: "/api/energy/productions/sample-turbine-csv",
  },
  {
    name: "Netzbetreiber-Import",
    pfad: "/energy/import",
    beispiel: "/api/energy/productions/sample-csv",
  },
] as const;

for (const fall of IMPORTE) {
  test.describe(fall.name, () => {
    test("die eigene Beispieldatei laeuft bis zur Validierung durch", async ({
      page,
    }) => {
      test.setTimeout(180_000);

      // Die Beispieldatei wird aus den Anlagen des Mandanten erzeugt. Gibt es
      // keine, ist das keine Panne, sondern ein leerer Bestand — sichtbar
      // uebersprungen statt stillschweigend gruen.
      const beispiel = await page.request.get(fall.beispiel);
      await requireOrSkip(
        beispiel.ok(),
        `Beispieldatei nicht verfuegbar (HTTP ${beispiel.status()}) — ` +
          `der Mandant hat vermutlich keine aktiven Anlagen`,
      );

      const csv = await beispiel.text();
      expect(
        csv.trim().split("\n").length,
        "Die Beispieldatei hat ausser der Kopfzeile keine Zeilen",
      ).toBeGreaterThan(1);
      expect(
        csv,
        "Der Kopfzeile fehlen die Pflichtspalten — dann kann die automatische " +
          "Zuordnung sie auch nicht finden",
      ).toContain("Produktion_kWh");

      await page.goto(fall.pfad);
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
      await page.locator('input[type="file"]').first().setInputFiles({
        name: "beispiel.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv, "utf-8"),
      });

      await expect(
        weiter,
        "Weiter bleibt gesperrt — die hochgeladene Beispieldatei wurde nicht " +
          "zerlegt oder ergab null Zeilen",
      ).toBeEnabled({ timeout: 30_000 });

      await weiter.click();
      await expect.poll(() => currentStep(page), { timeout: 15_000 }).toBe(1);

      // --- Schritt 2: Zuordnung -------------------------------------------
      // Der Kern dieses Schritts ist die automatische Zuordnung. Erkennt sie
      // die Spalten der eigenen Beispieldatei, ist Weiter sofort frei — ohne
      // dass hier eine einzige Auswahl getroffen wird. Muesste der Test von
      // Hand zuordnen, waere die Automatik kaputt und der Test verdeckte es.
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

      // Diese Pruefung hatte ein Loch, und es hat einen echten Fehler
      // durchgelassen: sie akzeptierte das Wort „fehler" als Ergebnis. Eine
      // Fehlerseite erfuellte sie damit genauso wie ein Ergebnis. Beide
      // Import-Assistenten waren wochenlang vollstaendig unbenutzbar — jeder
      // Versuch endete in "Validierungsfehler" — und dieser Test war gruen.
      //
      // Jetzt wird ausdruecklich auf das Ausbleiben eines Fehlers geprueft und
      // getrennt davon auf ein verwertbares Ergebnis.
      await expect(
        page.locator("body"),
        "Die Validierung meldet einen Fehler",
      ).not.toContainText(
        /Validierungsfehler|Fehler bei der Validierung|Application error/i,
        { timeout: 10_000 },
      );

      // Der Ergebnisblock, nicht irgendein Wort: der Assistent zeigt nach der
      // Validierung eine Zeilenuebersicht. Fehlt sie, wurde nichts geprueft —
      // und das saehe aus wie „nichts zu beanstanden".
      await must(
        page.getByText(/Validierungsergebnisse/i).first(),
        "Uebersicht der Validierungsergebnisse",
      );
    });

    test("eine Datei ohne Datenzeilen kommt nicht ueber Schritt 1 hinaus", async ({
      page,
    }) => {
      await page.goto(fall.pfad);
      await ready(page);

      // Eine CSV mit Kopfzeile, aber ohne Inhalt. Kaeme sie durch, waere in
      // Schritt 2 nichts zuzuordnen — und der Fehler traefe erst die
      // Validierung, weit weg von seiner Ursache.
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
}
