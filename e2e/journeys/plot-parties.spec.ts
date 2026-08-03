/**
 * Eigentümer und Bewirtschafter eines Flurstücks.
 *
 * ## Warum es das gibt
 *
 * Der Eigentümer hing bisher **nur am Pachtvertrag** (`Lease.lessor`). Ein
 * Flurstück ohne Vertrag — in der Akquise etwa — hatte damit keinen. Und wer
 * die Fläche tatsächlich bestellt, kam im Datenmodell überhaupt nicht vor,
 * obwohl ihn Bauarbeiten, Zuwegung und Flurschäden treffen.
 *
 * ## Was hier geprüft wird
 *
 * Nicht „ein Eintrag entstand", sondern die drei Dinge, an denen sich diese
 * Erweiterung bewähren muss:
 *
 *  - **Der Wechsel.** Ein Eigentümerwechsel wird durch Abgrenzen und
 *    Neuanlegen abgebildet, nicht durch Überschreiben. Am Übergabetag darf
 *    genau einer gelten — nicht beide und nicht keiner.
 *  - **Die Quotensumme.** Sie ist ein Hinweis, keine Sperre. Ein halb
 *    erfasstes Grundbuch muss speicherbar bleiben, die Lücke aber sichtbar
 *    sein.
 *  - **Die Abweichung zum Vertrag.** Eigentum und Verpachtung sind zwei
 *    Tatsachen. Fallen sie auseinander, gehört das gemeldet — und nicht
 *    still zugunsten einer Seite aufgelöst.
 */

import { test, expect } from "../support/fixtures";
import type { Page } from "@playwright/test";
import { testName } from "../support/run-context";
import { requireOrSkip } from "../support/strict";

interface Eintrag {
  id: string;
  personId: string;
  sharePercent?: number;
  validFrom: string | null;
  validTo: string | null;
}

interface Flurstueck {
  id: string;
  owners: (Eintrag & { istAktuell: boolean; name: string })[];
  farmers: (Eintrag & { istAktuell: boolean; name: string })[];
  hinweise: {
    quoten: { summe: number; stimmt: boolean; hinweis: string | null };
    abweichungen: { art: string; name: string; erklaerung: string }[];
  };
}

/**
 * Legt eine Person an und merkt sie zum Aufräumen vor.
 *
 * **Vor dem Flurstück aufrufen.** Der Aufräumer arbeitet die Liste in
 * umgekehrter Anlegereihenfolge ab; eine Person, die als Eigentümer
 * eingetragen ist, lässt sich erst entfernen, wenn das Flurstück weg ist
 * (Fremdschlüssel auf RESTRICT). Wer sie später anlegt, versucht sie zuerst
 * zu löschen — und lässt sie liegen.
 */
async function person(
  page: Page,
  api: { track: (r: { collection: string; id: string; name: string }) => void },
  nachname: string,
): Promise<{ id: string; name: string }> {
  const name = testName(nachname);
  const res = await page.request.post("/api/persons", {
    data: { personType: "natural", firstName: "E2E", lastName: name },
  });
  expect(res.ok(), `Person anlegen: ${await res.text()}`).toBe(true);
  const rumpf = await res.json();
  const angelegt = (rumpf.data ?? rumpf) as { id: string };
  api.track({ collection: "persons", id: angelegt.id, name });
  return { id: angelegt.id, name: `E2E ${name}` };
}

test.describe("Flurstueck: Eigentuemer und Bewirtschafter", () => {
  test("ein Eigentuemerwechsel laesst am Uebergabetag genau einen gelten", async ({
    page,
    api,
  }) => {
    test.setTimeout(180_000);

    // Personen ZUERST — sie werden dadurch zuletzt aufgeraeumt, naemlich
    // nach dem Flurstueck, das sie festhaelt.
    const alt = await person(page, api, "Altbesitzer");
    const neu = await person(page, api, "Neubesitzer");

    const bezeichnung = testName("Gemarkung").replace(/\s+/g, "-");
    const plotRes = await page.request.post("/api/plots", {
      data: {
        cadastralDistrict: bezeichnung,
        fieldNumber: "1",
        plotNumber: String(Date.now()).slice(-6),
        areaSqm: 10000,
        status: "ACTIVE",
      },
    });
    expect(
      plotRes.ok(),
      `Flurstueck anlegen fehlgeschlagen: HTTP ${plotRes.status()}\n${await plotRes.text()}`,
    ).toBe(true);
    const plotRumpf = await plotRes.json();
    const plot = plotRumpf.data ?? plotRumpf;
    api.track({ collection: "plots", id: plot.id, name: bezeichnung });

    // Der alte Eigentuemer, abgegrenzt zum 30.06.
    const a = await page.request.post(`/api/plots/${plot.id}/owners`, {
      data: { personId: alt.id, sharePercent: 100, validTo: "2026-06-30" },
    });
    expect(a.ok(), `Alteigentuemer: ${await a.text()}`).toBe(true);

    // Der neue beginnt am FOLGETAG. Ueberschneiden sie sich, gehoerte das
    // Flurstueck an einem Tag zwei Leuten zu je 100 Prozent.
    const b = await page.request.post(`/api/plots/${plot.id}/owners`, {
      data: { personId: neu.id, sharePercent: 100, validFrom: "2026-07-01" },
    });
    expect(b.ok(), `Neueigentuemer: ${await b.text()}`).toBe(true);

    const gelesen = await api.get<Flurstueck>(`/api/plots/${plot.id}`);

    expect(
      gelesen.owners.length,
      "Beide Eintraege muessen erhalten bleiben. Wird der alte beim Wechsel " +
        "ueberschrieben, verliert eine bereits abgerechnete Periode ihre " +
        "Grundlage — und nach einem Flurschaden weiss niemand mehr, wer " +
        "damals auf der Flaeche war.",
    ).toBe(2);

    // Heute (nach dem 01.07.2026) gilt genau der neue.
    const aktuell = gelesen.owners.filter((o) => o.istAktuell);
    expect(
      aktuell.map((o) => o.personId),
      `${aktuell.length} Eigentuemer gelten heute. Es darf genau einer sein — ` +
        `ueberschneiden sich die Zeitraeume, gehoert das Flurstueck an einem ` +
        `Tag zwei Leuten zu je 100 Prozent.`,
    ).toEqual([neu.id]);

    // Die Quotenpruefung darf sich von den historischen Eintraegen nicht
    // durcheinanderbringen lassen: 100 + 100 = 200 waere ein Fehlalarm.
    expect(
      gelesen.hinweise.quoten.summe,
      `Die Quotensumme betraegt ${gelesen.hinweise.quoten.summe} %. Waehrend ` +
        `eines Wechsels stehen alter und neuer Eintrag nebeneinander — wer ` +
        `beide addiert, meldet einen Fehler, wo keiner ist.`,
    ).toBe(100);
    expect(gelesen.hinweise.quoten.stimmt).toBe(true);
  });

  test("eine Luecke in den Quoten wird gemeldet, aber nicht blockiert", async ({
    page,
    api,
  }) => {
    test.setTimeout(180_000);

    const erbe = await person(page, api, "Erbe");

    const bezeichnung = testName("Gemarkung Quote").replace(/\s+/g, "-");
    const plotRes = await page.request.post("/api/plots", {
      data: {
        cadastralDistrict: bezeichnung,
        fieldNumber: "2",
        plotNumber: String(Date.now()).slice(-6),
        areaSqm: 5000,
        status: "ACTIVE",
      },
    });
    expect(plotRes.ok(), `Flurstueck: ${await plotRes.text()}`).toBe(true);
    const plotRumpf = await plotRes.json();
    const plot = plotRumpf.data ?? plotRumpf;
    api.track({ collection: "plots", id: plot.id, name: bezeichnung });

    // Nur 50 Prozent erfasst — der zweite Erbe fehlt noch.
    const res = await page.request.post(`/api/plots/${plot.id}/owners`, {
      data: { personId: erbe.id, sharePercent: 50 },
    });
    expect(
      res.ok(),
      "Ein halb erfasstes Grundbuch muss speicherbar sein. Wer die Eingabe " +
        "blockiert, solange die Summe nicht stimmt, erzwingt erfundene Quoten " +
        "oder Notizfelder — beides ist schlechter als eine sichtbare Luecke.",
    ).toBe(true);

    const gelesen = await api.get<Flurstueck>(`/api/plots/${plot.id}`);
    expect(gelesen.hinweise.quoten.stimmt).toBe(false);
    expect(
      gelesen.hinweise.quoten.hinweis,
      "Die Luecke wurde gespeichert, aber nicht gemeldet — dann faellt sie " +
        "erst auf, wenn sich der zweite Erbe meldet",
    ).toMatch(/50/);
  });

  test("ein Verpaechter ohne Eigentumseintrag wird gemeldet", async ({
    page,
    api,
  }) => {
    test.setTimeout(240_000);

    // Der Fall, fuer den der Abgleich da ist: der Vertrag steht auf einem
    // anderen Namen als das Grundbuch. Das kann richtig sein (Niessbrauch)
    // oder ein Fehler — entscheiden muss das ein Mensch.
    const eigentuemer = await person(page, api, "Eigentuemerin");
    const verpaechter = await person(page, api, "Niessbraucher");

    const bezeichnung = testName("Gemarkung Abweichung").replace(/\s+/g, "-");
    const plotRes = await page.request.post("/api/plots", {
      data: {
        cadastralDistrict: bezeichnung,
        fieldNumber: "3",
        plotNumber: String(Date.now()).slice(-6),
        areaSqm: 8000,
        status: "ACTIVE",
      },
    });
    expect(plotRes.ok(), `Flurstueck: ${await plotRes.text()}`).toBe(true);
    const plotRumpf = await plotRes.json();
    const plot = plotRumpf.data ?? plotRumpf;
    api.track({ collection: "plots", id: plot.id, name: bezeichnung });

    await page.request.post(`/api/plots/${plot.id}/owners`, {
      data: { personId: eigentuemer.id, sharePercent: 100 },
    });

    // Ein Pachtvertrag mit dem ANDEREN als Verpaechter.
    const leaseRes = await page.request.post("/api/leases", {
      data: {
        lessorId: verpaechter.id,
        startDate: "2020-01-01",
        status: "ACTIVE",
        plotIds: [plot.id],
      },
    });
    await requireOrSkip(
      leaseRes.ok(),
      `Pachtvertrag liess sich nicht anlegen (HTTP ${leaseRes.status()}): ` +
        `${(await leaseRes.text()).slice(0, 300)} — ohne ihn gibt es nichts ` +
        `abzugleichen`,
    );
    const leaseRumpf = await leaseRes.json();
    const lease = leaseRumpf.data ?? leaseRumpf;
    api.track({ collection: "leases", id: lease.id, name: bezeichnung });

    const gelesen = await api.get<Flurstueck>(`/api/plots/${plot.id}`);

    const namen = gelesen.hinweise.abweichungen.map((a) => a.art).sort();
    expect(
      namen,
      "Weder der Eigentuemer ohne Vertrag noch der Verpaechter ohne " +
        "Eigentumseintrag wurde gemeldet. Beides gehoert einem Menschen " +
        "vorgelegt: entweder ist das Grundbuch veraltet oder der Vertrag " +
        "steht auf dem falschen Namen.",
    ).toEqual(["nur-eigentuemer", "nur-verpaechter"]);
  });

  test("der Bewirtschafter ist eine eigene Rolle", async ({ page, api }) => {
    test.setTimeout(180_000);

    const eigentuemerin = await person(page, api, "Eigentuemerin B");
    const landwirt = await person(page, api, "Landwirt");

    const bezeichnung = testName("Gemarkung Bewirtschaftung").replace(/\s+/g, "-");
    const plotRes = await page.request.post("/api/plots", {
      data: {
        cadastralDistrict: bezeichnung,
        fieldNumber: "4",
        plotNumber: String(Date.now()).slice(-6),
        areaSqm: 12000,
        status: "ACTIVE",
      },
    });
    expect(plotRes.ok(), `Flurstueck: ${await plotRes.text()}`).toBe(true);
    const plotRumpf = await plotRes.json();
    const plot = plotRumpf.data ?? plotRumpf;
    api.track({ collection: "plots", id: plot.id, name: bezeichnung });

    await page.request.post(`/api/plots/${plot.id}/owners`, {
      data: { personId: eigentuemerin.id, sharePercent: 100 },
    });
    const res = await page.request.post(`/api/plots/${plot.id}/farmers`, {
      data: { personId: landwirt.id },
    });
    expect(res.ok(), `Bewirtschafter: ${await res.text()}`).toBe(true);

    const gelesen = await api.get<Flurstueck>(`/api/plots/${plot.id}`);

    expect(
      gelesen.farmers.map((f) => f.personId),
      "Der Bewirtschafter kam nicht an",
    ).toEqual([landwirt.id]);

    // Und er ist NICHT der Eigentuemer. Wuerden beide Rollen vermischt,
    // ginge die Bauankuendigung an den Falschen — an jemanden, der die
    // Flaeche seit zwanzig Jahren nicht betreten hat.
    expect(
      gelesen.owners.map((o) => o.personId),
      "Der Bewirtschafter ist als Eigentuemer mitgezaehlt worden",
    ).toEqual([eigentuemerin.id]);

    // Ein Bewirtschafter ohne Quote: die Rolle kennt keine. Eine Flaeche
    // bestellt zu einem Zeitpunkt einer.
    expect(gelesen.farmers[0].sharePercent).toBeUndefined();
  });
});
