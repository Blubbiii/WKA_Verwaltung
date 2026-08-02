/**
 * Mahnlauf: aus einer überfälligen Rechnung wird eine Mahnung — mit Gebühr
 * und Verzugszinsen.
 *
 * ## Warum hier
 *
 * Der Rechenkern ist per Unit-Test abgedeckt: Mahnstufen, Fälligkeitstage,
 * Verzugszinsen nach § 288 BGB. Der **Weg** dorthin nicht — und genau dort
 * lagen bisher die Fehler: eine Formel, die stimmt, nützt nichts, wenn die
 * Eingangsgrössen nicht ankommen oder das Ergebnis nicht gespeichert wird.
 *
 * ## Was geprüft wird
 *
 * Nicht „ein Mahnlauf entstand", sondern die drei Zahlen, die den Mahnbetrag
 * ausmachen:
 *
 *  - **Die Mahnstufe.** Sie ergibt sich aus den Tagen der Überfälligkeit und
 *    entscheidet über die Gebühr. Eine Stufe zu hoch ist eine unberechtigte
 *    Forderung, eine zu niedrig verschenkt Geld.
 *  - **Die Gebühr.** Sie muss dem entsprechen, was in den Mandanten-
 *    Einstellungen für diese Stufe hinterlegt ist — nicht einem fest
 *    verdrahteten Wert.
 *  - **Die Verzugstage.** Sie sind die Grundlage der Zinsen. Ein Tag daneben
 *    ist wenig Geld und ein falscher Beleg.
 *
 * Die Erwartung wird dabei **aus den Einstellungen gelesen**, nicht
 * hingeschrieben. Ein Test mit fest verdrahteter Gebühr würde grün bleiben,
 * wenn jemand die Einstellung ändert und die Berechnung sie ignoriert —
 * also genau den Fall verdecken, für den er da ist.
 *
 * ## Was er nicht tut
 *
 * Er verschickt nichts. Der Mahnlauf erzeugt die Positionen; der Versand ist
 * ein eigener Schritt mit eigener Wirkung nach draussen.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { must, ready, requireOrSkip } from "../support/strict";

interface Einstellungen {
  reminderDays1: number;
  reminderFee1: number;
  reminderDays2: number;
  reminderFee2: number;
  paymentTermDays: number;
  [k: string]: unknown;
}

/** Datum vor N Tagen, als Kalendertag in der Zeitzone des Betriebs. */
function vorTagen(tage: number): string {
  const d = new Date(Date.now() - tage * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

test.describe("Mahnlauf", () => {
  test("aus einer ueberfaelligen Rechnung wird eine Mahnung mit der richtigen Stufe und Gebuehr", async ({
    page,
    api,
  }) => {
    test.setTimeout(300_000);

    const einstellungen = await api.get<Einstellungen>("/api/admin/tenant-settings");
    await requireOrSkip(
      typeof einstellungen.reminderDays1 === "number" &&
        typeof einstellungen.reminderFee1 === "number",
      "Der Mandant hat keine Mahnstufen konfiguriert — ohne sie gibt es " +
        "nichts nachzurechnen",
    );

    // So weit ueberfaellig, dass Stufe 1 sicher greift, aber Stufe 2 noch
    // nicht. Der Abstand ist gewollt: laege die Rechnung genau auf einer
    // Schwelle, waere nicht zu unterscheiden, ob die Stufe richtig gewaehlt
    // oder nur zufaellig getroffen wurde.
    const stufe2 = einstellungen.reminderDays2 ?? Number.MAX_SAFE_INTEGER;
    const ueberfaelligTage = Math.floor(
      (einstellungen.reminderDays1 + Math.min(stufe2, einstellungen.reminderDays1 + 20)) / 2,
    );
    await requireOrSkip(
      ueberfaelligTage > einstellungen.reminderDays1,
      `Zwischen Stufe 1 (${einstellungen.reminderDays1} Tage) und Stufe 2 ` +
        `(${stufe2}) liegt kein Tag — dann laesst sich die Stufenwahl nicht ` +
        `eindeutig pruefen`,
    );

    // --- Eine Rechnung, die faellig und unbezahlt ist --------------------
    const empfaenger = testName("Mahn-Empfaenger");
    const rechnungsdatum = vorTagen(ueberfaelligTage + einstellungen.paymentTermDays);
    const faellig = vorTagen(ueberfaelligTage);

    const res = await page.request.post("/api/invoices", {
      data: {
        invoiceType: "INVOICE",
        invoiceDate: rechnungsdatum,
        dueDate: faellig,
        serviceStartDate: rechnungsdatum,
        recipientName: empfaenger,
        recipientAddress: "Teststrasse 1\n27476 Cuxhaven",
        items: [
          {
            description: testName("Mahn-Position"),
            quantity: 1,
            unitPrice: 1000,
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

    // Gemahnt wird nur, was versendet ist — ein Entwurf schuldet niemand.
    const senden = await page.request.post(`/api/invoices/${rechnung.id}/send`);
    await requireOrSkip(
      senden.ok(),
      `Die Rechnung liess sich nicht versenden (HTTP ${senden.status()}): ` +
        `${(await senden.text()).slice(0, 200)} — ohne versendete Rechnung ` +
        `gibt es nichts zu mahnen`,
    );

    // --- Sieht der Mahnlauf sie ueberhaupt? ------------------------------
    const kandidaten = await api.get<{
      data?: { invoiceId: string; overdueDays: number; suggestedLevel: number }[];
    }>("/api/buchhaltung/dunning?mode=candidates");
    const liste = kandidaten.data ?? [];

    const meine = liste.find((k) => k.invoiceId === rechnung.id);
    expect(
      meine,
      `Die seit ${ueberfaelligTage} Tagen ueberfaellige Rechnung steht nicht ` +
        `unter den Mahn-Kandidaten. Sie wuerde nie gemahnt — und niemand ` +
        `bemerkt eine Forderung, die nicht auf der Liste steht.`,
    ).toBeTruthy();

    expect(
      meine!.overdueDays,
      `Die Ueberfaelligkeit betraegt ${meine!.overdueDays} statt ` +
        `${ueberfaelligTage} Tage. Aus dieser Zahl werden die Verzugszinsen ` +
        `gerechnet (§ 288 BGB) — ein Tag daneben ist ein falscher Beleg.`,
    ).toBe(ueberfaelligTage);

    // --- Den Lauf ausfuehren ---------------------------------------------
    const lauf = await page.request.post("/api/buchhaltung/dunning", {
      data: { invoiceIds: [rechnung.id] },
    });
    expect(
      lauf.ok(),
      `Der Mahnlauf wurde abgewiesen: HTTP ${lauf.status()}\n${await lauf.text()}`,
    ).toBe(true);

    const ergebnis = (await lauf.json()) as { runId?: string; itemCount?: number };
    const laufId = ergebnis.runId;
    expect(laufId, "Der Mahnlauf lieferte keine Kennung").toBeTruthy();
    expect(
      ergebnis.itemCount,
      "Der Mahnlauf meldet null Posten — er hat die uebergebene Rechnung " +
        "nicht gemahnt, ohne das zu sagen",
    ).toBe(1);

    // --- Die drei Zahlen, auf die es ankommt ------------------------------
    const gelesen = await api.get<{
      items?: Record<string, unknown>[];
      data?: { items?: Record<string, unknown>[] };
    }>(`/api/buchhaltung/dunning/${laufId}`);
    const posten = (gelesen.items ?? gelesen.data?.items ?? []) as Record<
      string,
      unknown
    >[];

    const eintrag = posten.find((p) => p.invoiceId === rechnung.id);
    expect(
      eintrag,
      "Der Mahnlauf enthaelt keinen Posten fuer die gemahnte Rechnung",
    ).toBeTruthy();

    expect(
      Number(eintrag!.level),
      `Die Mahnstufe ist ${eintrag!.level} statt 1. Bei ` +
        `${ueberfaelligTage} Tagen Ueberfaelligkeit greift Stufe 1 ` +
        `(ab ${einstellungen.reminderDays1} Tagen), Stufe 2 erst ab ${stufe2}. ` +
        `Eine Stufe zu hoch ist eine unberechtigte Forderung.`,
    ).toBe(1);

    // Die Erwartung kommt aus den EINSTELLUNGEN, nicht aus dem Test. Ein
    // fester Wert hier wuerde gruen bleiben, wenn jemand die Gebuehr aendert
    // und die Berechnung sie ignoriert — also genau den Fall verdecken.
    expect(
      Number(eintrag!.feeAmount),
      `Die Mahngebuehr betraegt ${eintrag!.feeAmount} € statt der fuer Stufe 1 ` +
        `hinterlegten ${einstellungen.reminderFee1} €. Sie kommt dann nicht ` +
        `aus den Mandanten-Einstellungen.`,
    ).toBeCloseTo(Number(einstellungen.reminderFee1), 2);

    expect(
      Number(eintrag!.amount),
      `Der gemahnte Betrag ist ${eintrag!.amount} € statt 1000 €. Das ist die ` +
        `Forderung, die im Mahnschreiben steht.`,
    ).toBeCloseTo(1000, 2);

    expect(
      Number(eintrag!.interestDaysOverdue),
      "Die Verzugstage im Mahnposten weichen von der Ueberfaelligkeit ab",
    ).toBe(ueberfaelligTage);

    // Verzugszinsen duerfen nicht negativ sein und nicht aus dem Nichts
    // entstehen: bei 1.000 € und wenigen Wochen sind es einstellige Betraege.
    const zinsen = Number(eintrag!.interestAmount ?? 0);
    expect(
      zinsen,
      `Die Verzugszinsen betragen ${zinsen} € — negativ ist unmoeglich`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      zinsen,
      `Die Verzugszinsen betragen ${zinsen} € auf eine Forderung von 1.000 € ` +
        `nach ${ueberfaelligTage} Tagen. Das ist mehr als der Basiszins plus ` +
        `Aufschlag hergibt — vermutlich wird mit dem falschen Zeitraum oder ` +
        `einem falschen Satz gerechnet.`,
    ).toBeLessThan(100);
  });

  test("die Liste zeigt den offenen Betrag, nicht den vollen", async ({ page, api }) => {
    test.setTimeout(300_000);

    // Gefunden am 02.08.2026: die Mahnliste zeigte in der Spalte „Betrag" den
    // BRUTTOBETRAG. Gemahnt wird aber der offene Rest — auf ihn rechnet der
    // Mahnlauf die Verzugszinsen, mit ihm steht die Forderung im Mahnposten.
    //
    // Eine zu 80 % bezahlte Rechnung sah damit aus wie eine unbezahlte. Wer
    // die Liste durchgeht, um zu entscheiden, was dringend ist, entschied
    // anhand einer Zahl, die mit der Forderung nichts zu tun hatte — und
    // mahnte einen Kunden ueber 1.000 €, dem er 200 € schuldete.
    const einstellungen = await api.get<Einstellungen>("/api/admin/tenant-settings");
    const ueberfaelligTage = (einstellungen.reminderDays1 ?? 7) + 3;

    const empfaenger = testName("Teilzahler");
    const brutto = 1000;
    const gezahlt = 800; // krumm genug, dass 200 ≠ 1000 auffaellt

    const res = await page.request.post("/api/invoices", {
      data: {
        invoiceType: "INVOICE",
        invoiceDate: vorTagen(ueberfaelligTage + (einstellungen.paymentTermDays ?? 14)),
        dueDate: vorTagen(ueberfaelligTage),
        serviceStartDate: vorTagen(ueberfaelligTage + (einstellungen.paymentTermDays ?? 14)),
        recipientName: empfaenger,
        recipientAddress: "Teststrasse 1\n27476 Cuxhaven",
        items: [
          {
            description: testName("Teilzahlungs-Position"),
            quantity: 1,
            unitPrice: brutto,
            taxType: "EXEMPT",
          },
        ],
      },
    });
    expect(res.ok(), `Rechnung anlegen: ${await res.text()}`).toBe(true);
    const rumpf = await res.json();
    const rechnung = rumpf.data ?? rumpf;
    api.track({ collection: "invoices", id: rechnung.id, name: empfaenger });

    const senden = await page.request.post(`/api/invoices/${rechnung.id}/send`);
    await requireOrSkip(
      senden.ok(),
      `Die Rechnung liess sich nicht versenden (HTTP ${senden.status()})`,
    );

    const zahlung = await page.request.post(`/api/invoices/${rechnung.id}/payments`, {
      data: { amount: gezahlt },
    });
    await requireOrSkip(
      zahlung.ok(),
      `Teilzahlung liess sich nicht buchen (HTTP ${zahlung.status()}): ` +
        `${(await zahlung.text()).slice(0, 200)}`,
    );

    // --- Erst die Daten ---------------------------------------------------
    const kandidaten = await api.get<{
      data?: { invoiceId: string; openAmount: number; grossAmount: number }[];
    }>("/api/buchhaltung/dunning?mode=candidates");
    const meine = (kandidaten.data ?? []).find((k) => k.invoiceId === rechnung.id);
    await requireOrSkip(
      Boolean(meine),
      "Die teilbezahlte Rechnung steht nicht unter den Kandidaten — dann " +
        "laesst sich die Anzeige nicht pruefen",
    );

    expect(
      Number(meine!.openAmount),
      `Der offene Betrag ist ${meine!.openAmount} € statt ${brutto - gezahlt} €. ` +
        `Auf ihn rechnet der Mahnlauf die Verzugszinsen — stimmt er nicht, ` +
        `ist die ganze Mahnung falsch.`,
    ).toBeCloseTo(brutto - gezahlt, 2);

    // --- Und dann die Anzeige ---------------------------------------------
    await page.goto("/buchhaltung/zahlungen?tab=mahnwesen");
    await ready(page);

    const zeile = page.locator("tr", { hasText: empfaenger }).first();
    await must(zeile, `Zeile der Rechnung an „${empfaenger}“ in der Mahnliste`);

    await expect(
      zeile,
      `Die Mahnliste zeigt fuer eine zu ${gezahlt} € bezahlte Rechnung nicht ` +
        `den offenen Rest von ${brutto - gezahlt} €. Wer danach entscheidet, ` +
        `was dringend ist, entscheidet anhand der falschen Zahl.`,
    ).toContainText(/200,00/);

    await expect(
      zeile,
      `Die Mahnliste zeigt den vollen Bruttobetrag von ${brutto} € — als waere ` +
        `nichts bezahlt worden.`,
    ).not.toContainText(/1\.000,00/);
  });

  test("eine nicht faellige Rechnung wird nicht gemahnt", async ({ page, api }) => {
    test.setTimeout(180_000);

    // Die Gegenprobe. Ohne sie waere nicht zu unterscheiden, ob der Mahnlauf
    // die Faelligkeit prueft oder einfach alles mahnt, was offen ist — und
    // eine Mahnung vor Faelligkeit ist eine unberechtigte Forderung.
    const heuteInBerlin = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const empfaenger = testName("Nicht faellig");
    const res = await page.request.post("/api/invoices", {
      data: {
        invoiceType: "INVOICE",
        invoiceDate: heuteInBerlin,
        dueDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
        serviceStartDate: heuteInBerlin,
        recipientName: empfaenger,
        recipientAddress: "Teststrasse 1\n27476 Cuxhaven",
        items: [
          { description: testName("Position"), quantity: 1, unitPrice: 500, taxType: "EXEMPT" },
        ],
      },
    });
    expect(res.ok(), `Rechnung anlegen: ${await res.text()}`).toBe(true);
    const rumpf = await res.json();
    const rechnung = rumpf.data ?? rumpf;
    api.track({ collection: "invoices", id: rechnung.id, name: empfaenger });

    const senden = await page.request.post(`/api/invoices/${rechnung.id}/send`);
    await requireOrSkip(
      senden.ok(),
      `Die Rechnung liess sich nicht versenden (HTTP ${senden.status()})`,
    );

    const kandidaten = await api.get<{ data?: { invoiceId: string }[] }>("/api/buchhaltung/dunning?mode=candidates");
    const liste = kandidaten.data ?? [];

    expect(
      liste.some((k) => k.invoiceId === rechnung.id),
      "Eine Rechnung mit Faelligkeit in 30 Tagen steht unter den " +
        "Mahn-Kandidaten — eine Mahnung vor Faelligkeit ist eine " +
        "unberechtigte Forderung",
    ).toBe(false);
  });
});
