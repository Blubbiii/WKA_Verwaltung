/**
 * Ein vollständiger Park: Anlagen, Flurstücke, Pacht- und sonstiger Vertrag.
 *
 * ## Warum es diese Datei gibt
 *
 * Die Ablauf-Tests legten Parks an — aber leere. Ein Park ohne Anlagen ist
 * kein Park, sondern eine Hülle, und alles, was daran hängt, blieb ungeprüft:
 * Anlagendaten, Flurstücke, Pacht, Verträge. Genau die Daten, um die es in
 * diesem Programm geht.
 *
 * ## Die eigentliche Frage
 *
 * Nicht „lässt sich etwas anlegen" — das prüfen die anderen Tests längst.
 * Sondern: **kommt jedes einzelne Feld unverändert zurück.**
 *
 * Das ist der Unterschied, der zählt. Ein Feld, das beim Speichern verloren
 * geht, fällt nie beim Anlegen auf: die Maske schliesst sich, die Liste zeigt
 * einen neuen Eintrag, alles sieht richtig aus. Bemerkt wird es erst, wenn
 * jemand die Nabenhöhe braucht — Monate später, und dann ist unklar, ob sie
 * je erfasst wurde. Deshalb wird hier jedes Feld einzeln zurückgelesen und
 * verglichen, mit einer Meldung, die das Feld beim Namen nennt.
 *
 * ## Warum über die API und nicht durch die Masken
 *
 * Die Masken sind an anderer Stelle geprüft (`park-lifecycle`, `wizards`,
 * `contract-wizard`). Hier geht es um die Daten und ihre Verknüpfungen. Alles
 * durchzuklicken würde denselben Bestand aufbauen, aber bei jedem Fehlschlag
 * offenlassen, ob die Maske oder die Speicherung schuld ist.
 *
 * ## Aufräumen
 *
 * Umgekehrte Anlage-Reihenfolge — Verträge und Pacht zuerst, dann Anlagen und
 * Flurstücke, zuletzt der Park. Andersherum ginge es nicht: ein Park mit
 * Anlagen lässt sich nicht löschen, und das ist Absicht.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { must, ready } from "../support/strict";

/** Ein kleines Polygon bei Cuxhaven — geschlossen, plausible Fläche. */
function polygonBei(lon: number, lat: number) {
  const d = 0.001;
  return {
    type: "Polygon",
    coordinates: [
      [
        [lon, lat],
        [lon + d, lat],
        [lon + d, lat + d],
        [lon, lat + d],
        [lon, lat],
      ],
    ],
  };
}

test.describe("Vollstaendiger Park", () => {
  test("Park, Anlagen, Flurstuecke, Pacht und Vertrag — jedes Feld kommt zurueck", async ({
    page,
    api,
  }) => {
    test.setTimeout(300_000);

    const parkName = testName("Park vollstaendig");

    // =====================================================================
    // 1 · Gemeinde
    // =====================================================================
    // Ohne Standortgemeinde faellt die Anlage in der Zerlegung nach
    // § 29 GewStG unter "Anlage ohne Standortgemeinde". Der Park liegt
    // regelmaessig in mehreren Gemeinden — deshalb haengt sie an der Anlage
    // und nicht am Park.
    const gemeindeName = testName("Gemeinde").replace(/\s+/g, "-");
    const gemeindeRes = await page.request.post("/api/municipalities", {
      data: { name: gemeindeName, state: "Niedersachsen" },
    });
    expect(
      gemeindeRes.ok(),
      `Gemeinde anlegen fehlgeschlagen: HTTP ${gemeindeRes.status()}\n${await gemeindeRes.text()}`,
    ).toBe(true);
    const gemeindeBody = await gemeindeRes.json();
    const gemeinde = gemeindeBody.data ?? gemeindeBody;
    api.track({ collection: "municipalities", id: gemeinde.id, name: gemeindeName });

    // =====================================================================
    // 2 · Park mit allen Feldern
    // =====================================================================
    const parkEingabe = {
      name: parkName,
      shortName: `E2E${Date.now().toString().slice(-6)}`,
      description: "Vollstaendig befuellter Testpark",
      street: "Deichweg",
      houseNumber: "12a",
      postalCode: "27476",
      city: "Cuxhaven",
      country: "Deutschland",
      latitude: 53.866,
      longitude: 8.7,
      commissioningDate: "2019-06-15",
      totalCapacityKw: 10500,
      technischeBetriebsfuehrung: "E2E Technik GmbH",
      kaufmaennischeBetriebsfuehrung: "E2E Kaufmann GmbH",
      status: "ACTIVE",
      minimumRentPerTurbine: 18000,
      weaSharePercentage: 10,
      poolSharePercentage: 90,
      wegCompensationPerSqm: 0.75,
      ausgleichCompensationPerSqm: 0.35,
      kabelCompensationPerM: 4.5,
      defaultDistributionMode: "PROPORTIONAL",
      defaultTolerancePercent: 5,
    };

    const parkRes = await page.request.post("/api/parks", { data: parkEingabe });
    expect(
      parkRes.ok(),
      `Park anlegen fehlgeschlagen: HTTP ${parkRes.status()}\n${await parkRes.text()}`,
    ).toBe(true);
    const parkBody = await parkRes.json();
    const park = parkBody.data ?? parkBody;
    api.track({ collection: "parks", id: park.id, name: parkName });

    // Der Kern: jedes Feld einzeln. Ein `toMatchObject` ueber alles wuerde
    // beim ersten Unterschied abbrechen und die uebrigen verschweigen —
    // hier soll die Meldung sagen, WELCHES Feld verloren ging.
    const parkGelesen = await api.get<Record<string, unknown>>(`/api/parks/${park.id}`);
    const parkDaten = (parkGelesen.data ?? parkGelesen) as Record<string, unknown>;

    const zahlenfelder = new Set([
      "latitude",
      "longitude",
      "totalCapacityKw",
      "minimumRentPerTurbine",
      "weaSharePercentage",
      "poolSharePercentage",
      "wegCompensationPerSqm",
      "ausgleichCompensationPerSqm",
      "kabelCompensationPerM",
      "defaultTolerancePercent",
    ]);

    for (const [feld, erwartet] of Object.entries(parkEingabe)) {
      const zurueck = parkDaten[feld];
      if (feld === "commissioningDate") {
        // Datum kommt als ISO-Zeitstempel zurueck — verglichen wird der Tag.
        expect(
          String(zurueck ?? "").slice(0, 10),
          `Park-Feld "${feld}" kam veraendert zurueck`,
        ).toBe(erwartet);
      } else if (zahlenfelder.has(feld)) {
        // Decimal-Spalten kommen als String zurueck. Ein Vergleich mit
        // toBe wuerde hier scheitern, obwohl der Wert stimmt.
        expect(
          Number(zurueck),
          `Park-Feld "${feld}" kam veraendert zurueck (erwartet ${erwartet}, ` +
            `zurueck "${zurueck}")`,
        ).toBeCloseTo(Number(erwartet), 4);
      } else {
        expect(zurueck, `Park-Feld "${feld}" kam veraendert zurueck`).toBe(erwartet);
      }
    }

    // =====================================================================
    // 3 · Drei Anlagen mit allen Feldern
    // =====================================================================
    const anlagen: { id: string; eingabe: Record<string, unknown> }[] = [];

    for (let i = 1; i <= 3; i++) {
      const bezeichnung = `${testName("WEA")}-${i}`;
      const eingabe = {
        parkId: park.id,
        designation: bezeichnung,
        serialNumber: `SN-E2E-${Date.now()}-${i}`,
        mastrNumber: `SEE9${String(Date.now()).slice(-8)}${i}`,
        municipalityId: gemeinde.id,
        manufacturer: "Enercon",
        model: "E-115 EP3 E3",
        ratedPowerKw: 3500,
        hubHeightM: 149.5,
        rotorDiameterM: 115.7,
        commissioningDate: "2019-06-15",
        warrantyEndDate: "2031-06-15",
        latitude: 53.866 + i * 0.004,
        longitude: 8.7 + i * 0.004,
        status: "ACTIVE",
        technischeBetriebsfuehrung: "E2E Technik GmbH",
        kaufmaennischeBetriebsfuehrung: "E2E Kaufmann GmbH",
        notes: `Anlage ${i} aus dem Ablauf-Test`,
        minimumRent: 18000,
        weaSharePercentage: 10,
        poolSharePercentage: 90,
        technicalData: { gutachtenNr: `G-${i}`, schallreduziert: true, wea: i },
      };

      const res = await page.request.post("/api/turbines", { data: eingabe });
      expect(
        res.ok(),
        `Anlage ${i} anlegen fehlgeschlagen: HTTP ${res.status()}\n${await res.text()}`,
      ).toBe(true);
      const anlageBody = await res.json();
      const angelegt = anlageBody.data ?? anlageBody;
      api.track({ collection: "turbines", id: angelegt.id, name: bezeichnung });
      anlagen.push({ id: angelegt.id, eingabe });
    }

    // Auch hier: Feld fuer Feld. Nabenhoehe und Rotordurchmesser sind der
    // Grund fuer diese Sorgfalt — sie werden selten angesehen und faellt
    // eine davon aus, merkt es niemand.
    const anlagenZahlen = new Set([
      "ratedPowerKw",
      "hubHeightM",
      "rotorDiameterM",
      "latitude",
      "longitude",
      "minimumRent",
      "weaSharePercentage",
      "poolSharePercentage",
    ]);

    for (const { id, eingabe } of anlagen) {
      const gelesen = await api.get<Record<string, unknown>>(`/api/turbines/${id}`);
      const daten = (gelesen.data ?? gelesen) as Record<string, unknown>;

      for (const [feld, erwartet] of Object.entries(eingabe)) {
        if (feld === "parkId" || feld === "municipalityId") {
          expect(daten[feld], `Anlagen-Feld "${feld}" verweist woanders hin`).toBe(erwartet);
        } else if (feld === "technicalData") {
          expect(
            daten[feld],
            "Die freien technischen Daten kamen veraendert zurueck",
          ).toEqual(erwartet);
        } else if (feld.endsWith("Date")) {
          expect(
            String(daten[feld] ?? "").slice(0, 10),
            `Anlagen-Feld "${feld}" kam veraendert zurueck`,
          ).toBe(erwartet);
        } else if (anlagenZahlen.has(feld)) {
          expect(
            Number(daten[feld]),
            `Anlagen-Feld "${feld}" kam veraendert zurueck (erwartet ${erwartet}, ` +
              `zurueck "${daten[feld]}")`,
          ).toBeCloseTo(Number(erwartet), 4);
        } else {
          expect(daten[feld], `Anlagen-Feld "${feld}" kam veraendert zurueck`).toBe(erwartet);
        }
      }
    }

    // =====================================================================
    // 4 · Flurstuecke mit Geometrie und Teilflaechen
    // =====================================================================
    const flurstuecke: string[] = [];
    const gemarkung = testName("Gemarkung").replace(/\s+/g, "-");

    for (let i = 1; i <= 2; i++) {
      const nummer = `${String(Date.now()).slice(-6)}/${i}`;
      const res = await page.request.post("/api/plots", {
        data: {
          parkId: park.id,
          county: "Cuxhaven",
          municipality: gemeindeName,
          cadastralDistrict: gemarkung,
          fieldNumber: String(i),
          plotNumber: nummer,
          areaSqm: 42000 + i * 1000,
          usageType: "Ackerland",
          geometry: polygonBei(8.7 + i * 0.004, 53.866 + i * 0.004),
          plotAreas: [
            { areaType: "WEA_STANDORT", areaSqm: 2500 },
            { areaType: "WEG", areaSqm: 800 },
            { areaType: "KABEL", areaSqm: 300 },
          ],
        },
      });
      expect(
        res.ok(),
        `Flurstueck ${i} anlegen fehlgeschlagen: HTTP ${res.status()}\n${await res.text()}`,
      ).toBe(true);
      const plotBody = await res.json();
      const angelegt = plotBody.data ?? plotBody;
      api.track({ collection: "plots", id: angelegt.id, name: gemarkung });
      flurstuecke.push(angelegt.id);
    }

    // Die Teilflaechen sind der Grund, warum Flurstuecke hier ueberhaupt
    // vorkommen: aus ihnen wird die Pacht gerechnet. Kaeme eine davon nicht
    // zurueck, waere die Abrechnung still zu niedrig.
    const flurstueck = await api.get<Record<string, unknown>>(
      `/api/plots/${flurstuecke[0]}?includeGeometry=true`,
    );
    const fsDaten = (flurstueck.data ?? flurstueck) as Record<string, unknown>;

    expect(fsDaten.cadastralDistrict, "Die Gemarkung kam veraendert zurueck").toBe(gemarkung);
    expect(fsDaten.geometry, "Die Geometrie kam nicht zurueck").toBeTruthy();

    const teilflaechen = (fsDaten.plotAreas ?? []) as { areaType: string; areaSqm: unknown }[];
    expect(
      teilflaechen.length,
      "Die Teilflaechen kamen nicht zurueck — aus ihnen wird die Pacht gerechnet, " +
        "und ohne sie waere die Abrechnung still zu niedrig",
    ).toBe(3);
    expect(
      teilflaechen.map((t) => t.areaType).sort(),
      "Es kamen andere Teilflaechen-Arten zurueck als angelegt",
    ).toEqual(["KABEL", "WEA_STANDORT", "WEG"]);

    // =====================================================================
    // 5 · Pachtvertrag ueber die Flurstuecke
    // =====================================================================
    const verpaechter = testName("Verpaechter").replace(/\s+/g, "-");
    const pachtRes = await page.request.post("/api/leases", {
      data: {
        plotIds: flurstuecke,
        newLessor: {
          personType: "natural",
          firstName: "E2E",
          lastName: verpaechter,
          street: "Deichweg",
          houseNumber: "3",
          postalCode: "27476",
          city: "Cuxhaven",
        },
        startDate: "2019-01-01",
        endDate: "2044-12-31",
        status: "ACTIVE",
        hasExtensionOption: true,
        extensionDetails: "Zweimal fuenf Jahre",
        hasWaitingMoney: true,
        waitingMoneyAmount: 1500,
        waitingMoneyUnit: "pauschal",
        waitingMoneySchedule: "yearly",
        billingInterval: "ANNUAL",
        linkedTurbineId: anlagen[0].id,
        notes: "Pachtvertrag aus dem Ablauf-Test",
      },
    });
    expect(
      pachtRes.ok(),
      `Pachtvertrag anlegen fehlgeschlagen: HTTP ${pachtRes.status()}\n${await pachtRes.text()}`,
    ).toBe(true);
    const pachtBody = await pachtRes.json();
    const pacht = pachtBody.data ?? pachtBody;
    api.track({ collection: "leases", id: pacht.id, name: verpaechter });

    const pachtGelesen = await api.get<Record<string, unknown>>(`/api/leases/${pacht.id}`);
    const pachtDaten = (pachtGelesen.data ?? pachtGelesen) as Record<string, unknown>;

    expect(
      Number(pachtDaten.waitingMoneyAmount),
      "Das Wartegeld kam veraendert zurueck",
    ).toBeCloseTo(1500, 2);
    expect(
      pachtDaten.hasExtensionOption,
      "Die Verlaengerungsoption ging verloren",
    ).toBe(true);
    expect(
      pachtDaten.linkedTurbineId,
      "Die Verknuepfung zur Anlage ging verloren",
    ).toBe(anlagen[0].id);

    // Die Verknuepfung zu BEIDEN Flurstuecken muss stehen. Nur eines waere
    // schlimmer als keines: die Pacht rechnete dann ueber die halbe Flaeche
    // und saehe dabei richtig aus.
    const verknuepft = await api.get<{ data?: { id: string }[] }>(
      `/api/plots?parkId=${park.id}&limit=100`,
    );
    expect(
      (verknuepft.data ?? []).length,
      "Nicht beide Flurstuecke haengen am Park",
    ).toBe(2);

    // =====================================================================
    // 6 · Und jetzt: sieht man das alles auch?
    // =====================================================================
    // Bis hierhin ist bewiesen, dass die Daten in der Datenbank stehen. Das
    // nuetzt niemandem, wenn die Detailseite sie nicht zeigt.
    await page.goto(`/parks/${park.id}`);
    await ready(page);
    await must(page.locator("h1, h2").first(), "Ueberschrift der Park-Detailseite");

    await expect(
      page.locator("body"),
      "Die Detailseite nennt den Parknamen nicht",
    ).toContainText(parkName);

    for (const { eingabe } of anlagen) {
      await expect(
        page.locator("body"),
        `Die Anlage "${eingabe.designation}" fehlt auf der Detailseite des Parks`,
      ).toContainText(String(eingabe.designation), { timeout: 20_000 });
    }

    // =====================================================================
    // 7 · Zaehlt die Zerlegung nach § 29 GewStG die Anlagen mit?
    // =====================================================================
    // Der Grund, warum die Gemeinde ueberhaupt gesetzt wurde. Landen die
    // Anlagen unter "ohne Standortgemeinde", ist die Zerlegung falsch — und
    // das war schon einmal der Fall, damals wegen der virtuellen Geraete.
    interface Zerlegungszeile {
      municipalityName: string;
      turbineCount: number;
      totalRatedPowerKw: number;
    }
    const zerlegung = await api.get<{
      rows?: Zerlegungszeile[];
      withoutMunicipality?: { id: string; designation: string }[];
      data?: {
        rows?: Zerlegungszeile[];
        withoutMunicipality?: { id: string; designation: string }[];
      };
    }>("/api/regulatory/capacity-by-municipality");
    const ergebnis = zerlegung.data ?? zerlegung;

    const meine = (ergebnis.rows ?? []).find(
      (z) => z.municipalityName === gemeindeName,
    );
    expect(
      meine,
      `Die Gemeinde "${gemeindeName}" taucht in der Zerlegung nach § 29 GewStG ` +
        `nicht auf, obwohl drei Anlagen ihr zugeordnet sind`,
    ).toBeTruthy();
    expect(
      meine?.turbineCount,
      "Die Zerlegung zaehlt nicht alle drei Anlagen der Gemeinde",
    ).toBe(3);
    expect(
      Number(meine?.totalRatedPowerKw),
      "Die Leistung der drei Anlagen (3 × 3500 kW) kommt in der Zerlegung " +
        "nicht richtig an",
    ).toBeCloseTo(10500, 0);

    // Die Gegenprobe, und der eigentliche Grund fuer diesen Abschnitt: keine
    // meiner Anlagen darf unter "ohne Standortgemeinde" landen. Diese Liste
    // fehlt in JEDER Zeile oben — was dort steht, wird bei der Zerlegung
    // schlicht nicht beruecksichtigt.
    const ohneGemeinde = (ergebnis.withoutMunicipality ?? []).map((t) => t.id);
    for (const { id, eingabe } of anlagen) {
      expect(
        ohneGemeinde,
        `Die Anlage "${eingabe.designation}" steht unter "ohne Standortgemeinde", ` +
          `obwohl ihr eine zugeordnet wurde — sie faellt damit aus der ` +
          `Zerlegung nach § 29 GewStG heraus`,
      ).not.toContain(id);
    }

    // =====================================================================
    // 8 · Betriebsfuehrungsvertrag am Park
    // =====================================================================
    // Zuletzt, weil er als einziger nicht zum INHALT des Parks gehoert —
    // die Detailseite und die Zerlegung nach § 29 GewStG interessieren sich
    // fuer Anlagen und Flaechen, nicht fuer Vertraege. Nebenbei laeuft damit
    // alles davor auch gegen einen Server, dem die `.nullable()`-Korrektur
    // im Vertragsschema noch fehlt: `endDate: null` ist genau die Nutzlast,
    // an der das Anlegen bisher scheiterte, und bleibt deshalb so stehen.
    const vertragTitel = testName("Betriebsfuehrung");
    const vertragRes = await page.request.post("/api/contracts", {
      data: {
        contractType: "SERVICE",
        title: vertragTitel,
        contractNumber: `E2E-${Date.now().toString().slice(-6)}`,
        startDate: "2019-06-15",
        endDate: null,
        noticePeriodMonths: 6,
        autoRenewal: true,
        renewalPeriodMonths: 12,
        annualValue: 42000,
        paymentTerms: null,
        status: "ACTIVE",
        parkId: park.id,
      },
    });
    expect(
      vertragRes.ok(),
      `Vertrag anlegen fehlgeschlagen: HTTP ${vertragRes.status()}\n${await vertragRes.text()}`,
    ).toBe(true);
    const vertragBody = await vertragRes.json();
    const vertrag = vertragBody.data ?? vertragBody;
    api.track({ collection: "contracts", id: vertrag.id, name: vertragTitel });

    const vertragGelesen = await api.get<Record<string, unknown>>(
      `/api/contracts/${vertrag.id}`,
    );
    const vertragDaten = (vertragGelesen.data ?? vertragGelesen) as Record<string, unknown>;

    // `park` als Objekt, nicht `parkId`. Ich hatte zuerst auf `parkId`
    // geprueft — die Route liefert stattdessen `park: { id, name, shortName }`.
    // Der Vertrag hing sehr wohl am Park; ich habe das falsche Feld gelesen.
    const verknuepfterPark = vertragDaten.park as { id?: string } | null;
    expect(
      verknuepfterPark?.id,
      "Der Vertrag haengt nicht am Park",
    ).toBe(park.id);
    expect(
      Number(vertragDaten.annualValue),
      "Der Jahreswert des Vertrags kam veraendert zurueck",
    ).toBeCloseTo(42000, 2);
  });

  test("ein Park mit Anlagen laesst sich nicht loeschen, ohne sie vorher zu entfernen", async ({
    page,
    api,
  }) => {
    // Die Reihenfolge, an der der Aufraeumer vorher gescheitert waere. Der
    // Test haelt fest, dass die Sperre greift UND dass es einen Weg gibt,
    // sie aufzuloesen — eine Sperre ohne Ausweg waere eine Sackgasse.
    const name = testName("Park abbau");
    const park = await api.create("parks", { name, status: "ACTIVE" });

    const bezeichnung = testName("WEA abbau");
    const res = await page.request.post("/api/turbines", {
      data: { parkId: park.id, designation: bezeichnung, status: "ACTIVE" },
    });
    expect(res.ok(), `Anlage anlegen fehlgeschlagen: ${await res.text()}`).toBe(true);
    const anlageBody = await res.json();
    const anlage = anlageBody.data ?? anlageBody;

    const gesperrt = await page.request.delete(`/api/parks/${park.id}`);
    expect(
      gesperrt.status(),
      "Ein Park mit Anlage darf nicht loeschbar sein",
    ).toBe(400);

    // Anlage weg, dann geht der Park.
    const anlageWeg = await page.request.delete(`/api/turbines/${anlage.id}`);
    expect(
      anlageWeg.ok(),
      `Anlage loeschen fehlgeschlagen: ${await anlageWeg.text()}`,
    ).toBe(true);

    const parkWeg = await page.request.delete(`/api/parks/${park.id}`);
    expect(
      parkWeg.ok(),
      `Der Park liess sich auch nach dem Entfernen der Anlage nicht loeschen: ` +
        `HTTP ${parkWeg.status()}\n${await parkWeg.text()}`,
    ).toBe(true);

    api.untrack(park.id);
  });
});
