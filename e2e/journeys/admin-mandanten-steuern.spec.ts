/**
 * Mandanten und Steuersätze — die zwei Admin-Bereiche mit der grössten
 * Reichweite.
 *
 * ## Warum diese zwei zusammen
 *
 * Beide legen Grundlagen fest, auf denen alles andere rechnet. Ein Mandant
 * ist der Rahmen, in dem jeder Datensatz lebt; ein Steuersatz geht in jede
 * Rechnung ein. Ein Fehler dort ist nicht ein falscher Bildschirm, sondern
 * eine falsche Zahl auf einem Beleg.
 *
 * ## Was hier bewusst anders läuft als in den übrigen Tests
 *
 * Diese Tests ändern **globalen Zustand**. Der Rest der Suite legt eigene
 * Parks und Rechnungen an und räumt sie weg; ein Steuersatz dagegen gilt für
 * den ganzen Mandanten und damit für jeden anderen Test, der danach läuft.
 *
 * Deshalb: Es wird **angelegt statt geändert**, wo immer das geht. Ein neuer
 * Steuersatz mit eigenem Gültigkeitszeitraum stört niemanden; ein geänderter
 * Regelsteuersatz verfälscht jede Rechnung, die danach entsteht.
 *
 * Und wo doch geändert wird, steht die Wiederherstellung in einem `finally` —
 * auch nach einem Fehlschlag.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { requireOrSkip } from "../support/strict";

interface Mandant {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
}

interface Steuersatz {
  id: string;
  taxType: string;
  rate: number | string;
  validFrom: string;
  validTo?: string | null;
  label?: string | null;
}

test.describe("Admin: Mandanten", () => {
  test("Mandant anlegen, aendern und wieder entfernen", async ({ page, api }) => {
    test.setTimeout(240_000);

    const name = testName("Mandant");
    // Der Slug muss klein, ohne Leerzeichen und eindeutig sein — er geht in
    // Adressen ein.
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);

    const res = await page.request.post("/api/admin/tenants", {
      data: {
        name,
        slug,
        contactEmail: `${slug}@e2e.invalid`,
        city: "Cuxhaven",
        postalCode: "27476",
      },
    });
    expect(
      res.ok(),
      `Mandant anlegen fehlgeschlagen: HTTP ${res.status()}\n${await res.text()}`,
    ).toBe(true);
    const rumpf = await res.json();
    const mandant = (rumpf.data ?? rumpf) as Mandant;
    api.track({ collection: "admin/tenants", id: mandant.id, name });

    // --- Steht er in der Liste? -------------------------------------------
    const liste = await api.get<{ data?: Mandant[] }>("/api/admin/tenants");
    const gefunden = (liste.data ?? []).find((m) => m.id === mandant.id);
    expect(
      gefunden,
      "Der angelegte Mandant steht nicht in der Mandantenliste",
    ).toBeTruthy();
    expect(
      gefunden!.slug,
      "Der Slug wurde beim Anlegen veraendert — er geht in Adressen ein",
    ).toBe(slug);

    // --- Aendern -----------------------------------------------------------
    const neueStadt = "Bremerhaven";
    const aendern = await page.request.patch(`/api/admin/tenants/${mandant.id}`, {
      data: { city: neueStadt },
    });
    expect(
      aendern.ok(),
      `Mandant aendern fehlgeschlagen: HTTP ${aendern.status()}\n${await aendern.text()}`,
    ).toBe(true);

    const nachher = await api.get<{ data?: Mandant[] }>("/api/admin/tenants");
    const geaendert = (nachher.data ?? []).find((m) => m.id === mandant.id);
    expect(
      geaendert?.city,
      `Die Aenderung ist nicht angekommen: die Stadt steht auf ` +
        `"${geaendert?.city}" statt "${neueStadt}". Eine Maske, die Erfolg ` +
        `meldet und nichts speichert, ist der Fehler, der am laengsten ` +
        `unentdeckt bleibt.`,
    ).toBe(neueStadt);
  });

  test("ein Mandant ohne gueltigen Slug wird abgelehnt", async ({ page }) => {
    // Die Gegenprobe. Der Slug geht in Adressen ein — Grossbuchstaben und
    // Leerzeichen duerfen dort nicht ankommen.
    const res = await page.request.post("/api/admin/tenants", {
      data: { name: testName("Mandant kaputt"), slug: "Nicht Erlaubt!" },
    });
    expect(
      res.status(),
      "Ein Slug mit Leerzeichen und Ausrufezeichen wurde angenommen",
    ).toBeGreaterThanOrEqual(400);
  });
});

test.describe("Admin: Steuersaetze", () => {
  test("Steuersatz anlegen und aendern — der Wert kommt an", async ({ page, api }) => {
    test.setTimeout(240_000);

    const vorher = await api.get<{ data?: Steuersatz[] }>("/api/admin/tax-rates");
    const anzahlVorher = (vorher.data ?? []).length;

    // Eigener Gueltigkeitszeitraum, weit in der Vergangenheit: so stoert der
    // Satz keine Rechnung, die ein anderer Test danach schreibt. Ein
    // geaenderter Regelsteuersatz wuerde genau das tun.
    const satz = 13.5;
    const res = await page.request.post("/api/admin/tax-rates", {
      data: {
        taxType: "REDUCED",
        rate: satz,
        validFrom: "2001-01-01",
        validTo: "2001-12-31",
        label: testName("Pruefsatz"),
      },
    });
    expect(
      res.ok(),
      `Steuersatz anlegen fehlgeschlagen: HTTP ${res.status()}\n${await res.text()}`,
    ).toBe(true);
    const angelegt = (await res.json()) as Steuersatz;
    api.track({
      collection: "admin/tax-rates",
      id: angelegt.id,
      name: testName("Pruefsatz"),
    });

    // --- Der Wert muss exakt ankommen -------------------------------------
    // Steuersaetze sind Dezimalzahlen. Wird 13,5 zu 13 oder zu 1350, faellt
    // das auf keiner Uebersichtsseite auf — aber auf jedem Beleg.
    const nachher = await api.get<{ data?: Steuersatz[] }>("/api/admin/tax-rates");
    expect(
      (nachher.data ?? []).length,
      "Der Steuersatz steht nach dem Anlegen nicht in der Liste",
    ).toBe(anzahlVorher + 1);

    const gelesen = (nachher.data ?? []).find((s) => s.id === angelegt.id);
    expect(gelesen, "Der angelegte Steuersatz ist nicht auffindbar").toBeTruthy();
    expect(
      Number(gelesen!.rate),
      `Der Steuersatz steht auf ${gelesen!.rate} statt ${satz}. Bei einer ` +
        `Dezimalzahl faellt so etwas auf keiner Uebersicht auf — nur auf dem Beleg.`,
    ).toBeCloseTo(satz, 4);

    // --- Aendern -----------------------------------------------------------
    const neuerSatz = 11.25;
    const aendern = await page.request.patch(`/api/admin/tax-rates/${angelegt.id}`, {
      data: { rate: neuerSatz },
    });
    expect(
      aendern.ok(),
      `Steuersatz aendern fehlgeschlagen: HTTP ${aendern.status()}\n` +
        `${await aendern.text()}`,
    ).toBe(true);

    const geaendert = await api.get<{ data?: Steuersatz[] }>("/api/admin/tax-rates");
    const jetzt = (geaendert.data ?? []).find((s) => s.id === angelegt.id);
    expect(
      Number(jetzt!.rate),
      `Die Aenderung ist nicht angekommen: ${jetzt!.rate} statt ${neuerSatz}`,
    ).toBeCloseTo(neuerSatz, 4);
  });

  test("ein Steuersatz ueber 100 Prozent wird abgelehnt", async ({ page }) => {
    // Kein Scherz-Test: eine vertippte Eingabe (1900 statt 19,00) ist der
    // wahrscheinlichste Fehler an dieser Maske, und sie wuerde jede Rechnung
    // danach unbrauchbar machen.
    const res = await page.request.post("/api/admin/tax-rates", {
      data: {
        taxType: "STANDARD",
        rate: 1900,
        validFrom: "2001-01-01",
        label: testName("Unsinn"),
      },
    });
    expect(
      res.status(),
      "Ein Steuersatz von 1900 Prozent wurde angenommen",
    ).toBeGreaterThanOrEqual(400);
  });

  test("die Steuersaetze des Mandanten bleiben unveraendert", async ({ api }) => {
    // Wachhund fuer die uebrigen Tests: die drei Vorgabesaetze (19, 7, 0)
    // muessen stehen bleiben. Verstellt ein Test einen davon und raeumt nicht
    // auf, rechnet jede spaetere Rechnung falsch — und der Fehler saehe aus
    // wie ein Rechenfehler, nicht wie ein liegengebliebener Test.
    const alle = await api.get<{ data?: Steuersatz[] }>("/api/admin/tax-rates");
    const heute = new Date().toISOString().slice(0, 10);

    const aktuell = (alle.data ?? []).filter(
      (s) =>
        s.validFrom.slice(0, 10) <= heute &&
        (!s.validTo || s.validTo.slice(0, 10) >= heute),
    );

    const standard = aktuell.find((s) => s.taxType === "STANDARD");
    await requireOrSkip(
      Boolean(standard),
      "Kein gueltiger Regelsteuersatz erfasst — dann gibt es hier nichts zu wachen",
    );

    expect(
      Number(standard!.rate),
      `Der Regelsteuersatz steht auf ${standard!.rate} statt 19. Entweder hat ` +
        `ein Test ihn verstellt und nicht aufgeraeumt, oder er wurde bewusst ` +
        `geaendert — dann gehoert diese Erwartung nachgezogen.`,
    ).toBeCloseTo(19, 4);
  });
});
