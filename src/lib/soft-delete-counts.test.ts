/**
 * Zähler, die weich gelöschte Datensätze mitzählen.
 *
 * ## Der Fehler, den das festhält
 *
 * `_count` in Prisma zählt ungefiltert. Bei einem weich gelöschten Modell
 * heisst das: gelöschte Zeilen zählen mit. Steht so ein Zähler vor einer
 * **Löschsperre**, wird die Sperre zur Sackgasse — der Datensatz ist gelöscht
 * und blockiert trotzdem weiter, mit einer Meldung, die dem Zustand
 * widerspricht:
 *
 *     "Flurstück hat noch aktive Pachtverträge"   (der Pachtvertrag ist gelöscht)
 *     "wird noch verwendet (1 Pachtverträge)"     (dito)
 *
 * Gefunden hat das der Aufräumer der Ablauf-Suite: nach dem Löschen eines
 * Pachtvertrags liessen sich weder seine Flurstücke noch sein Verpächter
 * jemals wieder entfernen. Das trifft echte Nutzer genauso — es gibt keinen
 * Weg heraus, weil der Zustand, den die Meldung verlangt, schon hergestellt
 * ist.
 *
 * ## Zwei verschiedene Schweregrade
 *
 * Ein Zähler vor einer Sperre ist eine Sackgasse. Ein Zähler in einer Anzeige
 * ist bloss eine falsche Zahl — ärgerlich, aber ohne Folgen. Dieser Test
 * behandelt beide getrennt: die Sperren müssen sauber sein, die Anzeigen sind
 * eine Schuldenliste, die nicht wachsen darf.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Modelle mit `deletedAt` — siehe SOFT_DELETE_MODELS in lib/prisma.ts. */
const WEICH_GELOESCHT = [
  "invoices",
  "journalEntries",
  "crmActivities",
  "parks",
  "funds",
  "leases",
  "contracts",
  "documents",
];

function alleRouteDateien(verzeichnis: string): string[] {
  const treffer: string[] = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) {
      treffer.push(...alleRouteDateien(pfad));
    } else if (eintrag === "route.ts") {
      treffer.push(pfad);
    }
  }
  return treffer;
}

/** Alle `_count: { select: { … } }`-Blöcke einer Datei, als Rohtext. */
function zaehlerbloecke(quelle: string): string[] {
  const bloecke: string[] = [];
  const start = /_count:\s*\{\s*select:\s*\{/g;
  while (start.exec(quelle) !== null) {
    // Ab der öffnenden Klammer des select-Objekts bis zu ihrer passenden
    // schliessenden. Klammern zählen statt regex — verschachtelte `where`
    // machen ein einfaches Muster sonst falsch.
    let i = start.lastIndex - 1;
    let tiefe = 0;
    for (; i < quelle.length; i++) {
      if (quelle[i] === "{") tiefe++;
      else if (quelle[i] === "}") {
        tiefe--;
        if (tiefe === 0) break;
      }
    }
    bloecke.push(quelle.slice(start.lastIndex, i));
  }
  return bloecke;
}

/** Relationen, die in diesem Block ohne `where` gezählt werden. */
function ungefiltert(block: string): string[] {
  return WEICH_GELOESCHT.filter((relation) => {
    const zeile = new RegExp(`\\b${relation}\\s*:\\s*([^,\\n]*)`).exec(block);
    if (!zeile) return false;
    return !zeile[1].includes("where");
  });
}

const ROUTEN = alleRouteDateien("src/app/api");

/**
 * Der Rumpf einer HTTP-Funktion — von `export async function X` bis zum
 * nächsten `export async function` oder Dateiende.
 *
 * Ohne diese Eingrenzung greift die Prüfung den falschen Block: eine Route
 * hat meist mehrere `_count`-Vorkommen, und der erste steht im GET. Mein
 * erster Versuch prüfte genau den — und meldete die Sperre als kaputt,
 * obwohl sie korrekt war.
 */
function funktionsrumpf(quelle: string, methode: string): string {
  const beginn = quelle.indexOf(`export async function ${methode}`);
  if (beginn < 0) return "";
  const naechste = quelle.indexOf("export async function ", beginn + 10);
  return quelle.slice(beginn, naechste < 0 ? quelle.length : naechste);
}

describe("Loeschsperren zaehlen nichts Geloeschtes mit", () => {
  // Die Sperren, an denen es hing. Jede blockierte einen Datensatz dauerhaft,
  // nachdem das, worauf sie verweist, laengst geloescht war.
  const SPERREN = [
    ["src/app/api/plots/[id]/route.ts", "leasePlots"],
    ["src/app/api/persons/[id]/route.ts", "leases"],
    ["src/app/api/persons/[id]/route.ts", "contracts"],
    ["src/app/api/parks/[id]/route.ts", "contracts"],
    ["src/app/api/turbines/[id]/route.ts", "contracts"],
  ] as const;

  for (const [datei, relation] of SPERREN) {
    it(`${datei.split("/").slice(-2).join("/")}: ${relation} filtert Geloeschtes heraus`, () => {
      const rumpf = funktionsrumpf(readFileSync(datei, "utf-8"), "DELETE");
      expect(rumpf, `Kein DELETE in ${datei}`).not.toBe("");

      const zeile = zaehlerbloecke(rumpf)
        .map((b) => new RegExp(`\\b${relation}\\s*:\\s*([^,\\n]*)`).exec(b)?.[1])
        .find(Boolean);

      expect(
        zeile,
        `${relation} kommt im DELETE-Zaehler von ${datei} nicht vor`,
      ).toBeTruthy();
      expect(
        zeile,
        `${datei}: "${relation}" wird in der Loeschsperre ohne where gezaehlt. ` +
          `Weich geloeschte Datensaetze zaehlen dann mit, und die Sperre wird ` +
          `zur Sackgasse — geloescht und trotzdem blockiert.`,
      ).toContain("where");
    });
  }
});

describe("Anzeigezaehler — Schuldenliste", () => {
  it("nicht mehr ungefilterte Zaehler als bekannt", () => {
    const funde: string[] = [];

    for (const datei of ROUTEN) {
      const quelle = readFileSync(datei, "utf-8");
      for (const block of zaehlerbloecke(quelle)) {
        for (const relation of ungefiltert(block)) {
          funde.push(`${datei.replace(/\\/g, "/")}: ${relation}`);
        }
      }
    }

    // Stand 02.08.2026: 32. Ich hatte 15 geschaetzt — die Zahl steht hier,
    // weil sie gemessen und nicht geraten gehoert.
    //
    // Diese Zaehler loesen keine Sperre aus. Sie zeigen nur eine zu hohe Zahl
    // an, etwa "3 Dokumente" bei zwei vorhandenen und einem geloeschten.
    // Aergerlich, aber ohne Folgen — deshalb nicht im selben Zug mit den
    // Sperren korrigiert, wo eine zu hohe Zahl eine Sackgasse erzeugt.
    //
    // Die Zahl darf NICHT steigen. Wer einen neuen Zaehler auf ein weich
    // geloeschtes Modell setzt, soll hier stolpern und `where: { deletedAt:
    // null }` ergaenzen — und wer einen alten korrigiert, zieht die Schranke
    // mit nach unten.
    expect(
      funde.length,
      `Ungefilterte Zaehler auf weich geloeschten Modellen:\n${funde.join("\n")}`,
    ).toBeLessThanOrEqual(32);
  });
});
