/**
 * SCADA-Import mit echten Enercon-Dateien — und die Lücke, die sich nie
 * wieder schloss.
 *
 * ## Die Daten
 *
 * Unter `src/lib/scada/__fixtures__/Loc_TEST/2026/01/` liegen echte
 * Enercon-DBF-Dateien, am 05.07.2026 aus einem Produktionspark kopiert:
 * 144 Zehn-Minuten-Werte für den 01.01.2026, Anlage 1. Der Zerleger ist
 * dagegen unit-getestet. Der **Import** war es nicht.
 *
 * ## Der Fehler, den dieser Test festhält
 *
 * Der Import löst jede Anlagennummer aus der Datei über `ScadaTurbineMapping`
 * auf. Fehlt die Zuordnung, wird der Datensatz übersprungen. Das ist richtig.
 * Falsch war, was danach geschah:
 *
 *  1. Die Datei galt trotzdem als **verarbeitet** und schob das Wasserzeichen
 *     `lastProcessedDate` auf ihren Tag vor.
 *  2. Der Lauf wurde als `PARTIAL` verbucht — obwohl kein einziger Datensatz
 *     gespeichert worden war.
 *  3. Der inkrementelle Filter zieht Läufe mit `SUCCESS` **und** `PARTIAL`
 *     heran und überspringt künftig jede Datei bis zu diesem Datum.
 *
 * Zusammen ergab das eine Falle, die im Alltag zuschnappt: ein neuer Park,
 * die SCADA-Dateien laufen bereits ein, die Zuordnung ist noch nicht
 * angelegt. Jede Nacht meldet der Import „teilweise erfolgreich" und rückt
 * das Wasserzeichen vor. Trägt jemand die Zuordnung Wochen später nach,
 * werden diese Tage **nie wieder gelesen**.
 *
 * Was bleibt, ist eine dauerhafte Lücke in den Monatswerten — und die läuft
 * still als Verteilschlüssel in die Erlösverteilung ein. Niemand sieht eine
 * Fehlermeldung; die Zahlen sehen nur etwas kleiner aus.
 *
 * ## Warum in dieser Reihenfolge
 *
 * Der Test importiert **erst ohne** Zuordnung und **dann mit**. Nur so lässt
 * sich zeigen, dass der zweite Lauf denselben Tag noch einmal anfasst. Prüfte
 * er nur den Erfolgsfall, wäre der Fehler unsichtbar geblieben — der
 * Erfolgsfall funktionierte ja.
 *
 * ## Was er zurücklässt — und warum das so bleibt
 *
 * Park und Anlage dieses Laufs lassen sich hinterher **nicht löschen**: die
 * Anlage trägt jetzt SCADA-Messwerte, und für die gibt es bewusst keinen
 * Löschweg. Messdaten sind Aufbewahrungsgut.
 *
 * Eine Anlage wiederzuverwenden geht nicht: die 144 Zeitstempel stehen fest
 * in der Datei, ein zweiter Lauf auf derselben Anlage fände lauter Dubletten
 * und importierte null — dann prüfte der Test nichts mehr.
 *
 * Der Rückstand ist deshalb Absicht und wird als solcher gekennzeichnet,
 * damit er nicht wie ein fehlgeschlagenes Aufräumen aussieht.
 */

import { test, expect } from "../support/fixtures";
import { testName } from "../support/run-context";
import { requireOrSkip } from "../support/strict";
import path from "node:path";
import { cpSync, mkdirSync, rmSync } from "node:fs";

/** Die Fixtures liegen im Repo; der Server läuft auf derselben Maschine. */
const FIXTURES = path.join(process.cwd(), "src", "lib", "scada", "__fixtures__");
const PLANT_NO = 1;
const TAG = "2026-01-01";
const ERWARTETE_WERTE = 144; // 24 h zu 10 min

interface ImportLog {
  id: string;
  status: string;
  recordsImported?: number;
  recordsSkipped?: number;
  lastProcessedDate?: string | null;
  errorDetails?: unknown;
}

/** Wartet, bis der angestossene Import nicht mehr RUNNING ist. */
async function abwarten(
  api: { get: <T>(p: string) => Promise<T> },
  logId: string,
): Promise<ImportLog> {
  let letzter: ImportLog | undefined;
  await expect
    .poll(
      async () => {
        const logs = await api.get<{ data?: ImportLog[] }>(
          "/api/energy/scada/import",
        );
        letzter = (logs.data ?? []).find((l) => l.id === logId);
        return letzter?.status ?? "WEG";
      },
      {
        message: `Der Import ${logId} kam nie zum Abschluss`,
        timeout: 120_000,
        intervals: [1000],
      },
    )
    .not.toBe("RUNNING");
  return letzter!;
}

test.describe("SCADA-Import", () => {
  test("ohne Zuordnung wird kein Tag als erledigt verbucht", async ({
    page,
    api,
  }) => {
    test.setTimeout(300_000);

    // --- Eigener Standort je Lauf ----------------------------------------
    //
    // Der Import merkt sich pro (Mandant, Standortcode, Dateityp), bis wohin
    // er gekommen ist. Liefe der Test immer unter „Loc_TEST", saehe der
    // zweite Durchlauf das Wasserzeichen des ersten und uebersprunge die
    // Datei — der Test pruefte dann den Zustand der Datenbank statt das
    // Programm. Genau daran ist er beim ersten Versuch gescheitert.
    //
    // Deshalb: die echten Enercon-Dateien in ein Verzeichnis mit eigenem
    // Standortcode kopieren. Damit gibt es weder ein altes Wasserzeichen
    // noch eine alte Zuordnung.
    const ORT = `Loc_${testName("").replace(/[^A-Za-z0-9]/g, "")}`.slice(0, 24);
    const BASIS = path.join(
      process.cwd(),
      "test-results",
      "scada-fixtures",
      ORT.replace("Loc_", ""),
    );
    mkdirSync(BASIS, { recursive: true });
    cpSync(path.join(FIXTURES, "Loc_TEST"), path.join(BASIS, ORT), {
      recursive: true,
    });

    // --- Park und Anlage, aber noch KEINE Zuordnung ----------------------
    const parkName = testName("Park SCADA");
    const park = await api.create("parks", {
      name: parkName,
      status: "ACTIVE",
      commissioningDate: "2020-01-01",
    });
    park.aufbewahrt = true; // haengt an der Anlage, die bleiben muss

    const anlagenName = testName("WEA SCADA").replace(/\s+/g, "-");
    const anlageRes = await page.request.post("/api/turbines", {
      data: {
        parkId: park.id,
        designation: anlagenName,
        deviceType: "WEA",
        status: "ACTIVE",
        ratedPowerKw: 2000,
        commissioningDate: "2020-01-01",
      },
    });
    expect(anlageRes.ok(), `Anlage anlegen: ${await anlageRes.text()}`).toBe(true);
    const anlagenRumpf = await anlageRes.json();
    const anlage = anlagenRumpf.data ?? anlagenRumpf;
    expect(anlage.id, "Die angelegte Anlage kam ohne Kennung zurueck").toBeTruthy();
    // Bleibt liegen: siehe Kopf der Datei. Messwerte sind Aufbewahrungsgut,
    // die Anlage laesst sich danach nicht mehr loeschen.
    api.track({
      collection: "turbines",
      id: anlage.id,
      name: anlagenName,
      aufbewahrt: true,
    });

    // --- Erster Lauf: die Datei parst, aber nichts laesst sich zuordnen ---
    const ersterStart = await page.request.post("/api/energy/scada/import", {
      data: { locationCode: ORT, fileType: "WSD", basePath: BASIS },
    });
    await requireOrSkip(
      ersterStart.ok(),
      `Der Import liess sich nicht starten (HTTP ${ersterStart.status()}): ` +
        `${(await ersterStart.text()).slice(0, 300)} — ohne ihn ist hier ` +
        `nichts zu pruefen`,
    );
    const ersterLauf = await ersterStart.json();
    const ersteId: string = ersterLauf.id ?? ersterLauf.jobs?.[0]?.id;
    expect(ersteId, "Der Import lieferte keine Kennung").toBeTruthy();

    const erstes = await abwarten(api, ersteId);

    // Das ist der Kern. „Teilweise erfolgreich" ist eine Beschoenigung, wenn
    // NULL Datensaetze ankamen — und sie hat Folgen: Laeufe mit PARTIAL
    // gelten dem inkrementellen Filter als Fortschritt.
    expect(
      erstes.status,
      `Der Import meldet „${erstes.status}", obwohl kein einziger Datensatz ` +
        `gespeichert werden konnte (keine Zuordnung fuer Anlage ${PLANT_NO}). ` +
        `Ein Lauf ohne jedes Ergebnis ist kein Teilerfolg — und als PARTIAL ` +
        `gilt er dem naechsten Lauf als erledigt.`,
    ).toBe("FAILED");

    expect(
      Number(erstes.recordsImported ?? 0),
      "Ohne Zuordnung darf kein Datensatz gespeichert worden sein",
    ).toBe(0);

    expect(
      erstes.lastProcessedDate ?? null,
      `Der Lauf hat das Wasserzeichen auf ${erstes.lastProcessedDate} gesetzt, ` +
        `obwohl er nichts gespeichert hat. Damit gilt der ${TAG} als erledigt ` +
        `und wird nie wieder gelesen — auch nicht, wenn die Zuordnung ` +
        `nachgetragen wird. Genau so entsteht eine dauerhafte Luecke in den ` +
        `Monatswerten, die still als Verteilschluessel weiterlaeuft.`,
    ).toBeNull();

    // --- Jetzt die Zuordnung nachtragen ----------------------------------
    const zuordnungsName = testName("Zuordnung");
    const mapRes = await page.request.post("/api/energy/scada/mappings", {
      data: {
        locationCode: ORT,
        plantNo: PLANT_NO,
        parkId: park.id,
        turbineId: anlage.id,
        description: zuordnungsName,
      },
    });
    await requireOrSkip(
      mapRes.ok(),
      `Zuordnung liess sich nicht anlegen (HTTP ${mapRes.status()}): ` +
        `${(await mapRes.text()).slice(0, 300)}`,
    );
    const mapRumpf = await mapRes.json();
    const mapping = mapRumpf.data ?? mapRumpf;
    if (mapping.id) {
      // Der Name muss das Testlauf-Praefix VORNE tragen — der Aufraeumer
      // lehnt sonst ab, und zwar zu Recht: er loescht nur, was erkennbar aus
      // diesem Lauf stammt. Mit  ("Loc_E2E-...") griff die Sperre,
      // und die Zuordnung blieb bei jedem Lauf liegen.
      api.track({
        collection: "energy/scada/mappings",
        id: mapping.id,
        name: zuordnungsName,
      });
    }

    // --- Zweiter Lauf: derselbe Tag muss noch einmal drankommen -----------
    const zweiterStart = await page.request.post("/api/energy/scada/import", {
      data: { locationCode: ORT, fileType: "WSD", basePath: BASIS },
    });
    expect(
      zweiterStart.ok(),
      `Zweiter Import abgewiesen: HTTP ${zweiterStart.status()}\n` +
        `${await zweiterStart.text()}`,
    ).toBe(true);
    const zweiterLauf = await zweiterStart.json();
    const zweiteId: string = zweiterLauf.id ?? zweiterLauf.jobs?.[0]?.id;

    const zweites = await abwarten(api, zweiteId);

    expect(
      Number(zweites.recordsImported ?? 0),
      `Der zweite Lauf hat ${zweites.recordsImported} Datensaetze gespeichert. ` +
        `Erwartet waren ${ERWARTETE_WERTE} (24 Stunden zu 10 Minuten aus der ` +
        `echten Enercon-Datei vom ${TAG}). Null bedeutet: der Tag wurde ` +
        `uebersprungen, weil ihn der erste — ergebnislose — Lauf als erledigt ` +
        `markiert hat.`,
    ).toBe(ERWARTETE_WERTE);

    expect(
      zweites.status,
      `Der zweite Lauf meldet „${zweites.status}" statt SUCCESS. PARTIAL ` +
        `bedeutet, dass etwas in die Fehlerliste gelegt wurde — beim Fund vom ` +
        `03.08.2026 war das die Monatsaggregation, die mit einem SQL-Fehler ` +
        `abbrach. Der Import sah dabei fast in Ordnung aus.`,
    ).toBe("SUCCESS");

    // --- Und die Werte stehen wirklich da ---------------------------------
    // Nicht die Erfolgsmeldung: ein Import, der nichts geschrieben hat,
    // meldet genauso „erfolgreich".
    // Das Fenster ist bewusst weiter als der Tag: Enercon schreibt einen
    // LOKALEN Kalendertag, gespeichert wird UTC. Der 01.01.2026 beginnt
    // deshalb am 31.12.2025 um 23:00 UTC. Ein Fenster von 00:00Z bis 23:59Z
    // schnitt die ersten sechs Werte ab — der Test meldete 138 statt 144 und
    // zeigte damit auf die Anwendung statt auf sich selbst.
    const messungen = await api.get<{ data?: unknown[]; total?: number }>(
      `/api/energy/scada/measurements?turbineId=${anlage.id}` +
        `&from=2025-12-31T00:00:00Z&to=2026-01-02T00:00:00Z&limit=500`,
    );
    const anzahl = messungen.total ?? (messungen.data ?? []).length;
    expect(
      anzahl,
      `Nach dem Import stehen ${anzahl} Messwerte fuer den ${TAG} in der ` +
        `Datenbank, erwartet ${ERWARTETE_WERTE}. Aus diesen Werten wird die ` +
        `Monatsproduktion aggregiert, und die ist der Verteilschluessel der ` +
        `Erloesverteilung.`,
    ).toBeGreaterThanOrEqual(ERWARTETE_WERTE);

    // --- Und der Wert, auf den es am Ende ankommt -------------------------
    //
    // Die Zehn-Minuten-Werte sind Rohmaterial. Gerechnet wird mit dem
    // MONATSWERT (TurbineProduction) — er ist der Verteilschluessel der
    // Erloesverteilung. Genau dieser Schritt war unterbrochen: die
    // Aggregation brach mit einem SQL-Fehler ab, der Import fing ihn und
    // meldete PARTIAL. Messwerte waren da, Monatswert nie.
    //
    // Deshalb wird hier bis zum Ende der Kette geprueft und nicht bei den
    // Messwerten aufgehoert.
    await expect
      .poll(
        async () => {
          const p = await api.get<{ data?: { productionKwh?: unknown }[] }>(
            `/api/energy/productions?turbineId=${anlage.id}&year=2026&month=1`,
          );
          const zeile = (p.data ?? [])[0];
          return zeile ? Number(zeile.productionKwh) : null;
        },
        {
          message:
            `Nach dem Import steht fuer Januar 2026 kein Monatswert fuer die ` +
            `Anlage in der Datenbank. Die Zehn-Minuten-Werte sind da, aber die ` +
            `Verdichtung zum Monatswert fehlt — und der Monatswert ist der ` +
            `Verteilschluessel der Erloesverteilung. Fehlt er, rechnet die ` +
            `Abrechnung diese Anlage mit null.`,
          timeout: 60_000,
        },
      )
      .toBeGreaterThan(0);

    // --- Aufraeumen -------------------------------------------------------
    //
    // Die Monatswerte muessen VOR der Anlage weg: eine Anlage mit erfassten
    // Produktionsdaten laesst sich nicht loeschen, und das ist richtig so.
    // Ohne diesen Schritt blieben Park und Anlage liegen und wuerden die
    // Listen spaeterer Testlaeufe fuellen.
    const produktionen = await api.get<{ data?: { id: string }[] }>(
      `/api/energy/productions?turbineId=${anlage.id}&limit=100`,
    );
    for (const zeile of produktionen.data ?? []) {
      await page.request.delete(`/api/energy/productions/${zeile.id}`);
    }

    // Die kopierten Dateien gehoeren dem Testlauf.
    rmSync(BASIS, { recursive: true, force: true });
  });
});
