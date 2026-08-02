/**
 * SEPA-Zahllauf: vier Schritte bis zum fertigen XML — und hinein geschaut.
 *
 * ## Warum dieser Assistent anders gebaut ist als alle übrigen
 *
 * Er hat keine Komponente mit Zustand, sondern **vier eigene Routen**
 * (`/step-1` … `/step-4`). Der Zustand liegt dazwischen im `localStorage`.
 * Das macht ihn zum fragilsten der Assistenten: jeder Schrittwechsel ist ein
 * Seitenwechsel, und was der Nutzer ausgewählt hat, überlebt nur, weil es
 * jemand ausdrücklich gespiegelt hat.
 *
 * Genau das wird hier geprüft — einmal vorwärts, einmal zurück, und die
 * Auswahl muss noch stehen.
 *
 * ## Warum der Test bis zum Ende geht
 *
 * Schritt 4 hat keinen Bestätigen-Knopf: er sendet **beim Aufrufen**. Der
 * letzte bewusste Klick sitzt in Schritt 3. Dabei entsteht ein Zahllauf mit
 * einer Nummer aus dem Nummernkreis und dem fertigen XML.
 *
 * Ich hatte zunächst vor Schritt 4 aufgehört — wegen der gezogenen Nummer.
 * Das war hier die falsche Vorsicht: diese Instanz ist die Testumgebung, und
 * vor dem Echtbetrieb wird ohnehin zurückgesetzt. Und der wertvollste Teil
 * liegt genau dahinter: **ob im XML steht, was drinstehen muss.** Eine
 * Zahlungsdatei, die falsche Beträge oder die falsche IBAN trägt, fällt sonst
 * erst der Bank auf.
 *
 * ## Was geprüft wird
 *
 * Zwei Rechnungen mit **ungleichen** Beträgen — 1.234,56 € und 2.345,67 €.
 * Ungleich und krumm ist Absicht: bei zwei gleichen runden Beträgen wäre eine
 * vertauschte Zuordnung oder ein doppelt gezählter Posten nicht zu erkennen.
 *
 *  - Die Summe in Schritt 1 entspricht der Summe beider Rechnungen.
 *  - Die Auswahl überlebt den Schrittwechsel.
 *  - Der Zahllauf enthält genau zwei Posten und dieselbe Summe.
 *  - Das XML enthält die IBAN des Auftraggebers, die Gesamtsumme und **beide
 *    Einzelbeträge**.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { must, ready } from "../support/strict";
import { testIban } from "../support/iban";

/** Krumm und ungleich — damit eine Verwechslung auffällt. */
const BETRAEGE = [1234.56, 2345.67];
const SUMME = BETRAEGE.reduce((a, b) => a + b, 0);

/**
 * IBAN des Auftraggebers — je Lauf eine andere.
 *
 * Vorher stand hier eine feste. Beim zweiten Lauf gegen dieselbe Datenbank
 * scheiterte der Test mit HTTP 409: das Bankkonto gab es schon. Ein Test, der
 * nur beim ersten Mal läuft, ist keiner.
 */
const IBAN = testIban();

/** IBAN des Zahlungsempfängers. Ohne sie weist der Zahllauf ab — zu Recht. */
const EMPFAENGER_IBAN = testIban(Date.now() + 1);

interface Vorbedingung {
  kontoId: string;
  rechnungen: { id: string; nummer: string; betrag: number }[];
  /** Stellt die Mandanten-Stammdaten wieder her, wie sie vorher waren. */
  zuruecksetzen: () => Promise<void>;
}

/**
 * Stellt sicher, dass der Mandant § 14 UStG genügt — und merkt sich, was
 * vorher dastand.
 *
 * Ohne eigene Steuernummer und vollständige Anschrift lässt sich **keine**
 * Rechnung versenden, und ohne versendete Rechnung gibt es nichts zu zahlen.
 * Der Test kann diese Vorbedingung nicht umgehen, also stellt er sie her.
 *
 * Ergänzt wird nur, was fehlt, und am Ende steht wieder der Ausgangszustand —
 * dieselbe Regel wie in `admin-settings.spec.ts`: auf den GELESENEN Wert
 * zurücksetzen, nicht auf einen angenommenen.
 */
async function mandantVersandfaehig(
  page: import("@playwright/test").Page,
): Promise<() => Promise<void>> {
  const stand = await page.request.get("/api/admin/onboarding-status");
  expect(
    stand.ok(),
    `Mandantendaten nicht lesbar: HTTP ${stand.status()}\n${await stand.text()}`,
  ).toBe(true);
  const mandant = (await stand.json()).tenant as {
    id: string;
    taxId: string | null;
    street: string | null;
    postalCode: string | null;
    city: string | null;
  };

  const ergaenzt: Record<string, string> = {};
  if (!mandant.taxId?.trim()) ergaenzt.taxId = "E2E 123/456/78901";
  if (!mandant.street?.trim()) ergaenzt.street = "Deichweg";
  if (!mandant.postalCode?.trim()) ergaenzt.postalCode = "27476";
  if (!mandant.city?.trim()) ergaenzt.city = "Cuxhaven";

  if (Object.keys(ergaenzt).length === 0) {
    return async () => {};
  }

  const gesetzt = await page.request.patch(`/api/admin/tenants/${mandant.id}`, {
    data: ergaenzt,
  });
  expect(
    gesetzt.ok(),
    `Mandanten-Stammdaten liessen sich nicht ergaenzen: HTTP ${gesetzt.status()}\n` +
      `${await gesetzt.text()}\n\nOhne Steuernummer und Anschrift laesst sich ` +
      `keine Rechnung versenden (§ 14 UStG).`,
  ).toBe(true);

  return async () => {
    // Exakt zurueck auf den gelesenen Zustand — auch die leeren Werte.
    const zurueck: Record<string, string> = {};
    for (const feld of Object.keys(ergaenzt)) zurueck[feld] = "";
    await page.request.patch(`/api/admin/tenants/${mandant.id}`, { data: zurueck });
  };
}

async function kontoUndRechnungen(
  page: import("@playwright/test").Page,
  api: import("../support/api").WpmApi,
): Promise<Vorbedingung> {
  const zuruecksetzen = await mandantVersandfaehig(page);

  const kontoName = testName("Bankkonto");
  const kontoRes = await page.request.post("/api/buchhaltung/bank/accounts", {
    data: {
      name: kontoName,
      iban: IBAN,
      bic: "BYLADEM1001",
      bankName: "E2E-Testbank",
      currency: "EUR",
      currentBalance: 100_000,
    },
  });
  expect(
    kontoRes.ok(),
    `Bankkonto anlegen fehlgeschlagen: HTTP ${kontoRes.status()}\n${await kontoRes.text()}`,
  ).toBe(true);
  const kontoRumpf = await kontoRes.json();
  const konto = kontoRumpf.data ?? kontoRumpf;
  api.track({
    collection: "buchhaltung/bank/accounts",
    id: konto.id,
    name: kontoName,
  });

  const heuteInBerlin = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const rechnungen: Vorbedingung["rechnungen"] = [];

  for (const betrag of BETRAEGE) {
    const empfaenger = testName("Zahlungsempfaenger").replace(/\s+/g, "-");

    // Der Zahllauf zieht die Empfaenger-IBAN aus der verknuepften PERSON,
    // nicht aus der Rechnung. Ohne sie bricht er ab mit "Fuer N Rechnung(en)
    // fehlt eine gueltige Creditor-IBAN" — richtig so: ohne Kontonummer laesst
    // sich niemand bezahlen. Meine erste Fassung setzte nur einen Namen.
    const person = await api.create(
      "persons",
      {
        personType: "natural",
        firstName: "E2E",
        lastName: empfaenger,
        city: "Cuxhaven",
        bankIban: EMPFAENGER_IBAN,
        bankBic: "BYLADEM1001",
      },
      "lastName",
    );
    expect(person.id, "Zahlungsempfaenger konnte nicht angelegt werden").toBeTruthy();

    const res = await page.request.post("/api/invoices", {
      data: {
        invoiceType: "INVOICE",
        invoiceDate: heuteInBerlin,
        recipientName: empfaenger,
        recipientPersonId: person.id,
        recipientAddress: "Teststrasse 1\n27476 Cuxhaven",
        // § 14 UStG verlangt das Leistungsdatum. Fehlt es, verweigert /send
        // den Uebergang auf "versendet" — zu Recht.
        serviceStartDate: heuteInBerlin,
        items: [
          {
            description: testName("Position"),
            quantity: 1,
            unitPrice: betrag,
            taxType: "EXEMPT",
          },
        ],
      },
    });
    expect(
      res.ok(),
      `Rechnung anlegen fehlgeschlagen: HTTP ${res.status()}\n${await res.text()}`,
    ).toBe(true);
    const rumpf = await res.json();
    const rechnung = rumpf.data ?? rumpf;
    api.track({ collection: "invoices", id: rechnung.id, name: empfaenger });

    // Der Assistent listet nur Rechnungen im Status SENT. Der Uebergang
    // DRAFT -> SENT laeuft ueber /send und prueft dabei die Pflichtangaben
    // nach § 14 UStG — ein direktes Setzen des Status gibt es bewusst nicht.
    const senden = await page.request.post(`/api/invoices/${rechnung.id}/send`);
    expect(
      senden.ok(),
      `Rechnung konnte nicht auf "versendet" gesetzt werden: ` +
        `HTTP ${senden.status()}\n${await senden.text()}`,
    ).toBe(true);

    rechnungen.push({
      id: rechnung.id,
      nummer: String(rechnung.invoiceNumber ?? ""),
      betrag,
    });
  }

  return { kontoId: konto.id, rechnungen, zuruecksetzen };
}

test.describe("SEPA-Zahllauf", () => {
  test("vier Schritte bis zum XML — und das XML stimmt", async ({ page, api }) => {
    test.setTimeout(300_000);

    const { kontoId, rechnungen, zuruecksetzen } = await kontoUndRechnungen(
      page,
      api,
    );

    // --- Schritt 1: Rechnungen waehlen -----------------------------------
    await page.goto("/buchhaltung/sepa/new/step-1");
    await ready(page);
    await expect(page, "Der Einstieg leitet nicht auf Schritt 1").toHaveURL(/step-1/);

    const weiter = page.getByRole("button", { name: /weiter/i }).first();
    await expect(
      weiter,
      "Weiter muesste ohne ausgewaehlte Rechnung gesperrt sein",
    ).toBeDisabled();

    for (const rechnung of rechnungen) {
      const kaestchen = page.getByRole("checkbox", { name: rechnung.nummer });
      await must(kaestchen, `Auswahlkaestchen fuer Rechnung ${rechnung.nummer}`);
      await kaestchen.check();
    }

    // Die Summe unter der Liste ist die Zahl, auf die der Nutzer schaut,
    // bevor er weitergeht. Stimmt sie nicht, faellt es spaetestens der Bank
    // auf — dann aber mit echtem Geld.
    const summeFormatiert = SUMME.toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    await expect(
      page.locator("body"),
      `Die Summe der Auswahl (${summeFormatiert} €) steht nicht in der Fusszeile`,
    ).toContainText(summeFormatiert, { timeout: 10_000 });

    await expect(weiter, "Weiter bleibt trotz Auswahl gesperrt").toBeEnabled();
    await weiter.click();
    await expect(page, "Kein Wechsel auf Schritt 2").toHaveURL(/step-2/, {
      timeout: 15_000,
    });

    // --- Der Zustand ueberlebt den Schrittwechsel ------------------------
    // Der eigentliche Schwachpunkt dieser Bauart: jeder Schritt ist eine
    // eigene Seite, die Auswahl liegt im localStorage. Geht sie beim
    // Zurueckgehen verloren, faengt der Nutzer von vorn an — und merkt es
    // vielleicht erst, wenn die Summe im letzten Schritt nicht stimmt.
    await page.goBack();
    await expect(page, "Zurueck fuehrt nicht auf Schritt 1").toHaveURL(/step-1/, {
      timeout: 15_000,
    });
    await ready(page);

    for (const rechnung of rechnungen) {
      await expect(
        page.getByRole("checkbox", { name: rechnung.nummer }),
        `Nach dem Zurueckgehen ist die Auswahl von ${rechnung.nummer} verloren`,
      ).toBeChecked({ timeout: 10_000 });
    }

    await page.getByRole("button", { name: /weiter/i }).first().click();
    await expect(page).toHaveURL(/step-2/, { timeout: 15_000 });
    await ready(page);

    // --- Schritt 2: Konto und Ausfuehrungsdatum --------------------------
    const konto = page.locator(`#acc-${kontoId}`);
    await must(konto, "Auswahl des Bankkontos");
    await konto.click();

    const datum = page.locator("#executionDate");
    await must(datum, "Feld fuer das Ausfuehrungsdatum");

    const weiter2 = page.getByRole("button", { name: /weiter/i }).first();
    await expect(
      weiter2,
      "Weiter bleibt gesperrt, obwohl ein Konto gewaehlt wurde",
    ).toBeEnabled({ timeout: 10_000 });
    await weiter2.click();
    await expect(page, "Kein Wechsel auf Schritt 3").toHaveURL(/step-3/, {
      timeout: 15_000,
    });
    await ready(page);

    // --- Schritt 3: Pruefen ----------------------------------------------
    for (const rechnung of rechnungen) {
      await expect(
        page.locator("body"),
        `Die Rechnung ${rechnung.nummer} fehlt in der Pruefansicht`,
      ).toContainText(rechnung.nummer, { timeout: 10_000 });
    }
    await expect(
      page.locator("body"),
      `Die Gesamtsumme ${summeFormatiert} € fehlt in der Pruefansicht`,
    ).toContainText(summeFormatiert);

    // --- Schritt 3 → 4: hier entsteht der Zahllauf -----------------------
    // Schritt 4 sendet beim Aufrufen, es gibt dort keinen Knopf mehr. Der
    // Klick hier ist die eigentliche Auslösung.
    const absenden = page.waitForResponse(
      (r) =>
        r.url().includes("/api/buchhaltung/sepa") &&
        r.request().method() === "POST",
      { timeout: 60_000 },
    );

    await page.getByRole("button", { name: /bestätigen|bestaetigen/i }).first().click();

    const antwort = await absenden;
    expect(
      antwort.ok(),
      `Der Zahllauf wurde abgewiesen: HTTP ${antwort.status()}\n` +
        `${await antwort.text()}`,
    ).toBe(true);

    const ergebnis = await antwort.json();
    const lauf = ergebnis.data ?? ergebnis;
    expect(lauf.batchNumber, "Der Zahllauf hat keine Nummer bekommen").toBeTruthy();
    api.track({
      collection: "buchhaltung/sepa",
      id: lauf.id,
      name: testName("Zahllauf"),
    });

    // --- Das XML: steht drin, was drinstehen muss? -----------------------
    const xml: string = lauf.xmlContent ?? "";
    expect(
      xml.length,
      "Der Zahllauf enthaelt kein XML — die Datei waere leer",
    ).toBeGreaterThan(100);

    expect(
      xml,
      "Die IBAN des Auftraggebers steht nicht im XML — die Bank wuesste nicht, " +
        "von welchem Konto abgebucht werden soll",
    ).toContain(IBAN);

    // Betraege stehen im XML mit Punkt als Dezimaltrenner (ISO 20022).
    for (const rechnung of rechnungen) {
      expect(
        xml,
        `Der Betrag ${rechnung.betrag} der Rechnung ${rechnung.nummer} steht ` +
          `nicht im XML. Genau deshalb sind die Betraege ungleich und krumm ` +
          `gewaehlt: ein vertauschter oder doppelter Posten faellt sonst nicht auf.`,
      ).toContain(rechnung.betrag.toFixed(2));
    }

    expect(
      xml,
      `Die Gesamtsumme ${SUMME.toFixed(2)} steht nicht im XML`,
    ).toContain(SUMME.toFixed(2));

    // --- Und der Zahllauf in der Datenbank -------------------------------
    const gelesen = await api.get<{
      data?: { items?: unknown[]; totalAmount?: unknown };
      items?: unknown[];
      totalAmount?: unknown;
    }>(`/api/buchhaltung/sepa/${lauf.id}`);
    const daten = (gelesen.data ?? gelesen) as {
      items?: unknown[];
      totalAmount?: unknown;
    };

    expect(
      daten.items?.length,
      `Der Zahllauf enthaelt ${daten.items?.length} Posten statt ${rechnungen.length}`,
    ).toBe(rechnungen.length);
    expect(
      Number(daten.totalAmount),
      `Die Summe des Zahllaufs betraegt ${daten.totalAmount} statt ${SUMME}`,
    ).toBeCloseTo(SUMME, 2);

    // --- Und die Oberflaeche zeigt das Ergebnis --------------------------
    await expect(page, "Kein Wechsel auf Schritt 4").toHaveURL(/step-4/, {
      timeout: 30_000,
    });
    await expect(
      page.locator("body"),
      "Die Nummer des Zahllaufs steht nicht auf der Abschlussseite",
    ).toContainText(String(lauf.batchNumber), { timeout: 30_000 });

    // Die Stammdaten gehoeren dem Mandanten, nicht dem Testlauf.
    await zuruecksetzen();
  });

  test("ohne Auswahl kommt man nicht aus Schritt 1", async ({ page }) => {
    await page.goto("/buchhaltung/sepa/new/step-1");
    await ready(page);

    await expect(
      page.getByRole("button", { name: /weiter/i }).first(),
      "Weiter ist ohne ausgewaehlte Rechnung frei — der Zahllauf waere leer",
    ).toBeDisabled();
  });

  test("Schritt 2 direkt aufzurufen fuehrt zurueck zum Anfang", async ({ page }) => {
    // Die Bauart mit eigenen Routen laedt dazu ein, mitten hinein zu
    // springen — ueber ein Lesezeichen oder den Verlauf. Ohne Absicherung
    // stuende man vor einer Maske ohne Daten und koennte einen Zahllauf ueber
    // nichts anstossen.
    await page.goto("/buchhaltung/sepa/new/step-3");

    await expect(
      page,
      "Schritt 3 laesst sich ohne Auswahl direkt aufrufen",
    ).toHaveURL(/step-1/, { timeout: 15_000 });
  });
});
