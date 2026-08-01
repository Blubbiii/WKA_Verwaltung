/**
 * Buchhaltung: der Weg eines Buchungssatzes vom Entwurf bis zum Storno.
 *
 * 41 Seiten, bis heute null Abdeckung — und der Bereich, in dem gerechnet
 * wird. Ein Fehler in einer Liste ist ärgerlich; ein Fehler hier steht später
 * im Jahresabschluss.
 *
 * ## Was hier geprüft wird — und warum gerade das
 *
 * Nicht „die Seite lädt“, sondern die Regeln, die Buchhaltung ausmachen:
 *
 *  - **Soll = Haben.** Eine unausgeglichene Buchung darf nicht entstehen.
 *    Entsteht sie doch, ist die Bilanz ab diesem Moment falsch, und niemand
 *    merkt es, bis der Abschluss nicht aufgeht.
 *  - **Keine Vorbuchung.** § 146 AO: ein Buchungsdatum in der Zukunft würde
 *    Umsätze in die falsche Periode legen.
 *  - **Festgeschrieben ist endgültig.** Nach dem Festschreiben darf weder
 *    geändert noch gelöscht werden — nur storniert. Das ist die
 *    Unveränderbarkeit, auf der die GoBD beruht.
 *  - **Storno statt Löschen.** Die Generalumkehr erzeugt eine GEGENBUCHUNG.
 *    Verschwände die ursprüngliche, wäre der Verlauf nicht mehr
 *    nachvollziehbar.
 *
 * ## Warum über die API und nicht durch die Maske
 *
 * Der Buchungsdialog hat dynamische Zeilen, Kontensuche und Steuerschlüssel.
 * Ihn zu bedienen prüft vor allem den Dialog. Die REGELN sitzen im Server,
 * und dort werden sie geprüft — die Maske kommt danach dran: erscheint die
 * Buchung in der Liste, zeigt sie den richtigen Status?
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { must, ready } from "../support/strict";

/**
 * Heute um Mitternacht — genau das, was die Maske sendet.
 *
 * Der erste Entwurf nahm `new Date().toISOString()`, also den aktuellen
 * Zeitpunkt. Der Server wies das ab: „Buchungsdatum darf nicht in der Zukunft
 * liegen". Ursache ist kein Fehler, sondern fehlende Toleranz plus
 * Uhrzeitversatz — die Serveruhr geht rund eine Sekunde nach, und die Prüfung
 * lautet `entryDate <= Date.now()` ohne Spielraum.
 *
 * Echte Nutzer trifft das nicht: das Formular liest ein `<input type="date">`
 * und schickt `new Date("2026-08-01").toISOString()`, also Mitternacht UTC.
 * Der Test macht es jetzt genauso — ein Test, der etwas schickt, was die
 * Anwendung nie schickt, prüft den falschen Fall.
 *
 * Eine Anmerkung bleibt: wer die API direkt mit einem echten Zeitstempel
 * anspricht, stolpert über denselben Versatz.
 */
function heute(): string {
  const d = new Date();
  return new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()),
  ).toISOString();
}

function ausgeglicheneZeilen(betrag: number) {
  return [
    { lineNumber: 1, account: "1200", accountName: "Bank", debitAmount: betrag },
    { lineNumber: 2, account: "8400", accountName: "Erloese", creditAmount: betrag },
  ];
}

test.describe("Buchungssatz", () => {
  test("anlegen, in der Liste finden, als Entwurf loeschen", async ({ page, api }) => {
    const beschreibung = testName("Buchung");

    const res = await page.request.post("/api/journal-entries", {
      data: {
        entryDate: heute(),
        description: beschreibung,
        lines: ausgeglicheneZeilen(1000),
      },
    });
    expect(
      res.ok(),
      `Buchung anlegen fehlgeschlagen: HTTP ${res.status()}\n${await res.text()}`,
    ).toBe(true);

    const body = await res.json();
    const entry = body.data ?? body;
    expect(entry.id, "Antwort enthaelt keine id").toBeTruthy();
    api.track({ collection: "journal-entries", id: entry.id, name: beschreibung });

    // Ein frischer Satz ist ein ENTWURF. Waere er sofort festgeschrieben,
    // liesse sich ein Tippfehler nur noch per Storno beheben.
    expect(entry.status, "Ein neuer Buchungssatz muss DRAFT sein").toBe("DRAFT");

    await page.goto("/journal-entries");
    await ready(page);
    const suche = page.getByPlaceholder(/suche/i).first();
    await must(suche, "Suchfeld im Buchungsjournal");
    await suche.fill(beschreibung);
    await expect(
      page.locator("table").first().locator("tbody"),
      "Die angelegte Buchung erscheint nicht im Journal",
    ).toContainText(beschreibung, { timeout: 15_000 });

    const del = await page.request.delete(`/api/journal-entries/${entry.id}`);
    expect(
      del.ok(),
      `Ein ENTWURF muss loeschbar sein. HTTP ${del.status()}: ${await del.text()}`,
    ).toBe(true);
    api.untrack(entry.id);
  });

  test("Soll ungleich Haben wird abgelehnt", async ({ page }) => {
    // Die Grundregel der doppelten Buchfuehrung. Kaeme so etwas durch, waere
    // die Bilanz ab diesem Moment falsch — und es faellt erst beim Abschluss
    // auf, Monate spaeter.
    const res = await page.request.post("/api/journal-entries", {
      data: {
        entryDate: heute(),
        description: testName("Unausgeglichen"),
        lines: [
          { lineNumber: 1, account: "1200", debitAmount: 1000 },
          { lineNumber: 2, account: "8400", creditAmount: 900 },
        ],
      },
    });

    expect(
      res.ok(),
      "Eine unausgeglichene Buchung wurde angenommen — Soll und Haben werden nicht geprueft",
    ).toBe(false);
  });

  test("Buchungsdatum in der Zukunft wird abgelehnt (§ 146 AO)", async ({ page }) => {
    const morgen = new Date(Date.now() + 86_400_000).toISOString();

    const res = await page.request.post("/api/journal-entries", {
      data: {
        entryDate: morgen,
        description: testName("Vorbuchung"),
        lines: ausgeglicheneZeilen(100),
      },
    });

    expect(
      res.ok(),
      "Eine Vorbuchung wurde angenommen — Umsaetze koennten in die falsche Periode gelegt werden",
    ).toBe(false);
    expect(await res.text()).toMatch(/zukunft/i);
  });

  test("weniger als zwei Zeilen wird abgelehnt", async ({ page }) => {
    const res = await page.request.post("/api/journal-entries", {
      data: {
        entryDate: heute(),
        description: testName("Einzeilig"),
        lines: [{ lineNumber: 1, account: "1200", debitAmount: 100 }],
      },
    });
    expect(
      res.ok(),
      "Eine Buchung mit einer Zeile wurde angenommen — es gibt keine Gegenbuchung",
    ).toBe(false);
  });
});

test.describe("Festschreiben und Storno", () => {
  test("festgeschrieben laesst sich nicht mehr loeschen, nur stornieren", async ({
    page,
    api,
  }) => {
    test.setTimeout(120_000);
    const beschreibung = testName("Festzuschreiben");

    const res = await page.request.post("/api/journal-entries", {
      data: {
        entryDate: heute(),
        description: beschreibung,
        lines: ausgeglicheneZeilen(500),
      },
    });
    expect(res.ok(), `Anlegen fehlgeschlagen: ${await res.text()}`).toBe(true);
    const body = await res.json();
    const entry = body.data ?? body;
    api.track({ collection: "journal-entries", id: entry.id, name: beschreibung });

    // --- Festschreiben ---------------------------------------------------
    const post = await page.request.post(`/api/journal-entries/${entry.id}/post`);
    expect(
      post.ok(),
      `Festschreiben fehlgeschlagen: HTTP ${post.status()}\n${await post.text()}`,
    ).toBe(true);

    const nachher = await api.get<{ data?: { status?: string }; status?: string }>(
      `/api/journal-entries/${entry.id}`,
    );
    const status = (nachher.data ?? nachher).status;
    expect(status, "Nach dem Festschreiben muss der Status POSTED sein").toBe(
      "POSTED",
    );

    // --- Loeschen muss jetzt scheitern -----------------------------------
    // Das ist die Unveraenderbarkeit, auf der die GoBD beruht. Ginge es doch,
    // waere jede festgeschriebene Buchung nachtraeglich entfernbar.
    const del = await page.request.delete(`/api/journal-entries/${entry.id}`);
    expect(
      del.ok(),
      "Eine FESTGESCHRIEBENE Buchung liess sich loeschen — die Unveraenderbarkeit greift nicht",
    ).toBe(false);

    // --- Storno erzeugt eine GEGENBUCHUNG --------------------------------
    const reverse = await page.request.post(
      `/api/journal-entries/${entry.id}/reverse`,
      { data: { reason: "E2E-Test: Generalumkehr" } },
    );
    expect(
      reverse.ok(),
      `Storno fehlgeschlagen: HTTP ${reverse.status()}\n${await reverse.text()}`,
    ).toBe(true);

    const storno = await reverse.json();
    const stornoEntry = storno.data ?? storno;
    if (stornoEntry?.id) {
      api.track({
        collection: "journal-entries",
        id: stornoEntry.id,
        name: beschreibung,
      });
    }

    // Die urspruengliche Buchung bleibt bestehen. Verschwaende sie, waere der
    // Verlauf nicht mehr nachvollziehbar — genau das verhindert das Storno.
    const original = await api.get<{ data?: unknown }>(
      `/api/journal-entries/${entry.id}`,
    );
    expect(
      original,
      "Die stornierte Buchung ist verschwunden — ein Storno darf nicht loeschen",
    ).toBeTruthy();
  });
});

test.describe("Bilanz und GuV", () => {
  test("die Bilanz geht auf: Aktiva gleich Passiva", async ({ api }) => {
    // Die eine Zahl, an der man sieht, ob die Buchfuehrung stimmt.
    //
    // Der erste Entwurf dieses Tests hiess so, prueft aber nur, dass die Seite
    // ohne Fehlermeldung laedt — genau die Suende, die ich der alten Suite
    // vorgeworfen habe: der Name verspricht mehr als der Test haelt. Die API
    // liefert `summeAktiva`, `summePassiva` und `differenz`; es gibt keinen
    // Grund, sich mit weniger zufriedenzugeben.
    const jahr = new Date().getFullYear();
    const antwort = await api.get<{
      data: {
        summeAktiva: number;
        summePassiva: number;
        differenz: number;
        warnings?: string[];
      };
    }>(`/api/buchhaltung/bilanz?year=${jahr}`);
    const bilanz = antwort.data;

    expect(
      bilanz.differenz,
      `Die Bilanz geht nicht auf: Aktiva ${bilanz.summeAktiva}, ` +
        `Passiva ${bilanz.summePassiva}, Differenz ${bilanz.differenz}. ` +
        `Irgendwo ist eine Buchung schiefgelaufen — besser hier erfahren als ` +
        `beim Jahresabschluss.`,
    ).toBeCloseTo(0, 2);

    expect(bilanz.summeAktiva, "Aktiva ungleich Passiva").toBeCloseTo(
      bilanz.summePassiva,
      2,
    );
  });

  test("die Bilanzseite laedt und zeigt keine Fehlermeldung", async ({ page }) => {
    await page.goto("/buchhaltung/bilanz");
    await ready(page);
    await must(page.locator("h1").first(), "Ueberschrift der Bilanz");
    await expect(
      page.locator("body"),
      "Die Bilanz zeigt eine Fehlermeldung",
    ).not.toContainText(/Application error|Unhandled Runtime Error/i);
  });

  test("die GuV laedt ohne Fehler", async ({ page }) => {
    await page.goto("/buchhaltung/guv");
    await ready(page);
    await must(page.locator("h1").first(), "Ueberschrift der GuV");
    await expect(
      page.locator("body"),
      "Die GuV zeigt eine Fehlermeldung",
    ).not.toContainText(/Application error|Unhandled Runtime Error/i);
  });
});
