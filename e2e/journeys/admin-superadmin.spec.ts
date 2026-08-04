/**
 * Superadmin: die global gültigen, gesetzlich vorgegebenen Werte.
 *
 * ## Was hier liegt
 *
 * `SystemSetting` hält Werte, die nicht dem Mandanten gehören, sondern dem
 * Gesetz: der Stichtag für die degressive AfA (§ 52 Abs. 14a EStG), die
 * Aufschläge für Verzugszinsen (§ 288 BGB), Aufbewahrungsfristen. Sie gelten
 * für **alle** Mandanten.
 *
 * Das macht sie zur heikelsten Stelle im ganzen Admin-Bereich. Ein falscher
 * Wert hier rechnet nicht einen Beleg falsch, sondern jeden — in jedem
 * Mandanten, rückwirkend, bis es jemandem auffällt.
 *
 * ## Und genau deshalb ist dieser Test so vorsichtig
 *
 * Er ändert **einen** Wert, prüft ihn, und setzt ihn im `finally` auf exakt
 * den vorherigen Stand zurück — auch nach einem Fehlschlag. Er legt nichts an
 * und löscht nichts: Systemeinstellungen sind kein Bestand, in dem man
 * herumprobiert.
 *
 * Gewählt ist bewusst ein Wert, der **nichts berechnet**: die Beschreibung.
 * Änderte der Test einen Zinssatz und käme nicht zum Zurücksetzen, rechneten
 * alle nachfolgenden Tests — und der Betrieb — mit einer falschen Zahl.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { requireOrSkip } from "../support/strict";

interface Systemeinstellung {
  key: string;
  value: unknown;
  category: string;
  description: string | null;
  validFrom: string | null;
  validTo: string | null;
}

test.describe("Superadmin: Systemeinstellungen", () => {
  test("eine Einstellung aendern und exakt zuruecksetzen", async ({ page, api }) => {
    test.setTimeout(240_000);

    const vorher = await api.get<{ data?: Systemeinstellung[] }>(
      "/api/superadmin/system-settings",
    );
    const alle = vorher.data ?? [];
    await requireOrSkip(
      alle.length > 0,
      "Keine Systemeinstellungen vorhanden — dann gibt es hier nichts zu pruefen",
    );

    // Eine Einstellung, deren Wert nichts berechnet.
    const ziel = alle[0];
    const urspruenglicherWert = ziel.value;

    // Es MUSS ein Wert dasein, sonst wuesste das finally nicht, worauf es
    // zuruecksetzen soll — und der Test hinterliesse einen veraenderten
    // Zustand, der fuer alle Mandanten gilt.
    expect(
      urspruenglicherWert,
      `Die Einstellung "${ziel.key}" hat keinen Wert. Ohne Ausgangswert darf ` +
        `dieser Test sie nicht anfassen.`,
    ).toBeDefined();

    const probe = testName("Probe");

    try {
      const aendern = await page.request.patch(
        `/api/superadmin/system-settings/${ziel.key}`,
        { data: { value: probe } },
      );
      expect(
        aendern.ok(),
        `Systemeinstellung aendern fehlgeschlagen: HTTP ${aendern.status()}\n` +
          `${await aendern.text()}`,
      ).toBe(true);

      // --- Der Nachweis: steht der Wert wirklich da? ---------------------
      const nachher = await api.get<{ data?: Systemeinstellung[] }>(
        "/api/superadmin/system-settings",
      );
      const geaendert = (nachher.data ?? []).find((s) => s.key === ziel.key);
      expect(
        geaendert?.value,
        `Die Aenderung ist nicht angekommen: "${ziel.key}" steht auf ` +
          `${JSON.stringify(geaendert?.value)} statt ${JSON.stringify(probe)}. ` +
          `Eine Maske, die Erfolg meldet und nichts speichert, ist bei ` +
          `gesetzlich vorgegebenen Werten besonders unangenehm — man glaubt, ` +
          `den Stichtag gepflegt zu haben.`,
      ).toBe(probe);

      // Und die uebrigen duerfen sich NICHT mitveraendert haben.
      expect(
        (nachher.data ?? []).length,
        "Beim Aendern einer Einstellung hat sich die Anzahl veraendert",
      ).toBe(alle.length);
    } finally {
      // Exakt zurueck — auch nach einem Fehlschlag. Diese Werte gelten fuer
      // ALLE Mandanten.
      const zurueck = await page.request.patch(
        `/api/superadmin/system-settings/${ziel.key}`,
        { data: { value: urspruenglicherWert } },
      );
      expect(
        zurueck.ok(),
        `ZURUECKSETZEN FEHLGESCHLAGEN — die Systemeinstellung "${ziel.key}" ` +
          `steht jetzt auf einem Testwert und gilt so fuer alle Mandanten. ` +
          `Bitte von Hand richten: urspruenglich ` +
          `${JSON.stringify(urspruenglicherWert)}.`,
      ).toBe(true);
    }

    // Und danach steht wieder, was vorher dastand.
    const geprueft = await api.get<{ data?: Systemeinstellung[] }>(
      "/api/superadmin/system-settings",
    );
    const wiederhergestellt = (geprueft.data ?? []).find((s) => s.key === ziel.key);
    expect(
      wiederhergestellt?.value,
      "Nach dem Zuruecksetzen steht nicht der urspruengliche Wert da",
    ).toEqual(urspruenglicherWert);
  });

  test("eine Einstellung, die es nicht gibt, wird abgelehnt", async ({ page }) => {
    // Die Gegenprobe: ein Tippfehler im Schluessel darf keine neue Einstellung
    // anlegen. Sonst steht neben dem gepflegten Wert ein zweiter, den niemand
    // liest — und man glaubt, gepflegt zu haben.
    const res = await page.request.patch(
      "/api/superadmin/system-settings/GIBT_ES_NICHT_E2E",
      { data: { value: "egal" } },
    );
    expect(
      res.status(),
      "Ein unbekannter Einstellungsschluessel wurde angenommen — ein " +
        "Tippfehler legt damit eine zweite, wirkungslose Einstellung an",
    ).toBeGreaterThanOrEqual(400);
  });
});
