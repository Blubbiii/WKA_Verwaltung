/**
 * Belegexport für den Steuerberater — einmal durch die echte Oberfläche.
 *
 * Die Unit-Tests prüfen, was im ZIP steht. Hier wird geprüft, was sie nicht
 * sehen: dass die Seite ihre Texte findet, dass der Knopf den Export
 * tatsächlich auslöst, dass eine Datei mit dem richtigen Namen ankommt — und
 * dass ein leerer Zeitraum als verständliche Meldung endet, nicht als stiller
 * Fehlschlag.
 */

import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import type { Page } from "@playwright/test";
import { must, ready } from "../support/strict";

/** Heute als Kalendertag in deutscher Zeit — so filtert auch der Export. */
function heuteInBerlin(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Beide Felder setzen und erst weitergehen, wenn beide Werte stehen.
 *
 * Aufgefallen beim ersten Lauf: Das erste Feld wurde ausgefüllt, bevor React
 * die Seite übernommen hatte — die Übernahme setzte es auf den Vorgabewert
 * zurück, das zweite blieb. Die Anfrage ging dann mit einem Zeitraum hinaus,
 * den niemand eingegeben hat. Deshalb wird der Zustand beider Felder
 * gemeinsam geprüft und das Ganze bei Bedarf wiederholt.
 */
async function zeitraumSetzen(page: Page, von: string, bis: string): Promise<void> {
  const vonFeld = page.getByLabel("Von");
  const bisFeld = page.getByLabel("Bis");
  await expect(async () => {
    await vonFeld.fill(von);
    await bisFeld.fill(bis);
    await expect(vonFeld).toHaveValue(von, { timeout: 1_000 });
    await expect(bisFeld).toHaveValue(bis, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

test.describe("Belegexport", () => {
  test("eine versendete Rechnung landet als PDF und im Verzeichnis im ZIP", async ({
    page,
    api,
  }) => {
    test.setTimeout(180_000);
    const tag = heuteInBerlin();
    const empfaenger = testName("Belegexport");

    // Anlegen und versenden: Entwürfe lässt der Export bewusst weg.
    const angelegt = await page.request.post("/api/invoices", {
      data: {
        invoiceType: "INVOICE",
        invoiceDate: tag,
        // Pflichtangabe nach § 14 UStG — ohne sie lehnt das Versenden ab.
        serviceStartDate: tag,
        serviceEndDate: tag,
        recipientName: empfaenger,
        recipientAddress: "Teststrasse 1\n12345 Teststadt",
        items: [{ description: testName("Position"), quantity: 1, unitPrice: 500, taxType: "STANDARD" }],
      },
    });
    expect(
      angelegt.ok(),
      `Rechnung anlegen fehlgeschlagen: HTTP ${angelegt.status()}\n${await angelegt.text()}`,
    ).toBe(true);
    const neu = (await angelegt.json()) as { id: string };
    api.track({ collection: "invoices", id: neu.id, name: empfaenger });

    const versendet = await page.request.post(`/api/invoices/${neu.id}/send`);
    expect(
      versendet.ok(),
      `Versenden fehlgeschlagen: HTTP ${versendet.status()}\n${(await versendet.text()).slice(0, 200)}`,
    ).toBe(true);

    // Die Nummer erst nach dem Versenden lesen — sie könnte dabei vergeben werden.
    const geladen = await page.request.get(`/api/invoices/${neu.id}`);
    const rumpf = await geladen.json();
    const rechnung = (rumpf.data ?? rumpf) as { id: string; invoiceNumber: string };
    expect(rechnung.invoiceNumber, "Die versendete Rechnung hat keine Nummer").toBeTruthy();

    await page.goto("/invoices/beleg-export");
    await ready(page);

    // Übersetzte Texte statt nackter Schlüssel — ein fehlender Namensraum
    // zeigte hier „belegExport.title".
    await must(page.getByRole("heading", { name: "Belegexport" }), "Überschrift der Seite");
    await must(page.getByText("Zeitraum wählen"), "Kartentitel");

    await zeitraumSetzen(page, tag, tag);

    const download = page.waitForEvent("download", { timeout: 120_000 });
    await page.getByRole("button", { name: "Belege exportieren" }).click();
    const datei = await download;

    expect(datei.suggestedFilename()).toBe(`Belege_${tag}_bis_${tag}.zip`);

    const pfad = await datei.path();
    const zip = await JSZip.loadAsync(await readFile(pfad));
    const verzeichnis = zip.file("Rechnungsausgang.csv");
    expect(verzeichnis, "Das Verzeichnis fehlt im ZIP").not.toBeNull();
    const csv = await verzeichnis!.async("string");
    expect(csv, "Die versendete Rechnung fehlt im Verzeichnis").toContain(rechnung.invoiceNumber);

    const pdfs = Object.keys(zip.files).filter((f) => f.startsWith("Belege/") && f.endsWith(".pdf"));
    expect(pdfs.length, "Kein einziges PDF im ZIP").toBeGreaterThan(0);
  });

  test("ein Zeitraum ohne Belege endet mit einer verständlichen Meldung", async ({ page }) => {
    await page.goto("/invoices/beleg-export");
    await ready(page);

    // Weit genug zurück, dass es sicher keine Rechnung gibt.
    await zeitraumSetzen(page, "2001-01-01", "2001-01-31");
    await page.getByRole("button", { name: "Belege exportieren" }).click();

    await must(
      page.getByText(/keine versendeten Rechnungen/),
      "Hinweis, dass der Zeitraum leer ist",
      20_000,
    );
    // Der Knopf muss danach wieder bedienbar sein.
    await expect(page.getByRole("button", { name: "Belege exportieren" })).toBeEnabled();
  });
});
