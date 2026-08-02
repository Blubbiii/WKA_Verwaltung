/**
 * Energie-Abrechnung: durchklicken bis zur Verteilung — und nachrechnen.
 *
 * ## Warum das der wichtigste der fünf Assistenten ist
 *
 * Hier wird der Netzbetreiber-Erlös auf die Anlagen und damit auf die
 * Betreibergesellschaften verteilt. Diese Verteilung ist die Grundlage der
 * Gutschriften und geht anschliessend in die Pacht-Abrechnung ein. Ein Fehler
 * hier pflanzt sich durch die ganze Kette fort.
 *
 * ## Fünf Vorbedingungen — der Grund, warum der generische Läufer scheitert
 *
 * Schritt 1 verlangt `productionStatus.turbinesWithData > 0`. Dahinter steht
 * eine ganze Kette, die erst beim Nachbauen sichtbar wird:
 *
 *  1. ein Park,
 *  2. Anlagen darin,
 *  3. eine Betreibergesellschaft,
 *  4. eine **Betreiber-Historie** je Anlage, gültig zum Stichtag — ohne sie
 *     wird die Anlage mit `NO_OPERATOR` übersprungen,
 *  5. Produktionsdaten im Status **CONFIRMED** — Entwürfe werden mit
 *     `UNCONFIRMED_PRODUCTION` übersprungen, und `POST /api/energy/productions`
 *     legt standardmässig Entwürfe an.
 *
 * Jede dieser Stufen kann still dazu führen, dass am Ende null Anlagen
 * berücksichtigt werden. Der Assistent sagt dann „keine verwertbaren
 * Produktionsdaten" — was stimmt, aber nicht verrät, an welcher der fünf
 * Stufen es lag.
 *
 * ## Was geprüft wird
 *
 * Die Verteilung wird **nachgerechnet**. Zwei Anlagen produzieren bewusst
 * ungleich — 600.000 und 400.000 kWh — bei einem Erlös von 100.000 €:
 *
 *     Preis je kWh = 100.000 € ÷ 1.000.000 kWh = 0,10 €
 *     Anlage 1     = 60 % → 60.000 €
 *     Anlage 2     = 40 % → 40.000 €
 *
 * Ungleich ist Absicht. Bei zwei gleich grossen Anlagen wäre eine Verteilung
 * „je zur Hälfte" von einer korrekten nicht zu unterscheiden — und genau so
 * ein Fehler bliebe unentdeckt.
 *
 * ## Und weiter bis zu den Gutschriften
 *
 * Schritt 4 erzeugt echte Belege mit Nummernkreis. Ich hatte davor
 * aufgehört — auf einer Testinstanz, die vor dem Echtbetrieb ohnehin
 * zurückgesetzt wird, war das die falsche Vorsicht. Der wertvollste Teil
 * liegt dahinter: **wird der berechnete Anteil auch zum Betrag auf der
 * Gutschrift?**
 *
 * Zwischen Verteilung und Beleg liegen Steuerermittlung, Rundung und
 * Nummernvergabe. Jeder dieser Schritte kann den Betrag verändern, und keiner
 * würde dabei auffallen — eine Gutschrift über einen falschen Betrag sieht aus
 * wie eine über den richtigen.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { must, ready } from "../support/strict";
import { currentStep, selectOption, stepCount } from "../support/wizard";

/** Bewusst ungleich — eine Halbe-Halbe-Verteilung soll auffallen. */
const PRODUKTION = [600_000, 400_000];
const ERLOES_EUR = 100_000;
const JAHR = 2024;
const MONAT = 6;

const GESAMT_KWH = PRODUKTION.reduce((a, b) => a + b, 0);
const ERWARTETE_ANTEILE = PRODUKTION.map((kwh) => (kwh / GESAMT_KWH) * 100);

interface Vorbedingung {
  parkId: string;
  parkName: string;
  anlagen: { id: string; bezeichnung: string; produktion: number }[];
}

async function parkMitProduktion(
  page: import("@playwright/test").Page,
  api: import("../support/api").WpmApi,
): Promise<Vorbedingung> {
  // --- Betreibergesellschaft --------------------------------------------
  const fondsName = testName("Betreiber");
  const fonds = await api.create("funds", {
    name: fondsName,
    legalForm: "GmbH & Co. KG",
    status: "ACTIVE",
  });
  expect(fonds.id, "Betreibergesellschaft konnte nicht angelegt werden").toBeTruthy();

  // --- Park --------------------------------------------------------------
  const parkName = testName("Park Energie");
  const parkRes = await page.request.post("/api/parks", {
    data: {
      name: parkName,
      status: "ACTIVE",
      commissioningDate: "2019-06-15",
      weaSharePercentage: 10,
      poolSharePercentage: 90,
      minimumRentPerTurbine: 12_000,
      defaultDistributionMode: "PROPORTIONAL",
    },
  });
  expect(
    parkRes.ok(),
    `Park anlegen fehlgeschlagen: HTTP ${parkRes.status()}\n${await parkRes.text()}`,
  ).toBe(true);
  const parkRumpf = await parkRes.json();
  const park = parkRumpf.data ?? parkRumpf;
  api.track({ collection: "parks", id: park.id, name: parkName });

  // --- Anlagen, Betreiber-Historie und Produktion ------------------------
  const anlagen: Vorbedingung["anlagen"] = [];

  for (let i = 0; i < PRODUKTION.length; i++) {
    const bezeichnung = `${testName("WEA Energie")}-${i + 1}`;
    const res = await page.request.post("/api/turbines", {
      data: {
        parkId: park.id,
        designation: bezeichnung,
        deviceType: "WEA",
        status: "ACTIVE",
        ratedPowerKw: 3000,
        commissioningDate: "2019-06-15",
      },
    });
    expect(res.ok(), `Anlage ${i + 1} anlegen fehlgeschlagen: ${await res.text()}`).toBe(true);
    const rumpf = await res.json();
    const anlage = rumpf.data ?? rumpf;
    api.track({ collection: "turbines", id: anlage.id, name: bezeichnung });

    // Ohne Betreiber-Historie zum Stichtag wird die Anlage mit NO_OPERATOR
    // uebersprungen — und zwar still, nur mit einem Eintrag im Protokoll.
    const betreiber = await page.request.post("/api/energy/turbine-operators", {
      data: {
        turbineId: anlage.id,
        operatorFundId: fonds.id,
        ownershipPercentage: 100,
        validFrom: "2019-06-15T00:00:00.000Z",
      },
    });
    expect(
      betreiber.ok(),
      `Betreiber-Zuordnung fehlgeschlagen: HTTP ${betreiber.status()}\n${await betreiber.text()}`,
    ).toBe(true);
    // Bewusst NICHT einzeln verfolgt: die Zuordnung haengt an der Anlage und
    // verschwindet mit ihr. Der Versuch, sie vorher zu loeschen, scheitert
    // ("Aktive Betreiber-Zuordnungen koennen nicht geloescht werden") und
    // meldete drei Laeufe lang einen Rest, den es nie gab. Ein Aufraeum-
    // Bericht mit falschen Meldungen wird nicht mehr gelesen.

    // status CONFIRMED, nicht der Standard DRAFT: Entwuerfe werden bei der
    // Berechnung uebersprungen.
    const produktion = await page.request.post("/api/energy/productions", {
      data: {
        turbineId: anlage.id,
        year: JAHR,
        month: MONAT,
        productionKwh: PRODUKTION[i],
        status: "CONFIRMED",
        source: "MANUAL",
      },
    });
    expect(
      produktion.ok(),
      `Produktionsdaten anlegen fehlgeschlagen: HTTP ${produktion.status()}\n` +
        `${await produktion.text()}`,
    ).toBe(true);
    const produktionRumpf = await produktion.json();
    api.track({
      collection: "energy/productions",
      id: (produktionRumpf.data ?? produktionRumpf).id,
      name: bezeichnung,
    });

    anlagen.push({ id: anlage.id, bezeichnung, produktion: PRODUKTION[i] });
  }

  return { parkId: park.id, parkName, anlagen };
}

test.describe("Energie-Abrechnung", () => {
  test("Erloes verteilen — und die Anteile stimmen", async ({ page, api }) => {
    test.setTimeout(300_000);

    const { parkId, parkName, anlagen } = await parkMitProduktion(page, api);

    // Erst nachsehen, ob die Daten ueberhaupt da sind — vor dem Blick auf die
    // Oberflaeche. In der CI blieb "Weiter" einmal 30 Sekunden gesperrt, und
    // die Meldung liess offen, ob die Daten fehlten oder der Assistent sie
    // nicht fand. Diese Pruefung beantwortet das, bevor die Frage entsteht.
    await expect
      .poll(
        async () => {
          const antwort = await api.get<{ turbineCount?: number }>(
            `/api/energy/productions/for-settlement?parkId=${parkId}` +
              `&year=${JAHR}&month=${MONAT}&status=CONFIRMED`,
          );
          return antwort.turbineCount ?? 0;
        },
        {
          message:
            `Die API meldet keine bestaetigten Produktionsdaten fuer den Park. ` +
            `Dann liegt es an der Vorbereitung des Tests und nicht am Assistenten.`,
          timeout: 30_000,
        },
      )
      .toBe(anlagen.length);

    await page.goto("/energy/settlements/wizard");
    await ready(page);

    expect(await stepCount(page), "Der Assistent hat nicht fuenf Schritte").toBe(5);
    expect(await currentStep(page), "Beim Oeffnen muss Schritt 1 aktiv sein").toBe(0);

    const weiter = page.getByRole("button", { name: /^weiter/i }).first();
    await expect(
      weiter,
      "Weiter muesste ohne gewaehlten Park gesperrt sein",
    ).toBeDisabled();

    // --- Schritt 1: Park und Zeitraum ------------------------------------
    await selectOption(page, "wizard-park", new RegExp(parkName));
    await selectOption(page, "wizard-year", new RegExp(String(JAHR)));
    await selectOption(page, "wizard-month", /^Juni$/);

    await expect(
      weiter,
      "Weiter bleibt gesperrt, obwohl Park und Zeitraum gesetzt sind UND die " +
        "API bestaetigte Produktionsdaten meldet (oben geprueft). Der " +
        "Assistent fragt sie also falsch ab — er muss status=CONFIRMED " +
        "mitgeben, sonst bekommt er Entwuerfe.",
    ).toBeEnabled({ timeout: 30_000 });

    await weiter.click();
    await expect.poll(() => currentStep(page), { timeout: 15_000 }).toBe(1);

    // --- Schritt 2: Netzbetreiber-Daten ----------------------------------
    const produktionsfeld = page.locator("#wizard-production");
    await must(produktionsfeld, "Feld fuer die abgerechnete Produktion");
    await produktionsfeld.fill(String(GESAMT_KWH));

    const erloesfeld = page.locator("#wizard-revenue");
    await must(erloesfeld, "Feld fuer den Netzbetreiber-Erloes");
    await erloesfeld.fill(String(ERLOES_EUR));

    await expect(
      page.getByRole("button", { name: /^weiter/i }).first(),
      "Weiter bleibt gesperrt, obwohl Produktion und Erloes gesetzt sind",
    ).toBeEnabled({ timeout: 10_000 });

    // --- Schritt 2 → 3: nur weiterschalten -------------------------------
    // "Weiter" ruft handleNext(), und das schaltet ausschliesslich den
    // Schritt weiter. Ich hatte hier zuerst die Abrechnung erwartet — falsch:
    // die entsteht erst in Schritt 3 durch "Jetzt berechnen". Der Test lief
    // deshalb in einen Zeitueberlauf beim Warten auf eine Antwort, die
    // niemand angefordert hatte.
    await page.getByRole("button", { name: /^weiter/i }).first().click();
    await expect
      .poll(() => currentStep(page), {
        message: "Der Wechsel auf die Berechnung hat nicht stattgefunden",
        timeout: 15_000,
      })
      .toBe(2);

    // --- Schritt 3: hier wird angelegt und gerechnet ---------------------
    const anlegen = page.waitForResponse(
      (r) =>
        r.url().includes("/api/energy/settlements") &&
        r.request().method() === "POST" &&
        !r.url().includes("/calculate"),
      { timeout: 60_000 },
    );
    const rechnen = page.waitForResponse(
      (r) => r.url().includes("/calculate") && r.request().method() === "POST",
      { timeout: 60_000 },
    );

    const berechnen = page.getByRole("button", { name: /jetzt berechnen/i }).first();
    await must(berechnen, "Schaltflaeche „Jetzt berechnen“ in Schritt 3");
    await berechnen.click();

    const angelegt = await anlegen;
    expect(
      angelegt.ok(),
      `Die Abrechnung liess sich nicht anlegen: HTTP ${angelegt.status()}\n` +
        `${await angelegt.text()}`,
    ).toBe(true);
    const angelegtRumpf = await angelegt.json();
    const abrechnungId: string =
      angelegtRumpf.settlement?.id ?? angelegtRumpf.data?.id ?? angelegtRumpf.id;
    expect(abrechnungId, "Die Antwort enthielt keine Abrechnungs-Kennung").toBeTruthy();

    try {
      const berechnet = await rechnen;
      expect(
        berechnet.ok(),
        `Die Berechnung wurde abgewiesen: HTTP ${berechnet.status()}\n` +
          `${await berechnet.text()}`,
      ).toBe(true);

      // --- Die eigentliche Pruefung: stimmt die Verteilung? -------------
      const ergebnis = await berechnet.json();
      const rechnung = ergebnis.calculation ?? ergebnis.data?.calculation;
      expect(
        rechnung,
        "Die Antwort der Berechnung enthaelt keinen Rechenweg",
      ).toBeTruthy();

      expect(
        Number(rechnung.totalProductionKwh),
        "Die Gesamtproduktion stimmt nicht mit den erfassten Daten ueberein",
      ).toBeCloseTo(GESAMT_KWH, 0);

      expect(
        Number(rechnung.pricePerKwh),
        `Der Preis je kWh betraegt ${rechnung.pricePerKwh} statt ` +
          `${ERLOES_EUR / GESAMT_KWH} (${ERLOES_EUR} € ÷ ${GESAMT_KWH} kWh)`,
      ).toBeCloseTo(ERLOES_EUR / GESAMT_KWH, 6);

      const daten = (rechnung.turbineData ?? []) as {
        turbineId: string;
        productionKwh: number;
        productionSharePct: number;
      }[];
      expect(
        daten.length,
        `Die Verteilung beruecksichtigt ${daten.length} Anlagen statt ` +
          `${anlagen.length}. Eine uebersprungene Anlage bekommt nichts — und ` +
          `ihr Anteil verteilt sich still auf die uebrigen.`,
      ).toBe(anlagen.length);

      for (let i = 0; i < anlagen.length; i++) {
        const zeile = daten.find((d) => d.turbineId === anlagen[i].id);
        expect(
          zeile,
          `Die Anlage „${anlagen[i].bezeichnung}“ fehlt in der Verteilung`,
        ).toBeTruthy();

        expect(
          Number(zeile!.productionKwh),
          `Für „${anlagen[i].bezeichnung}“ stehen ${zeile!.productionKwh} kWh ` +
            `statt ${anlagen[i].produktion} kWh`,
        ).toBeCloseTo(anlagen[i].produktion, 0);

        expect(
          Number(zeile!.productionSharePct),
          `Der Anteil von „${anlagen[i].bezeichnung}“ betraegt ` +
            `${zeile!.productionSharePct} % statt ${ERWARTETE_ANTEILE[i]} %. ` +
            `Die Anlagen produzieren bewusst ungleich — eine Verteilung „je ` +
            `zur Haelfte" waere hier ein Fehler und kein Zufall.`,
        ).toBeCloseTo(ERWARTETE_ANTEILE[i], 2);
      }

      // Die Summe der Anteile muss 100 % ergeben. Fehlt ein Prozent, fehlt
      // jemandem Geld — und die Einzelwerte saehen dabei plausibel aus.
      const summe = daten.reduce((s, d) => s + Number(d.productionSharePct), 0);
      expect(
        summe,
        `Die Anteile summieren sich auf ${summe} % statt auf 100 %`,
      ).toBeCloseTo(100, 2);

      // --- Der Assistent zeigt das Ergebnis auch an ---------------------
      // Er bleibt dabei auf Schritt 3; erst dann erscheint dort die
      // Schaltflaeche "Weiter zu Gutschriften".
      await must(
        page.getByRole("button", { name: /weiter zu gutschriften/i }).first(),
        "Schaltflaeche „Weiter zu Gutschriften“ nach der Berechnung",
      );
      // =================================================================
      // Schritt 4: Gutschriften
      // =================================================================
      await page.getByRole("button", { name: /weiter zu gutschriften/i }).first().click();
      await expect
        .poll(() => currentStep(page), {
          message: "Der Wechsel auf die Gutschriften hat nicht stattgefunden",
          timeout: 15_000,
        })
        .toBe(3);

      const gutschriften = page.waitForResponse(
        (r) =>
          r.url().includes("/create-invoices") && r.request().method() === "POST",
        { timeout: 60_000 },
      );

      const erstellen = page
        .getByRole("button", { name: /gutschrift.*erstellen/i })
        .first();
      await must(erstellen, "Schaltflaeche zum Erstellen der Gutschriften");
      await erstellen.click();

      const belege = await gutschriften;
      expect(
        belege.ok(),
        `Gutschriften konnten nicht erstellt werden: HTTP ${belege.status()}
` +
          `${await belege.text()}`,
      ).toBe(true);

      const belegDaten = await belege.json();
      const erzeugte = (belegDaten.invoices ?? belegDaten.data?.invoices ?? []) as {
        invoiceId: string;
        amount?: number;
      }[];

      expect(
        erzeugte.length,
        "Es wurde keine Gutschrift erzeugt, obwohl die Verteilung Anteile " +
          "ausweist — die Betreibergesellschaft bekaeme nichts",
      ).toBeGreaterThan(0);

      for (const beleg of erzeugte) {
        api.track({
          collection: "invoices",
          id: beleg.invoiceId,
          name: testName("Gutschrift"),
        });
      }

      // --- Der Betrag: wird aus dem Anteil auch Geld? -------------------
      // Beide Anlagen gehoeren derselben Gesellschaft, also muss die Summe
      // aller Gutschriften dem gesamten verteilten Erloes entsprechen.
      let belegsumme = 0;
      for (const beleg of erzeugte) {
        const rechnung = await api.get<Record<string, unknown>>(
          `/api/invoices/${beleg.invoiceId}`,
        );
        const daten = (rechnung.data ?? rechnung) as Record<string, unknown>;
        expect(
          daten.invoiceType,
          "Der erzeugte Beleg ist keine Gutschrift, sondern eine Rechnung — " +
            "die Richtung des Geldflusses waere umgekehrt",
        ).toBe("CREDIT_NOTE");
        belegsumme += Number(daten.netAmount);
      }

      expect(
        belegsumme,
        `Die Gutschriften summieren sich auf ${belegsumme} € statt auf den ` +
          `verteilten Erloes von ${ERLOES_EUR} €. Zwischen Verteilung und ` +
          `Beleg liegen Steuerermittlung, Rundung und Nummernvergabe — jeder ` +
          `Schritt kann den Betrag veraendern, ohne dass es auffiele.`,
      ).toBeCloseTo(ERLOES_EUR, 2);
    } finally {
      // Erst die Gutschriften, dann die Abrechnung: mit Belegen laesst sie
      // sich nicht mehr loeschen, und das ist richtig so.
      const weg = await page.request.delete(
        `/api/energy/settlements/${abrechnungId}`,
      );
      if (!weg.ok()) {
        console.warn(
          `\n[aufraeumen] Stromabrechnung ${abrechnungId} liess sich nicht ` +
            `loeschen: HTTP ${weg.status()} ${(await weg.text()).slice(0, 200)}\n`,
        );
      }
    }
  });

  test("ohne bestaetigte Produktionsdaten kommt man nicht aus Schritt 1", async ({
    page,
    api,
  }) => {
    test.setTimeout(120_000);

    // Die Gegenprobe. Ohne sie waere unklar, ob Schritt 1 die Daten wirklich
    // verlangt — oder ob er durchlaesst und die Berechnung spaeter auf
    // leerer Grundlage rechnet.
    const parkName = testName("Park ohne Produktion");
    const park = await api.create("parks", {
      name: parkName,
      status: "ACTIVE",
      commissioningDate: "2019-06-15",
    });
    expect(park.id, "Park konnte nicht angelegt werden").toBeTruthy();

    await page.goto("/energy/settlements/wizard");
    await ready(page);

    await selectOption(page, "wizard-park", new RegExp(parkName));
    await selectOption(page, "wizard-year", new RegExp(String(JAHR)));

    // Der Assistent laedt den Produktionsstatus nach. Ein zu frueher Blick
    // saehe „gesperrt", ohne dass das etwas bedeutet.
    await page.waitForTimeout(3_000);

    await expect(
      page.getByRole("button", { name: /^weiter/i }).first(),
      "Weiter ist frei, obwohl der Park keine Produktionsdaten hat — die " +
        "Abrechnung wuerde auf leerer Grundlage rechnen",
    ).toBeDisabled();
  });
});
