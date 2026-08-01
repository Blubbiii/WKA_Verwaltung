/**
 * Administration: eine Einstellung ändern, ihre Wirkung prüfen, zurücksetzen.
 *
 * 43 Admin-Seiten, bis heute vier davon je geöffnet und keine Einstellung je
 * geändert. Dabei ist das der Bereich, in dem eine Änderung am weitesten
 * reicht — ein Zahlungsziel wirkt auf jede künftige Rechnung, ein
 * Steuersatz auf jede Berechnung.
 *
 * ## Die Regel für diesen Test: auf den GELESENEN Wert zurücksetzen
 *
 * Nicht auf einen angenommenen Standardwert. Der Unterschied ist der zwischen
 * „aufgeräumt“ und „überschrieben“: stünde das Zahlungsziel des Mandanten auf
 * 14 Tagen und der Test setzte am Ende 30, hätte er eine echte Einstellung
 * zerstört — und niemand merkte es, weil 30 plausibel aussieht.
 *
 * Deshalb liest jeder Test seinen Wert VORHER und schreibt genau diesen
 * zurück. Auch wenn er dazwischen scheitert.
 *
 * ## Was ausgelassen wird
 *
 * Rollen und Rechte. Ein Test, der sich selbst ein Recht entzieht, kann sich
 * unter Umständen nicht mehr zurücksetzen — und sperrt dann das Konto aus,
 * mit dem die ganze Suite läuft. Das gehört gegen eine eigene Instanz, nicht
 * gegen eine laufende.
 */

import { test, expect } from "../support/fixtures";
import { must, ready } from "../support/strict";

interface TenantSettings {
  paymentTermDays: number;
  defaultSkontoPercent: number;
  bankMatchToleranceEur: number;
  [key: string]: unknown;
}

test.describe("Mandanten-Einstellungen", () => {
  test("Zahlungsziel aendern, pruefen und exakt zuruecksetzen", async ({ page }) => {
    test.setTimeout(120_000);

    const gelesen = await page.request.get("/api/admin/tenant-settings");
    expect(
      gelesen.ok(),
      `Einstellungen konnten nicht gelesen werden: HTTP ${gelesen.status()}`,
    ).toBe(true);
    const vorher = (await gelesen.json()) as TenantSettings;

    const original = vorher.paymentTermDays;
    expect(
      typeof original,
      "paymentTermDays fehlt in den Einstellungen",
    ).toBe("number");

    // Ein Wert, der sich vom Bestand unterscheidet — sonst prueft der Test
    // nichts. Bewusst plausibel: 21 Tage ist ein uebliches Zahlungsziel und
    // richtet keinen Schaden an, falls das Zuruecksetzen doch scheitert.
    const neu = original === 21 ? 14 : 21;

    try {
      const put = await page.request.put("/api/admin/tenant-settings", {
        data: { ...vorher, paymentTermDays: neu },
      });
      expect(
        put.ok(),
        `Aendern fehlgeschlagen: HTTP ${put.status()}\n${await put.text()}`,
      ).toBe(true);

      // Die Wirkung — nicht die Erfolgsmeldung.
      const nachher = (await (
        await page.request.get("/api/admin/tenant-settings")
      ).json()) as TenantSettings;
      expect(
        nachher.paymentTermDays,
        "Das geaenderte Zahlungsziel wurde nicht gespeichert",
      ).toBe(neu);
    } finally {
      // Auch nach einem Fehlschlag. Ein Test, der eine Einstellung
      // veraendert zurucklaesst, ist schlimmer als kein Test.
      const zurueck = await page.request.put("/api/admin/tenant-settings", {
        data: { ...vorher, paymentTermDays: original },
      });
      expect(
        zurueck.ok(),
        `ZURUECKSETZEN FEHLGESCHLAGEN — das Zahlungsziel steht jetzt auf ${neu} ` +
          `statt auf ${original}. Bitte von Hand richten.`,
      ).toBe(true);

      const geprueft = (await (
        await page.request.get("/api/admin/tenant-settings")
      ).json()) as TenantSettings;
      expect(
        geprueft.paymentTermDays,
        `Das Zahlungsziel steht nach dem Zuruecksetzen auf ` +
          `${geprueft.paymentTermDays} statt auf ${original}`,
      ).toBe(original);
    }
  });

  test("unsinnige Werte werden abgelehnt", async ({ page }) => {
    // Ein negatives Zahlungsziel hiesse: faellig, bevor die Rechnung
    // geschrieben ist. Kaeme das durch, waeren alle Mahnfristen falsch.
    const vorher = await (await page.request.get("/api/admin/tenant-settings")).json();

    const put = await page.request.put("/api/admin/tenant-settings", {
      data: { ...vorher, paymentTermDays: -5 },
    });

    expect(
      put.ok(),
      "Ein negatives Zahlungsziel wurde angenommen — jede Mahnfrist waere damit falsch",
    ).toBe(false);

    // Gegenprobe: der Bestand ist unveraendert.
    const nachher = await (await page.request.get("/api/admin/tenant-settings")).json();
    expect(
      nachher.paymentTermDays,
      "Der abgelehnte Wert hat den Bestand trotzdem veraendert",
    ).toBe(vorher.paymentTermDays);
  });
});

test.describe("Admin-Bereich erreichbar", () => {
  // Vier von 43 Seiten wurden bisher je geoeffnet. Diese Liste deckt die ab,
  // hinter denen eine Auswertung oder eine Einstellung steht — eine Seite,
  // die 500 liefert, faellt hier auf und nicht erst beim Nutzer.
  const SEITEN = [
    ["Einstellungen", "/admin/settings"],
    ["Rollen & Rechte", "/admin/roles"],
    ["Zugriffsreport", "/admin/access-report"],
    ["Audit-Log", "/admin/audit-logs"],
    ["Kontenrahmen", "/admin/kontenrahmen"],
    ["Steuersaetze", "/admin/tax-rates"],
    // Die Pfade stammen aus src/app/(dashboard)/admin — geraten hatte ich
    // zuerst /admin/dunning-levels und /admin/feature-flags, beide gibt es
    // nicht. Der Test hat das mit HTTP 404 gemeldet, statt es zu uebergehen.
    ["Mahnstufen", "/admin/mahn-stufen"],
    ["E-Mail-Routen", "/admin/email-routes"],
    ["Bankdaten-Freigaben", "/admin/bank-update-requests"],
    ["Systemverwaltung", "/admin/system-admin"],
    ["System-Einstellungen", "/admin/system-settings"],
    ["Monitoring", "/admin/monitoring"],
    ["Mandanten", "/admin/tenants"],
    ["Webhooks", "/admin/webhooks"],
    ["Archiv", "/admin/archive"],
    ["Sicherung", "/admin/backup"],
    ["HGB-Einstellungen", "/admin/hgb-system-settings"],
    ["Fonds-Zugriff", "/admin/fund-access"],
    ["Abrechnungszeitraeume", "/admin/settlement-periods"],
    ["Geplante Berichte", "/admin/scheduled-reports"],
    ["SCADA-Codes", "/admin/scada-codes"],
    ["Stammdaten", "/admin/master-data"],
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
