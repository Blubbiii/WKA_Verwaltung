/**
 * Präfix und Aufräum-Muster müssen zusammenpassen.
 *
 * ## Der Fehler, den das festhält
 *
 * Beide Konstanten beschreiben dieselbe Konvention — die eine erzeugt Namen,
 * die andere erkennt sie wieder. Sie standen nebeneinander und liefen
 * auseinander: das Muster verlangte acht Ziffern, die CI setzte
 * `E2E_RUN_ID=ci-<Laufnummer>`.
 *
 * Die Folge war still und vollständig: `isTestArtifact()` sagte in der CI zu
 * jedem Namen `nein`, `remove()` verweigerte jedes Löschen, und das Aufräumen
 * hat dort **nie** etwas entfernt. Kein Test schlug deshalb fehl — bis einer
 * über die Reste eines früheren stolperte.
 *
 * Das ist die unangenehmste Sorte Fehler: eine Sicherung, die abgeschaltet
 * ist und deren Abschaltung wie normaler Betrieb aussieht.
 *
 * ## Warum der Test die CI-Datei liest
 *
 * Eine Prüfung gegen eine hier hingeschriebene Beispiel-Kennung hätte den
 * Fehler nicht gefunden — ich hätte die Beispiele passend zum Muster
 * gewählt. Entscheidend ist die Kennung, die **tatsächlich gesetzt** wird.
 * Deshalb kommt sie aus `.github/workflows/ci.yml`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CLEANUP_PATTERN, PREFIX, isTestArtifact, testName } from "../../e2e/support/run-context";

/** Wie `PREFIX` gebildet wird — hier für beliebige Kennungen nachgestellt. */
function praefixFuer(runId: string): string {
  return `E2E-${runId}`;
}

describe("Praefix und Aufraeum-Muster passen zusammen", () => {
  it("das eigene Praefix wird wiedererkannt", () => {
    // Die Grundbedingung. Gilt sie nicht, raeumt die Suite ihre eigenen
    // Spuren nicht weg — und merkt es nicht.
    expect(
      isTestArtifact(testName("Park")),
      `Das Aufraeum-Muster erkennt den eigenen Namen nicht wieder. ` +
        `PREFIX="${PREFIX}", Muster=${CLEANUP_PATTERN}`,
    ).toBe(true);
  });

  it("auch nachdem Leerzeichen ersetzt wurden", () => {
    // Mehrere Tests bauen aus dem Namen eine Kennung ohne Leerzeichen
    // (Gemarkung, Gemeinde). Das darf die Wiedererkennung nicht brechen.
    expect(isTestArtifact(testName("Gemarkung").replace(/\s+/g, "-"))).toBe(true);
  });

  const KENNUNGEN = [
    ["selbst erzeugt", "20260802-ab3cd"],
    ["aus der CI", "ci-17234567890"],
    ["kurz", "x1y2z"],
    ["mit Punkten", "run.42.7"],
  ] as const;

  for (const [was, runId] of KENNUNGEN) {
    it(`Kennung ${was} ("${runId}") wird wiedererkannt`, () => {
      expect(
        isTestArtifact(`${praefixFuer(runId)} Park`),
        `Ein Lauf mit E2E_RUN_ID="${runId}" wuerde seine Spuren nicht ` +
          `wiedererkennen und nichts aufraeumen.`,
      ).toBe(true);
    });
  }

  it("die Kennung, die die CI wirklich setzt, wird wiedererkannt", () => {
    // Der eigentliche Test. Beispiele haette ich passend zum Muster gewaehlt;
    // was zaehlt, ist der Wert aus der Konfiguration.
    const workflow = readFileSync(".github/workflows/ci.yml", "utf-8");
    const zeile = /E2E_RUN_ID:\s*(\S+)/.exec(workflow);

    expect(
      zeile,
      "In .github/workflows/ci.yml steht kein E2E_RUN_ID mehr. Wenn das " +
        "Absicht ist, gehoert dieser Test angepasst — sonst laeuft die CI " +
        "wieder mit einer Kennung, die niemand geprueft hat.",
    ).toBeTruthy();

    // Die GitHub-Ausdruecke durch einen plausiblen Wert ersetzen.
    const runId = zeile![1]
      .replace(/\$\{\{\s*github\.run_id\s*\}\}/g, "17234567890")
      .replace(/\$\{\{[^}]*\}\}/g, "1234567890");

    expect(
      isTestArtifact(`${praefixFuer(runId)} Park`),
      `Die CI setzt E2E_RUN_ID="${zeile![1]}" — daraus wird das Praefix ` +
        `"${praefixFuer(runId)}", und das erkennt ${CLEANUP_PATTERN} nicht ` +
        `wieder. Das Aufraeumen wuerde in der CI nichts loeschen, ohne dass ` +
        `ein Test deshalb fehlschlaegt.`,
    ).toBe(true);
  });
});

describe("Der Riegel greift weiterhin", () => {
  // Die Gegenprobe. Ein Muster, das alles erkennt, waere schlimmer als eines,
  // das nichts erkennt: es wuerde echte Daten loeschen.
  const ECHTE_NAMEN = [
    "Testfeld Nord",
    "Windpark Cuxhaven",
    "E2E",
    "E2E ohne Bindestrich",
    "Park E2E-20260802-ab3cd",
    "",
  ];

  for (const name of ECHTE_NAMEN) {
    it(`"${name}" gilt NICHT als Testdatensatz`, () => {
      expect(
        isTestArtifact(name),
        `"${name}" wuerde vom Aufraeumen geloescht werden`,
      ).toBe(false);
    });
  }

  it("null und undefined gelten nicht als Testdatensatz", () => {
    expect(isTestArtifact(null)).toBe(false);
    expect(isTestArtifact(undefined)).toBe(false);
  });
});
