/**
 * Liegengebliebenes aus früheren Läufen finden und entfernen.
 *
 * Kein Ablauf-Test — ein Werkzeug. Läuft nur, wenn man es ausdrücklich
 * anfordert:
 *
 *     E2E_CLEANUP=1 npx playwright test e2e/journeys/aufraeumen.spec.ts
 *
 * ## Wozu
 *
 * Der Aufräumer nach jedem Test greift nur, solange der Lauf ihn erreicht.
 * Ein abgebrochener Lauf, ein Fehler in der Reihenfolge, eine Sperre auf der
 * Serverseite — schon bleibt etwas liegen. Ohne ein Werkzeug dagegen sammelt
 * sich das an, und irgendwann traut sich niemand mehr, etwas zu löschen, weil
 * unklar ist, was noch gebraucht wird.
 *
 * ## Der Riegel
 *
 * Angefasst wird ausschliesslich, was das Präfix `E2E-<Datum>-<Zufall>`
 * trägt. `remove()` verweigert alles andere — auch wenn dieser Test es ihm
 * vorlegen würde. Ein Aufräumer, der „alles mit Test im Namen" löscht, trifft
 * irgendwann ein echtes „Testfeld Nord".
 *
 * ## Reihenfolge
 *
 * Von innen nach aussen: erst was auf anderes zeigt, zuletzt das, worauf
 * gezeigt wird. Andersherum sperrt die Anwendung — zu Recht.
 */

import { test, expect } from "../support/fixtures";
import { isTestArtifact } from "../support/run-context";

/** Von abhängig nach unabhängig. Die Reihenfolge ist der ganze Trick. */
const REIHENFOLGE = [
  { sammlung: "leases", feld: "id" },
  { sammlung: "contracts", feld: "title" },
  { sammlung: "plots", feld: "cadastralDistrict" },
  { sammlung: "turbines", feld: "designation" },
  { sammlung: "parks", feld: "name" },
  { sammlung: "municipalities", feld: "name" },
  { sammlung: "persons", feld: "lastName" },
] as const;

test.describe("Aufraeumen", () => {
  test("Reste frueherer Laeufe entfernen", async ({ page, api }) => {
    test.skip(
      process.env.E2E_CLEANUP !== "1",
      "Nur mit E2E_CLEANUP=1 — dieser Test loescht Daten und gehoert nicht in einen normalen Lauf",
    );
    test.setTimeout(300_000);

    const entfernt: string[] = [];
    const geblieben: string[] = [];
    const aufbewahrt: string[] = [];

    for (const { sammlung, feld } of REIHENFOLGE) {
      const antwort = await api.get<{ data?: Record<string, unknown>[] }>(
        `/api/${sammlung}?limit=500`,
      );
      const zeilen = antwort.data ?? [];

      for (const zeile of zeilen) {
        // Pachtvertraege tragen keinen eigenen Namen — dort haengt das
        // Praefix am Verpaechter.
        const bezeichnung =
          feld === "id"
            ? String(
                (zeile.lessor as { lastName?: string } | undefined)?.lastName ?? "",
              )
            : String(zeile[feld] ?? "");

        if (!isTestArtifact(bezeichnung)) continue;

        const res = await page.request.delete(
          `/api/${sammlung}/${String(zeile.id)}`,
        );
        if (res.ok()) {
          entfernt.push(`${sammlung}/${bezeichnung}`);
          continue;
        }

        const rumpf = await res.text();
        let code = "";
        try {
          code = String(JSON.parse(rumpf).code ?? "");
        } catch {
          // Kein JSON — dann bleibt der Code leer und es gilt als Fehlschlag.
        }

        if (code === "RETENTION_BLOCKED") {
          // Absicht, kein Fehlschlag: ein aufbewahrter Beleg verweist darauf.
          aufbewahrt.push(`${sammlung}/${bezeichnung}`);
        } else {
          geblieben.push(
            `${sammlung}/${bezeichnung} — HTTP ${res.status()}: ${rumpf.slice(0, 160)}`,
          );
        }
      }
    }

    test.info().annotations.push({
      type: "entfernt",
      description: entfernt.length ? entfernt.join(", ") : "nichts gefunden",
    });

    if (aufbewahrt.length > 0) {
      // Diese bleiben absichtlich. Ein Pachtvertrag wird beim Loeschen nur
      // weich geloescht — sein Verpaechter und seine Flurstuecke muessen
      // danach weiter benennbar sein (§ 147 AO). Sie zaehlen deshalb nicht
      // als Rest, den jemand beseitigen koennte.
      test.info().annotations.push({
        type: "aufbewahrt",
        description: aufbewahrt.join(", "),
      });
      console.warn(
        `\n[aufraeumen] ${aufbewahrt.length} Datensatz/Datensaetze bleiben ` +
          `absichtlich stehen — ein aufbewahrter Beleg verweist darauf:\n  ` +
          `${aufbewahrt.join("\n  ")}\n`,
      );
    }

    // Was bleibt, bleibt mit Begruendung. Ein stiller Rest ist schlimmer als
    // ein lauter: er waechst.
    expect(
      geblieben,
      `Diese Reste liessen sich nicht entfernen:\n${geblieben.join("\n")}`,
    ).toEqual([]);
  });
});
