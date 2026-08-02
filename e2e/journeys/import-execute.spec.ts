/**
 * Anlagen-Import wirklich ausführen — mit eigenen Anlagen.
 *
 * ## Warum getrennt von `import-wizard.spec.ts`
 *
 * Jener Test lädt die **Beispieldatei des Programms** hoch. Die wird aus den
 * echten Anlagen des Mandanten erzeugt und enthält zwölf Monate erfundener
 * Erträge für genau diese. Sie einzuspielen verfälschte den Bestand, aus dem
 * jede Energieabrechnung und jede Ausschüttung gerechnet wird — und zwar für
 * Anlagen, die andere Tests benutzen.
 *
 * Hier legt der Test seine eigenen Anlagen an und spielt eine selbst gebaute
 * Datei ein. Was er anrichtet, betrifft nur ihn.
 *
 * ## Was geprüft wird
 *
 * Nicht „der Import meldet Erfolg", sondern: **stehen danach die richtigen
 * Zahlen in der Datenbank.** Drei Monate, drei verschiedene Werte, und jeder
 * einzeln nachgelesen.
 *
 * Verschiedene Werte sind Absicht. Bei dreimal derselben Zahl wären ein
 * vertauschter Monat, ein doppelt gezählter Datensatz und eine korrekte
 * Zuordnung nicht voneinander zu unterscheiden.
 *
 * ## Und die Gegenprobe
 *
 * Eine Zeile mit einer unbekannten Anlagennummer darf **nicht** stillschweigend
 * verschwinden. Sie muss als Fehler auftauchen — sonst importiert jemand eine
 * Datei mit einem Tippfehler in der Anlagenbezeichnung, bekommt „Import
 * erfolgreich" und wundert sich Monate später über eine fehlende Anlage in
 * der Abrechnung.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { must, ready } from "../support/strict";
import { currentStep } from "../support/wizard";

/** Drei Monate, drei verschiedene Werte — eine Verwechslung soll auffallen. */
const MONATE = [
  { monat: 1, kwh: 111_000 },
  { monat: 2, kwh: 222_000 },
  { monat: 3, kwh: 333_000 },
];
const JAHR = 2023;

test.describe("Anlagen-Import ausfuehren", () => {
  test("Datei einspielen — und die Zahlen stehen danach richtig da", async ({
    page,
    api,
  }) => {
    test.setTimeout(300_000);

    // --- Eigene Anlage ----------------------------------------------------
    const parkName = testName("Park Import");
    const park = await api.create("parks", {
      name: parkName,
      status: "ACTIVE",
      commissioningDate: "2019-06-15",
    });

    const bezeichnung = `${testName("WEA Import").replace(/\s+/g, "-")}`;
    const anlageRes = await page.request.post("/api/turbines", {
      data: {
        parkId: park.id,
        designation: bezeichnung,
        deviceType: "WEA",
        status: "ACTIVE",
        ratedPowerKw: 3000,
        commissioningDate: "2019-06-15",
      },
    });
    expect(
      anlageRes.ok(),
      `Anlage anlegen fehlgeschlagen: ${await anlageRes.text()}`,
    ).toBe(true);
    const anlage = (await anlageRes.json()).data ?? (await anlageRes.json());
    api.track({ collection: "turbines", id: anlage.id, name: bezeichnung });

    // --- Datei bauen ------------------------------------------------------
    // Dieselbe Kopfzeile wie die Beispieldatei des Programms — sonst pruefte
    // der Test ein Format, das die Anwendung gar nicht anbietet.
    const zeilen = [
      "WKA-Nr;Anlage;Jahr;Monat;Produktion_kWh;Betriebsstunden;Verfügbarkeit_Pct;Bemerkungen",
      ...MONATE.map(
        (m) => `${bezeichnung};${bezeichnung};${JAHR};${m.monat};${m.kwh};700;98,5;`,
      ),
    ];
    const csv = `${zeilen.join("\n")}\n`;

    // --- Assistent durchlaufen -------------------------------------------
    await page.goto("/energy/turbine-import");
    await ready(page);

    await page.locator('input[type="file"]').first().setInputFiles({
      name: "eigene-anlagen.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });

    const weiter = () => page.getByRole("button", { name: /^weiter/i }).first();
    await expect(
      weiter(),
      "Die selbst gebaute Datei wurde nicht zerlegt",
    ).toBeEnabled({ timeout: 30_000 });
    await weiter().click();
    await expect.poll(() => currentStep(page), { timeout: 15_000 }).toBe(1);

    await expect(
      weiter(),
      "Die automatische Spaltenzuordnung hat die Kopfzeile nicht erkannt",
    ).toBeEnabled({ timeout: 20_000 });
    await weiter().click();
    await expect.poll(() => currentStep(page), { timeout: 20_000 }).toBe(2);

    // --- Und jetzt wirklich einspielen ------------------------------------
    const einspielen = page.waitForResponse(
      (r) =>
        r.url().includes("/api/energy/productions/import") &&
        r.request().method() === "POST" &&
        r.request().postData()?.includes('"import"') === true,
      { timeout: 60_000 },
    );

    const importieren = page
      .getByRole("button", { name: /import starten|importieren/i })
      .first();
    await must(importieren, "Schaltflaeche zum Einspielen");
    await importieren.click();

    const antwort = await einspielen;
    expect(
      antwort.ok(),
      `Der Import wurde abgewiesen: HTTP ${antwort.status()}\n${await antwort.text()}`,
    ).toBe(true);

    // --- Der Nachweis: stehen die Zahlen da? ------------------------------
    // Nicht die Erfolgsmeldung. Ein Import, der nichts geschrieben hat, meldet
    // genauso „erfolgreich".
    for (const m of MONATE) {
      await expect
        .poll(
          async () => {
            const daten = await api.get<{ data?: { productionKwh?: unknown }[] }>(
              `/api/energy/productions?turbineId=${anlage.id}` +
                `&year=${JAHR}&month=${m.monat}`,
            );
            const zeile = (daten.data ?? [])[0];
            return zeile ? Number(zeile.productionKwh) : null;
          },
          {
            message:
              `Fuer Monat ${m.monat}/${JAHR} steht nach dem Import kein Wert in ` +
              `der Datenbank — der Import meldete trotzdem Erfolg.`,
            timeout: 30_000,
          },
        )
        .toBe(m.kwh);
    }

    // Aufraeumen: die eingespielten Produktionsdaten gehoeren zum Test.
    const alle = await api.get<{ data?: { id: string }[] }>(
      `/api/energy/productions?turbineId=${anlage.id}&limit=100`,
    );
    for (const zeile of alle.data ?? []) {
      await page.request.delete(`/api/energy/productions/${zeile.id}`);
    }
  });

  test("eine unbekannte Anlage verschwindet nicht stillschweigend", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // Der Fall, der im Alltag passiert: ein Tippfehler in der
    // Anlagenbezeichnung. Wuerde die Zeile still uebergangen, meldete der
    // Import „erfolgreich", und die fehlende Anlage fiele erst Monate spaeter
    // in der Abrechnung auf — wenn ueberhaupt.
    const unbekannt = testName("WEA gibt es nicht").replace(/\s+/g, "-");
    const csv =
      "WKA-Nr;Anlage;Jahr;Monat;Produktion_kWh;Betriebsstunden;Verfügbarkeit_Pct;Bemerkungen\n" +
      `${unbekannt};${unbekannt};${JAHR};1;100000;700;98,5;\n`;

    await page.goto("/energy/turbine-import");
    await ready(page);

    await page.locator('input[type="file"]').first().setInputFiles({
      name: "unbekannt.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });

    const weiter = () => page.getByRole("button", { name: /^weiter/i }).first();
    await expect(weiter()).toBeEnabled({ timeout: 30_000 });
    await weiter().click();
    await expect.poll(() => currentStep(page), { timeout: 15_000 }).toBe(1);
    await expect(weiter()).toBeEnabled({ timeout: 20_000 });
    await weiter().click();
    await expect.poll(() => currentStep(page), { timeout: 20_000 }).toBe(2);

    // Die Validierung muss die Zeile beanstanden — sichtbar, nicht im Protokoll.
    await expect(
      page.locator("body"),
      `Die unbekannte Anlage „${unbekannt}“ wurde nicht beanstandet. Ein ` +
        `Tippfehler in der Bezeichnung wuerde damit still verschluckt.`,
    ).toContainText(/nicht gefunden|unbekannt|fehler/i, { timeout: 20_000 });
  });
});
