/**
 * Pacht-Abrechnung: durchklicken bis zur Berechnung — und nachrechnen.
 *
 * ## Warum dieser Assistent einen eigenen Test braucht
 *
 * Schritt 1 verlangt einen Park, ein Jahr **und mindestens einen
 * Pachtvertrag** an diesem Park (`canProceed`: `leaseSummary.leaseCount > 0`).
 * Der generische Läufer kann Felder füllen, aber keinen Pachtvertrag
 * herstellen — er bliebe in Schritt 1 stehen.
 *
 * ## Was hier tatsächlich geprüft wird
 *
 * Nicht „eine Zahl erschien". Die Vorauszahlung ist rechnerisch bestimmt, und
 * zwar so:
 *
 *     Jahresminimum = Mindestpacht je Anlage × Anzahl WEA
 *     Periodenbetrag = Jahresminimum ÷ Intervall   (jährlich 1, quartalsweise 4)
 *
 * Der Test setzt beide Eingangsgrössen selbst — 12.000 € je Anlage, zwei
 * Anlagen — und rechnet das Ergebnis nach: 24.000 ÷ 4 = **6.000 €**. Fällt
 * eine Anlage aus der Zählung, ändert sich der Betrag, und der Test sagt es.
 *
 * Eine Prüfung auf „irgendein Betrag steht da" hätte einen halbierten
 * Vorschuss nicht bemerkt — und ein Vorschuss ist Geld, das fliesst.
 *
 * ## Was der Assistent unterwegs anlegt
 *
 * Das ist beim Entwurf leicht zu übersehen: der Wechsel von Schritt 2 auf 3
 * ist **kein** Vorschau-Schritt. `handleCalculate()` legt zuerst über
 * `POST /api/leases/settlement` eine Abrechnung an und rechnet sie dann mit
 * `saveResult: true`. Nach dem Klick steht ein Datensatz in der Datenbank.
 *
 * Deshalb wird die Antwort dieses POST mitgelesen und die Abrechnung am Ende
 * **storniert** — auch wenn der Test dazwischen scheitert. Löschen geht
 * nicht: das erlaubt die Anwendung nur im Status „offen", und nach der
 * Berechnung steht sie auf „berechnet". Eine stornierte Abrechnung bleibt
 * bestehen; das ist keine Panne, sondern der vorgesehene Weg — der
 * Rechenweg bleibt für die Prüfbarkeit erhalten.
 *
 * ## Wo der Test aufhört
 *
 * Vor dem Abschluss. Der letzte Schritt erzeugt Rechnungen an die
 * Verpächter — echtes Geld, echte Belege, nicht rückholbar. Der Rechenweg
 * dorthin ist geprüft, das Auslösen bleibt einem Menschen vorbehalten.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { must, ready } from "../support/strict";
import { currentStep, selectOption, stepCount } from "../support/wizard";

/** Mindestpacht je Anlage. Frei gewählt, aber bewusst glatt — der Test rechnet damit. */
const MINDESTPACHT_JE_ANLAGE = 12_000;
/** Zwei Anlagen: mit einer einzigen fiele nicht auf, wenn die Zählung sie ignoriert. */
const ANLAGEN = 2;
/** Voreinstellung des Assistenten. Vierteljährlich heisst Teiler 4. */
const INTERVALL_TEILER = 4;

const ERWARTETER_VORSCHUSS =
  (MINDESTPACHT_JE_ANLAGE * ANLAGEN) / INTERVALL_TEILER;

interface Vorbedingung {
  parkId: string;
  parkName: string;
}

/**
 * Park mit Anlagen, Flurstück und Pachtvertrag — alles, was Schritt 1 verlangt.
 *
 * Über die API und nicht durch die Masken: die sind an anderer Stelle
 * geprüft, und ein Fehlschlag beim Aufbau soll nicht wie ein Fehler dieses
 * Assistenten aussehen.
 */
async function parkMitPacht(
  page: import("@playwright/test").Page,
  api: import("../support/api").WpmApi,
): Promise<Vorbedingung> {
  const parkName = testName("Park Abrechnung");
  const parkRes = await page.request.post("/api/parks", {
    data: {
      name: parkName,
      status: "ACTIVE",
      minimumRentPerTurbine: MINDESTPACHT_JE_ANLAGE,
      weaSharePercentage: 10,
      poolSharePercentage: 90,
      // Die Berechnung verlangt es AM PARK, nicht an der Anlage. Meine erste
      // Fassung setzte es an den Anlagen — die Meldung lautete nur
      // "Inbetriebnahmedatum fehlt" und sagte nicht, wessen. Inzwischen sagt
      // sie es (siehe lease-revenue/calculator.ts).
      commissioningDate: "2019-06-15",
    },
  });
  expect(
    parkRes.ok(),
    `Park anlegen fehlgeschlagen: HTTP ${parkRes.status()}\n${await parkRes.text()}`,
  ).toBe(true);
  const parkRumpf = await parkRes.json();
  const park = parkRumpf.data ?? parkRumpf;
  api.track({ collection: "parks", id: park.id, name: parkName });

  // Erloesphase: ohne sie weist die Berechnung ab. Die Phasen zaehlen
  // BETRIEBSJAHRE ab 1, nicht Kalenderjahre — eine Phase von 1 bis offen
  // deckt die ganze Laufzeit ab. Genau darueber bin ich gestolpert, und die
  // Meldung sagt es inzwischen selbst.
  const phaseRes = await page.request.post(
    `/api/parks/${park.id}/revenue-phases`,
    {
      data: [
        {
          phaseNumber: 1,
          startYear: 1,
          endYear: null,
          revenueSharePercentage: 5,
          description: "E2E-Testlauf",
        },
      ],
    },
  );
  expect(
    phaseRes.ok(),
    `Erloesphase anlegen fehlgeschlagen: HTTP ${phaseRes.status()}
${await phaseRes.text()}`,
  ).toBe(true);

  for (let i = 1; i <= ANLAGEN; i++) {
    const bezeichnung = `${testName("WEA Abrechnung")}-${i}`;
    const res = await page.request.post("/api/turbines", {
      data: {
        parkId: park.id,
        designation: bezeichnung,
        deviceType: "WEA",
        status: "ACTIVE",
        ratedPowerKw: 3000,
        // Ohne Inbetriebnahmedatum weist die Berechnung ab: „Inbetriebnahme-
        // datum fehlt". Zu Recht — eine Anlage, von der niemand weiss, seit
        // wann sie steht, laesst sich nicht auf einen Zeitraum umlegen.
        //
        // Bewusst lange vor dem Abrechnungsjahr: eine Anlage, die mitten im
        // Zeitraum ans Netz geht, wird anteilig gerechnet, und dann ginge die
        // Nachrechnung im Test nicht mehr glatt auf. Hier soll die Formel
        // geprueft werden, nicht die Anteiligkeit.
        commissioningDate: "2019-06-15",
      },
    });
    expect(
      res.ok(),
      `Anlage ${i} anlegen fehlgeschlagen: ${await res.text()}`,
    ).toBe(true);
    const rumpf = await res.json();
    api.track({
      collection: "turbines",
      id: (rumpf.data ?? rumpf).id,
      name: bezeichnung,
    });
  }

  const gemarkung = testName("Gemarkung Abrechnung").replace(/\s+/g, "-");
  const plotRes = await page.request.post("/api/plots", {
    data: {
      parkId: park.id,
      cadastralDistrict: gemarkung,
      fieldNumber: "1",
      plotNumber: String(Date.now()).slice(-6),
      areaSqm: 50_000,
      plotAreas: [
        { areaType: "WEA_STANDORT", areaSqm: 3000 },
        { areaType: "POOL", areaSqm: 40_000 },
      ],
    },
  });
  expect(
    plotRes.ok(),
    `Flurstueck anlegen fehlgeschlagen: ${await plotRes.text()}`,
  ).toBe(true);
  const plotRumpf = await plotRes.json();
  const plot = plotRumpf.data ?? plotRumpf;
  api.track({ collection: "plots", id: plot.id, name: gemarkung });

  const verpaechter = testName("Verpaechter Abrechnung").replace(/\s+/g, "-");
  const pachtRes = await page.request.post("/api/leases", {
    data: {
      plotIds: [plot.id],
      newLessor: {
        personType: "natural",
        firstName: "E2E",
        lastName: verpaechter,
        city: "Teststadt",
      },
      startDate: "2020-01-01",
      status: "ACTIVE",
      billingInterval: "ANNUAL",
    },
  });
  expect(
    pachtRes.ok(),
    `Pachtvertrag anlegen fehlgeschlagen: ${await pachtRes.text()}`,
  ).toBe(true);
  const pachtRumpf = await pachtRes.json();
  api.track({
    collection: "leases",
    id: (pachtRumpf.data ?? pachtRumpf).id,
    name: verpaechter,
  });

  return { parkId: park.id, parkName };
}

test.describe("Pacht-Abrechnung", () => {
  test("Vorschuss durchrechnen — und der Betrag stimmt", async ({ page, api }) => {
    test.setTimeout(300_000);

    const { parkName } = await parkMitPacht(page, api);

    await page.goto("/leases/settlement/new");
    await ready(page);

    expect(await stepCount(page), "Der Assistent hat nicht vier Schritte").toBe(4);
    expect(await currentStep(page), "Beim Oeffnen muss Schritt 1 aktiv sein").toBe(0);

    const weiter = page.getByRole("button", { name: /^weiter/i }).first();
    await expect(
      weiter,
      "Weiter muesste ohne gewaehlten Park gesperrt sein",
    ).toBeDisabled();

    // --- Schritt 1: Park, Jahr, Abrechnungstyp --------------------------
    await selectOption(page, "park-select", new RegExp(parkName));

    const jahr = page.locator("#year-input");
    await must(jahr, "Jahresfeld");
    await jahr.fill("2024");

    const vorschuss = page.locator("#type-advance");
    await must(vorschuss, "Auswahl „Vorauszahlung“");
    await vorschuss.click();

    await expect(
      weiter,
      "Weiter bleibt gesperrt, obwohl Park, Jahr und Typ gesetzt sind — " +
        "vermutlich findet der Assistent den Pachtvertrag am Park nicht",
    ).toBeEnabled({ timeout: 20_000 });

    await weiter.click();
    await expect.poll(() => currentStep(page), { timeout: 15_000 }).toBe(1);

    // --- Schritt 2 → 3: hier wird angelegt und gerechnet ----------------
    // Kein Vorschau-Schritt: der Klick legt eine Abrechnung an. Die Antwort
    // wird mitgelesen, damit sie am Ende auch dann storniert wird, wenn der
    // Test dazwischen scheitert.
    const anlegen = page.waitForResponse(
      (r) =>
        r.url().includes("/api/leases/settlement") &&
        r.request().method() === "POST" &&
        !r.url().includes("/calculate"),
      { timeout: 60_000 },
    );
    // Die Berechnung gleich mit. Ohne sie meldet der Test nur „Status blieb
    // offen" und verschweigt, was der Server dazu gesagt hat — man sucht den
    // Fehler dann im Assistenten statt in der Antwort.
    const rechnen = page.waitForResponse(
      (r) => r.url().includes("/calculate") && r.request().method() === "POST",
      { timeout: 60_000 },
    );

    await page.getByRole("button", { name: /^weiter/i }).first().click();

    const angelegt = await anlegen;
    expect(
      angelegt.ok(),
      `Die Abrechnung liess sich nicht anlegen: HTTP ${angelegt.status()}\n` +
        `${await angelegt.text()}`,
    ).toBe(true);
    const angelegtRumpf = await angelegt.json();
    const abrechnungId: string =
      angelegtRumpf.settlement?.id ?? angelegtRumpf.id ?? angelegtRumpf.data?.id;
    expect(abrechnungId, "Die Antwort enthielt keine Abrechnungs-Kennung").toBeTruthy();

    try {
      const berechnet = await rechnen;
      expect(
        berechnet.ok(),
        `Die Berechnung wurde abgewiesen: HTTP ${berechnet.status()}\n` +
          `${await berechnet.text()}`,
      ).toBe(true);

      // --- Die eigentliche Pruefung: stimmt der Betrag? -----------------
      await expect
        .poll(
          async () => {
            const gelesen = await api.get<{
              data?: Record<string, unknown>;
              settlement?: Record<string, unknown>;
            }>(`/api/leases/settlement/${abrechnungId}`);
            const daten = (gelesen.data ??
              gelesen.settlement ??
              gelesen) as Record<string, unknown>;
            return String(daten.status ?? "");
          },
          {
            message:
              "Die Abrechnung erreichte den Status „berechnet“ nicht — die " +
              "Berechnung ist nicht gelaufen oder stillschweigend gescheitert",
            timeout: 60_000,
          },
        )
        .toBe("CALCULATED");

      const gelesen = await api.get<{
        data?: Record<string, unknown>;
        settlement?: Record<string, unknown>;
      }>(`/api/leases/settlement/${abrechnungId}`);
      const daten = (gelesen.data ?? gelesen.settlement ?? gelesen) as Record<
        string,
        unknown
      >;

      expect(
        Number(daten.totalWEACount),
        `Die Abrechnung zaehlt ${daten.totalWEACount} Anlagen statt ${ANLAGEN}. ` +
          `Davon haengt der ganze Vorschuss ab.`,
      ).toBe(ANLAGEN);

      expect(
        Number(daten.minimumGuaranteeEur),
        `Der Vorschuss betraegt ${daten.minimumGuaranteeEur} € statt ` +
          `${ERWARTETER_VORSCHUSS} €. Erwartet: ${MINDESTPACHT_JE_ANLAGE} € je ` +
          `Anlage × ${ANLAGEN} Anlagen ÷ ${INTERVALL_TEILER} (vierteljährlich).`,
      ).toBeCloseTo(ERWARTETER_VORSCHUSS, 2);

      // Eine Vorauszahlung kennt keine umsatzabhaengige Berechnung — sie ist
      // immer das Minimum. Stuende hier ein Wert, waere der Vorschuss aus
      // Ertraegen abgeleitet, die es fuer den Zeitraum noch gar nicht gibt.
      expect(
        Number(daten.calculatedFeeEur),
        "Bei einer Vorauszahlung darf kein umsatzabhaengiger Betrag entstehen",
      ).toBe(0);
      expect(
        daten.usedMinimum,
        "Die Abrechnung weist nicht aus, dass sie das Minimum verwendet hat",
      ).toBe(true);

      // Verteilt wird hoechstens, was da ist. Mehr waere Geld aus dem Nichts.
      expect(
        Number(daten.actualFeeEur),
        `Verteilt wurden ${daten.actualFeeEur} € bei einem Vorschuss von ` +
          `${daten.minimumGuaranteeEur} € — mehr als vorhanden`,
      ).toBeLessThanOrEqual(Number(daten.minimumGuaranteeEur) + 0.01);

      // --- Der Assistent zeigt das Ergebnis auch an ---------------------
      await expect
        .poll(() => currentStep(page), {
          message: "Der Assistent ist nach der Berechnung nicht weitergegangen",
          timeout: 30_000,
        })
        .toBe(3);
    } finally {
      // Stornieren, nicht loeschen: geloescht werden duerfen nur offene
      // Abrechnungen, und diese steht auf „berechnet". Die stornierte
      // Abrechnung bleibt bestehen — so ist es vorgesehen, der Rechenweg
      // bleibt nachvollziehbar.
      const storno = await page.request.post(
        `/api/leases/settlement/${abrechnungId}/cancel`,
        { data: { reason: "E2E-Testlauf" } },
      );
      if (!storno.ok()) {
        console.warn(
          `\n[aufraeumen] Abrechnung ${abrechnungId} liess sich nicht ` +
            `stornieren: HTTP ${storno.status()} ${(await storno.text()).slice(0, 200)}\n`,
        );
      }
    }
  });

  test("ohne Pachtvertrag am Park kommt man nicht aus Schritt 1", async ({
    page,
    api,
  }) => {
    test.setTimeout(120_000);

    // Die Gegenprobe zur Vorbedingung. Ohne sie waere unklar, ob der Test
    // oben den Pachtvertrag wirklich braucht — oder ob Schritt 1 ohnehin
    // durchlaesst und die Berechnung spaeter auf leerer Grundlage rechnet.
    const parkName = testName("Park ohne Pacht");
    const park = await api.create("parks", {
      name: parkName,
      status: "ACTIVE",
      minimumRentPerTurbine: MINDESTPACHT_JE_ANLAGE,
    });
    expect(park.id, "Park konnte nicht angelegt werden").toBeTruthy();

    await page.goto("/leases/settlement/new");
    await ready(page);

    await selectOption(page, "park-select", new RegExp(parkName));
    await page.locator("#year-input").fill("2024");
    await page.locator("#type-advance").click();

    // Bewusst grosszuegig gewartet: der Assistent laedt die Pachtvertraege
    // nach. Ein zu frueher Blick saehe „gesperrt", ohne dass das etwas
    // bedeutet.
    await page.waitForTimeout(3_000);

    await expect(
      page.getByRole("button", { name: /^weiter/i }).first(),
      "Weiter ist frei, obwohl der Park keinen Pachtvertrag hat — die " +
        "Abrechnung wuerde auf leerer Grundlage rechnen",
    ).toBeDisabled();

    expect(
      await currentStep(page),
      "Der Assistent hat trotz fehlender Pachtvertraege weitergeschaltet",
    ).toBe(0);
  });
});
