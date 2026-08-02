/**
 * `api-errors.ts` — die Datei mit dem grössten Blast-Radius im Projekt.
 *
 * 1.398 abhängige Stellen laut Knowledge-Graph-Audit, und bis heute kein
 * einziger Test. Das ist die ungünstigste Kombination, die eine Datei haben
 * kann: alles hängt daran, und nichts hält fest, was sie zusagt.
 *
 * Angelegt beim Ergänzen von `RETENTION_BLOCKED`. Die Änderung selbst ist rein
 * additiv, aber „rein additiv" ist eine Behauptung, und bei dieser Datei
 * verlangt CLAUDE.md eine Regressionsprüfung. Drei Routen von Hand
 * anzuklicken wäre eine Stichprobe gewesen; das hier prüft den Vertrag.
 *
 * ## Was hier festgehalten wird
 *
 * Der **Vertrag** der Antwort, nicht ihre Formulierung:
 *
 *  - Jeder Code hat eine Meldung und einen Status. Fehlt einer, kommt beim
 *    Client `undefined` an, wo eine Fehlermeldung stehen sollte.
 *  - Der Rumpf trägt immer `code` und `error`. Darauf bauen 549
 *    Antwort-Behandlungen auf.
 *  - `details` erscheint nur, wenn übergeben — sonst stünde bei jedem Fehler
 *    ein leeres Feld, und Clients, die auf sein Vorhandensein prüfen, lägen
 *    falsch.
 *  - Ein übergebener Status schlägt die Voreinstellung. Sonst wäre jede
 *    Route, die bewusst einen anderen wählt, still wirkungslos.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { apiError, defaultErrorMessage, type ApiErrorCode } from "./api-errors";

/**
 * Alle Codes, die es gibt — aus dem Quelltext gelesen.
 *
 * Bewusst nicht von Hand gepflegt: eine Liste, die man nachtragen muss, ist
 * nach dem ersten neuen Code unvollständig, und der Test würde stillschweigend
 * weniger prüfen als er verspricht.
 */
function alleCodes(): ApiErrorCode[] {
  const text = readFileSync("src/lib/api-errors.ts", "utf-8");
  const block = /export type ApiErrorCode =([\s\S]*?);/.exec(text);
  if (!block) throw new Error("ApiErrorCode-Union nicht gefunden");
  return [...block[1].matchAll(/\|\s*"([A-Z_]+)"/g)].map(
    (m) => m[1] as ApiErrorCode,
  );
}

const CODES = alleCodes();

describe("Jeder Fehlercode ist vollstaendig hinterlegt", () => {
  it("es gibt ueberhaupt Codes zu pruefen", () => {
    // Sonst waeren die Schleifen unten leer und alles gruen, ohne dass etwas
    // geprueft wurde.
    expect(CODES.length).toBeGreaterThan(20);
  });

  for (const code of CODES) {
    it(`${code}: Meldung und Status`, async () => {
      const meldung = defaultErrorMessage(code);
      expect(
        meldung,
        `Fuer ${code} fehlt die deutsche Meldung — beim Client stuende dort undefined`,
      ).toBeTruthy();
      expect(typeof meldung).toBe("string");

      const antwort = apiError(code);
      expect(
        antwort.status,
        `Fuer ${code} fehlt der Vorgabe-Status`,
      ).toBeGreaterThanOrEqual(400);
      expect(antwort.status).toBeLessThan(600);

      const rumpf = await antwort.json();
      expect(rumpf.code, "Der Rumpf traegt nicht den Code").toBe(code);
      expect(rumpf.error, "Der Rumpf traegt keine Meldung").toBe(meldung);
    });
  }
});

describe("Der Antwort-Vertrag", () => {
  it("eine eigene Meldung schlaegt die Vorgabe", async () => {
    const antwort = apiError("VALIDATION_FAILED", 400, {
      message: "Titel darf nicht leer sein",
    });
    const rumpf = await antwort.json();
    expect(rumpf.error).toBe("Titel darf nicht leer sein");
    expect(rumpf.code, "Der Code darf sich durch eine eigene Meldung nicht aendern")
      .toBe("VALIDATION_FAILED");
  });

  it("ein eigener Status schlaegt die Vorgabe", () => {
    // NOT_FOUND liegt vorgabegemaess auf 404. Waere der uebergebene Wert
    // wirkungslos, blieben alle Routen mit abweichender Absicht still falsch.
    expect(apiError("NOT_FOUND").status).toBe(404);
    expect(apiError("NOT_FOUND", 400).status).toBe(400);
  });

  it("details erscheint nur, wenn es uebergeben wurde", async () => {
    const ohne = await apiError("VALIDATION_FAILED").json();
    expect(
      "details" in ohne,
      "details steht im Rumpf, obwohl nichts uebergeben wurde",
    ).toBe(false);

    const mit = await apiError("VALIDATION_FAILED", 400, {
      details: { feld: "titel" },
    }).json();
    expect(mit.details).toEqual({ feld: "titel" });
  });

  it("uebergebene Kopfzeilen kommen an", () => {
    // RATE_LIMITED ohne Retry-After zwingt jeden Client zum Raten — genau
    // dieser Fall ist der Suite schon einmal begegnet.
    const antwort = apiError("RATE_LIMITED", 429, {
      headers: { "Retry-After": "60" },
    });
    expect(antwort.headers.get("retry-after")).toBe("60");
  });

  it("details darf auch null sein und verschwindet dann nicht", async () => {
    // `undefined` heisst "nicht uebergeben", `null` ist eine Aussage. Wuerden
    // beide gleich behandelt, ginge die Unterscheidung verloren.
    const rumpf = await apiError("BAD_REQUEST", 400, { details: null }).json();
    expect("details" in rumpf).toBe(true);
    expect(rumpf.details).toBeNull();
  });
});

describe("Sprechende Voreinstellungen", () => {
  // Stichproben quer durch die Domaenen — die Vorgabe-Stati sind Teil des
  // Vertrags, auf den Clients sich verlassen.
  const ERWARTET: [ApiErrorCode, number][] = [
    ["UNAUTHORIZED", 401],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["VALIDATION_FAILED", 400],
    ["RATE_LIMITED", 429],
    ["INTERNAL_ERROR", 500],
    ["PERIOD_LOCKED", 409],
    // Neu: gesperrt, weil ein aufbewahrter Beleg darauf verweist. 409 wie
    // DEPENDENCY_EXISTS — es ist ein Konflikt mit dem Bestand, keine
    // fehlerhafte Anfrage.
    ["RETENTION_BLOCKED", 409],
  ];

  for (const [code, status] of ERWARTET) {
    it(`${code} antwortet mit ${status}`, () => {
      expect(apiError(code).status).toBe(status);
    });
  }
});
