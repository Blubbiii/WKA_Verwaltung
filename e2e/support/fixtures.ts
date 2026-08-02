/**
 * Test-Fixture mit API-Zugriff und automatischem Aufräumen.
 *
 * Erweitert die bestehende `e2e/fixtures.ts` um zwei Dinge:
 *
 *  - `api` — angemeldeter API-Zugriff für Vorbedingungen und Nachprüfung
 *  - Aufräumen NACH JEDEM TEST, auch wenn er gescheitert ist
 *
 * ## Warum nach jedem Test und nicht am Ende
 *
 * Ein Lauf, der in der Mitte abbricht, hinterlässt sonst alles Bisherige.
 * Beim nächsten Lauf steht es im Weg — und irgendwann räumt niemand mehr auf,
 * weil unklar ist, was davon noch gebraucht wird.
 *
 * Playwright führt `use`-Nachbereitung auch nach einem Fehlschlag aus. Das ist
 * genau der Fall, für den es gedacht ist.
 */

import { test as base, expect } from "@playwright/test";
import { WpmApi } from "./api";
import { PREFIX } from "./run-context";

export const test = base.extend<{ api: WpmApi }>({
  // Die Unterdrückung der Einführungstour aus der bestehenden Fixture
  // übernommen — ohne sie fängt deren Überlagerung Klicks ab.
  page: async ({ page }, use) => {
    await page.route("**/api/user/onboarding", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            completedTours: ["main"],
            lastTourVersion: 999,
            skippedAt: "2020-01-01T00:00:00.000Z",
          }),
        });
        return;
      }
      await route.continue();
    });
    await use(page);
  },

  api: async ({ request }, use, testInfo) => {
    const api = new WpmApi(request);
    await use(api);

    const { removed, failed } = await api.cleanup();
    if (removed > 0) {
      testInfo.annotations.push({
        type: "aufgeraeumt",
        description: `${removed} Datensatz/Datensaetze entfernt`,
      });
    }
    if (failed.length > 0) {
      const bericht = failed
        .map((f) => `  ${f.collection}/${f.id} (${f.name}) — ${f.grund ?? "ohne Angabe"}`)
        .join("\n");

      // Kein Fehlschlag des Tests — das Aufraeumen ist nicht sein Gegenstand.
      // Aber sichtbar, sonst sammelt sich still Ballast an.
      testInfo.annotations.push({
        type: "aufraeumen-unvollstaendig",
        description: bericht,
      });

      // Zusaetzlich auf die Konsole. Anmerkungen zeigt der list-Reporter
      // nicht an, und genau dieses Schweigen hat einen Fehler getragen: das
      // Aufraeumen loeschte in der CI monatelang nichts, weil das
      // Praefix-Muster nicht auf die dort gesetzte Kennung passte. Kein Test
      // schlug fehl, kein Bericht sagte etwas — bis ein spaeterer Test ueber
      // die Reste eines frueheren stolperte.
      //
      // Eine Sicherung, die abgeschaltet ist und deren Abschaltung wie
      // normaler Betrieb aussieht, ist schlimmer als keine.
      console.warn(
        `\n[aufraeumen] ${failed.length} Datensatz/Datensaetze blieben liegen ` +
          `(Test: ${testInfo.title}):\n${bericht}\n`,
      );
    }
  },
});

export { expect, PREFIX };
export type { Page, Locator } from "@playwright/test";
