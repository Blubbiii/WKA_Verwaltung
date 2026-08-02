/**
 * Ersteinrichtung: die Firmendaten kommen wirklich an.
 *
 * ## Warum dieser Test genau hier ansetzt
 *
 * Der Assistent fragte Steuernummer, USt-IdNr., Bank, IBAN und BIC ab,
 * schickte **kein einziges dieser Felder** mit — und meldete trotzdem
 * „Firmendaten gespeichert".
 *
 * Die Folge war eine Sackgasse ohne Ausweg: § 14 UStG verlangt die eigene
 * Steuernummer, und jeder Rechnungsversand scheiterte mit „Eigene
 * Steuernummer oder USt-IdNr. fehlt" — für eine Angabe, die der Nutzer
 * gemacht und deren Speicherung ihm bestätigt worden war. Kein
 * Rechnungsversand, kein SEPA-Zahllauf, keine Mahnung.
 *
 * Der Fehler war unsichtbar, weil die Erfolgsmeldung erschien. Genau deshalb
 * prüft dieser Test nicht, ob eine Meldung kommt, sondern ob der Wert
 * **danach in der Datenbank steht**.
 *
 * ## Was er nicht tut
 *
 * Er klickt die Ersteinrichtung nicht bis zum Ende durch. Die späteren
 * Schritte legen Park, Gesellschaft und Benutzer an — dafür gibt es eigene
 * Tests, und ein Assistent, der vier andere Dinge nachbaut, prüft am Ende
 * keines davon richtig.
 *
 * ## Und er räumt hinter sich auf
 *
 * Die Stammdaten gehören dem Mandanten. Gelesen wird zuerst, geschrieben
 * danach, und am Ende steht wieder genau der Ausgangszustand — auch nach
 * einem Fehlschlag.
 */

import { test, expect } from "../support/fixtures";
import { must, ready } from "../support/strict";

interface Mandant {
  id: string;
  taxId: string | null;
  vatId: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
}

/** Werte, die sich von allem unterscheiden, was echt sein könnte. */
const PROBE = {
  taxId: "E2E 999/888/77777",
  vatId: "DE999888777",
  bankName: "E2E-Testbank",
};

test.describe("Ersteinrichtung", () => {
  test("Steuernummer und Bankdaten werden wirklich gespeichert", async ({ page }) => {
    test.setTimeout(300_000);

    const stand = await page.request.get("/api/admin/onboarding-status");
    expect(
      stand.ok(),
      `Einrichtungsstand nicht lesbar: HTTP ${stand.status()}\n${await stand.text()}`,
    ).toBe(true);
    const vorher = (await stand.json()).tenant as Mandant;

    try {
      await page.goto("/setup");
      await ready(page);

      // --- Schritt 1: Firmendaten ---------------------------------------
      const steuernummer = page.locator("#taxId");
      await must(steuernummer, "Feld Steuernummer in der Ersteinrichtung");
      await steuernummer.fill(PROBE.taxId);

      await page.locator("#vatId").fill(PROBE.vatId);
      await page.locator("#bankName").fill(PROBE.bankName);

      // Die Anschrift gehoert dazu — § 14 UStG verlangt sie ebenfalls, und
      // ohne sie waere der Test unvollstaendig.
      await page.locator("#onboarding-street").fill("Deichweg");
      await page.locator("#onboarding-postalCode").fill("27476");
      await page.locator("#onboarding-city").fill("Cuxhaven");

      const antwort = page.waitForResponse(
        (r) =>
          r.url().includes("/api/admin/tenants/") &&
          r.request().method() === "PATCH",
        { timeout: 60_000 },
      );

      const speichern = page
        .getByRole("button", { name: /speichern|weiter/i })
        .last();
      await must(speichern, "Schaltflaeche zum Speichern der Firmendaten");
      await speichern.click();

      const res = await antwort;
      expect(
        res.ok(),
        `Speichern fehlgeschlagen: HTTP ${res.status()}\n${await res.text()}`,
      ).toBe(true);

      // --- Der eigentliche Nachweis --------------------------------------
      // Nicht die Erfolgsmeldung. Die erschien auch, als nichts uebertragen
      // wurde — sie war der Grund, warum der Fehler ein halbes Jahr unsichtbar
      // blieb.
      const nachher = (await (
        await page.request.get("/api/admin/onboarding-status")
      ).json()).tenant as Mandant;

      expect(
        nachher.taxId,
        "Die Steuernummer wurde nicht gespeichert. Ohne sie laesst sich KEINE " +
          "Rechnung versenden (§ 14 UStG) — und der Nutzer hat sie eingetragen " +
          "und die Bestaetigung gelesen.",
      ).toBe(PROBE.taxId);

      expect(
        nachher.vatId,
        "Die USt-IdNr. wurde nicht gespeichert — sie geht in XRechnung, " +
          "e-Bilanz und die ZM-Meldung ein.",
      ).toBe(PROBE.vatId);

      expect(nachher.city, "Die Anschrift wurde nicht gespeichert").toBe("Cuxhaven");
    } finally {
      // Exakt zurueck auf das, was vorher dastand — auch nach einem
      // Fehlschlag. Die Stammdaten gehoeren dem Mandanten, nicht dem Testlauf.
      const zurueck = await page.request.patch(`/api/admin/tenants/${vorher.id}`, {
        data: {
          taxId: vorher.taxId ?? "",
          vatId: vorher.vatId ?? "",
          street: vorher.street ?? "",
          postalCode: vorher.postalCode ?? "",
          city: vorher.city ?? "",
        },
      });
      expect(
        zurueck.ok(),
        `ZURUECKSETZEN FEHLGESCHLAGEN — die Mandanten-Stammdaten stehen jetzt ` +
          `auf Testwerten. Bitte von Hand richten.`,
      ).toBe(true);
    }
  });
});
