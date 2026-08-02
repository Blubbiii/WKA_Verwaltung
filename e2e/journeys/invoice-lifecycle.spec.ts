/**
 * Rechnung: anlegen, prüfen, stornieren, löschen.
 *
 * Die heikelste Kette im System, weil hier gerechnet wird. Die alte Suite
 * öffnet die Liste und eine Detailseite — geprüft wird, dass die Seite nicht
 * leer ist.
 *
 * ## Was hier geprüft wird
 *
 * Nicht nur „ist die Rechnung da“, sondern **stimmt der Betrag**. Eine
 * Rechnung über 2 × 1.000 EUR mit 19 % ergibt 2.000 netto, 380 Steuer, 2.380
 * brutto. Das ist die Zahl, die den Mandanten interessiert, und sie wird
 * server-seitig aus den Positionen gebildet — genau die Stelle, an der ein
 * falscher Steuersatz oder eine Rundung unbemerkt danebengeht.
 *
 * ## Warum das Anlegen über die API läuft
 *
 * Die Rechnungsmaske ist gross und hat Abhängigkeiten (Empfänger, Positionen,
 * Steuersätze zum Datum). Sie über die Oberfläche zu füllen prüft vor allem
 * die Maske — die Rechnung selbst prüft man besser dort, wo sie entsteht.
 * Die Oberfläche kommt danach dran: erscheint die Rechnung in der Liste, und
 * zeigt die Detailseite denselben Betrag?
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { must, ready } from "../support/strict";

/** Heute als ISO-Datum — das Rechnungsdatum darf nicht in der Zukunft liegen (§ 239 HGB). */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

test.describe("Rechnungs-Lebenszyklus", () => {
  test("anlegen, Betrag pruefen, in der Oberflaeche wiederfinden, loeschen", async ({
    page,
    api,
  }) => {
    test.setTimeout(120_000);

    const recipient = testName("Empfaenger");

    const res = await page.request.post("/api/invoices", {
      data: {
        invoiceType: "INVOICE",
        invoiceDate: today(),
        recipientName: recipient,
        recipientAddress: "Teststrasse 1\n12345 Teststadt",
        items: [
          {
            description: testName("Position"),
            quantity: 2,
            unitPrice: 1000,
            taxType: "STANDARD",
          },
        ],
      },
    });
    expect(
      res.ok(),
      `Rechnung anlegen fehlgeschlagen: HTTP ${res.status()}\n${await res.text()}`,
    ).toBe(true);

    const payload = await res.json();
    const created = payload.data ?? payload;
    expect(created.id, "Antwort enthaelt keine id").toBeTruthy();
    api.track({ collection: "invoices", id: created.id, name: recipient });

    // -----------------------------------------------------------------------
    // Der Betrag — die eigentliche Prüfung
    // -----------------------------------------------------------------------
    const detail = await api.get<{
      data?: Record<string, unknown>;
      netAmount?: unknown;
    }>(`/api/invoices/${created.id}`);
    const invoice = (detail.data ?? detail) as Record<string, unknown>;

    expect(
      Number(invoice.netAmount),
      "Nettobetrag: 2 x 1.000 EUR muessen 2.000 ergeben",
    ).toBeCloseTo(2000, 2);

    // Der Steuerbetrag kommt aus dem zum Rechnungsdatum gueltigen Satz. Er
    // wird hier nicht fest auf 380 geprueft — der Regelsatz ist eine
    // Einstellung, kein Naturgesetz. Geprueft wird die Beziehung: brutto
    // minus netto ist die Steuer, und alle drei muessen zusammenpassen.
    const net = Number(invoice.netAmount);
    const tax = Number(invoice.taxAmount);
    const gross = Number(invoice.grossAmount);
    expect(
      gross,
      `Brutto (${gross}) entspricht nicht Netto (${net}) + Steuer (${tax})`,
    ).toBeCloseTo(net + tax, 2);
    expect(tax, "Bei einer Standardsatz-Position darf die Steuer nicht 0 sein").toBeGreaterThan(0);

    // -----------------------------------------------------------------------
    // In der Oberfläche wiederfinden — mit demselben Betrag
    // -----------------------------------------------------------------------
    await page.goto(`/invoices/${created.id}`);
    await ready(page);
    await must(page.locator("h1").first(), "Ueberschrift der Rechnungs-Detailseite");
    await expect(
      page.locator("body"),
      "Der Empfaengername steht nicht auf der Detailseite",
    ).toContainText(recipient);

    // -----------------------------------------------------------------------
    // Löschen — und nachsehen, ob es wirklich weg ist
    // -----------------------------------------------------------------------
    const del = await page.request.delete(`/api/invoices/${created.id}`);
    expect(
      del.ok(),
      `Loeschen fehlgeschlagen: HTTP ${del.status()}\n${await del.text()}`,
    ).toBe(true);
    api.untrack(created.id);

    const after = await page.request.get(`/api/invoices/${created.id}`);
    expect(
      after.status(),
      "Die geloeschte Rechnung ist weiterhin abrufbar",
    ).toBeGreaterThanOrEqual(400);
  });

  test("Rechnungsdatum in der Zukunft wird abgelehnt (§ 239 HGB)", async ({ page }) => {
    // Vor-Datierung von Umsaetzen ist nicht zulaessig. Die Pruefung steht in
    // der API — hier wird bestaetigt, dass sie auch greift.
    //
    // Zwei Tage und nicht einer. „Morgen" war zweideutig: der Test rechnete
    // es in UTC aus, die Pruefung rechnet in der Zeitzone des Betriebs. Lief
    // der Lauf zwischen 22:00 und 24:00 UTC, war „morgen in UTC" bereits
    // „heute in Berlin" — und wurde zu Recht angenommen. Genau daran ist ein
    // CI-Lauf gescheitert.
    //
    // Das ist die Kehrseite des Fehlers, den isNotInFuture behebt: eine
    // Datumsgrenze in UTC zu ziehen und in Ortszeit zu pruefen geht in beide
    // Richtungen schief. Zwei Tage liegen ausserhalb jeder Zeitzone.
    const uebermorgen = new Date(Date.now() + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const res = await page.request.post("/api/invoices", {
      data: {
        invoiceType: "INVOICE",
        invoiceDate: uebermorgen,
        recipientName: testName("Zukunft"),
        items: [{ description: "Test", quantity: 1, unitPrice: 100 }],
      },
    });

    expect(
      res.ok(),
      "Eine Rechnung mit Datum in der Zukunft wurde angenommen — die Pruefung greift nicht",
    ).toBe(false);
    expect(await res.text()).toMatch(/zukunft/i);
  });

  test("Rechnungsdatum von heute wird angenommen", async ({ page, api }) => {
    // Die Gegenprobe, und der Grund, warum es sie geben muss: bis zum
    // 02.08.2026 lehnte die Pruefung den HEUTIGEN Tag ab, wenn jemand
    // zwischen 00:00 und 02:00 Ortszeit arbeitete. Die Oberflaeche schickt
    // ein gewaehltes Datum als Mitternacht UTC, und die lag dann noch in der
    // Zukunft. Ohne diesen Test faellt so etwas erst dem Nutzer auf — und dem
    // fehlt der Grund, es fuer einen Fehler des Programms zu halten.
    //
    // „Heute" wird hier so bestimmt, wie es der Server tut: als Kalendertag
    // in der Zeitzone des Betriebs.
    const heuteInBerlin = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const name = testName("Heute");
    const res = await page.request.post("/api/invoices", {
      data: {
        invoiceType: "INVOICE",
        invoiceDate: heuteInBerlin,
        recipientName: name,
        items: [{ description: "Test", quantity: 1, unitPrice: 100 }],
      },
    });

    expect(
      res.ok(),
      `Eine Rechnung mit dem heutigen Datum wurde abgelehnt: HTTP ${res.status()}\n` +
        `${await res.text()}\nDas ist keine Vor-Datierung — § 239 HGB verbietet ` +
        `einen spaeteren TAG, nicht eine spaetere Uhrzeit.`,
    ).toBe(true);

    const rumpf = await res.json();
    const angelegt = rumpf.data ?? rumpf;
    api.track({ collection: "invoices", id: angelegt.id, name });
  });

  test("Liste: Suche findet eine angelegte Rechnung", async ({ page, api }) => {
    const recipient = testName("Suchbar");

    const res = await page.request.post("/api/invoices", {
      data: {
        invoiceType: "INVOICE",
        invoiceDate: today(),
        recipientName: recipient,
        items: [{ description: "Position", quantity: 1, unitPrice: 500 }],
      },
    });
    expect(res.ok(), `Anlegen fehlgeschlagen: ${await res.text()}`).toBe(true);
    // POST /api/invoices liefert die Rechnung DIREKT, nicht in { data }.
    const body = await res.json();
    const created = body.data ?? body;
    api.track({ collection: "invoices", id: created.id, name: recipient });

    await page.goto("/invoices");
    await ready(page);

    // Ausdruecklich das Suchfeld DER LISTE. `/suche/i` traf sonst die globale
    // Suche im Kopfbereich — derselbe Fehler wie in park-lifecycle und im
    // Buchungsjournal, und er faellt erst auf, wenn genug Daten da sind.
    const search = page.getByPlaceholder(/suchen nach nummer/i).first();
    await must(search, "Suchfeld in der Rechnungsliste");
    await search.fill(recipient);

    // Die Seite enthaelt ZWEI Tabellen (Rechnungen und wiederkehrende
    // Rechnungen). `table tbody` trifft beide — Playwright bricht dann mit
    // einer Mehrdeutigkeit ab, nicht weil der Eintrag fehlt.
    await expect(
      page.locator("table").first().locator("tbody"),
      "Die angelegte Rechnung erscheint nicht in der Suche",
    ).toContainText(recipient, { timeout: 15_000 });
  });
});
