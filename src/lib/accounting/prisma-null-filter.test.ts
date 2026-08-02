/**
 * Wächter: kein `feld: null` in einer Prisma-Abfrage auf einem Feld, das im
 * Schema nicht nullbar ist.
 *
 * ## Warum es diesen Test gibt
 *
 * Im Mahnwesen stand:
 *
 * ```ts
 * AND: [{ OR: [{ dunningHold: false }, { dunningHold: null }] }, …]
 * ```
 *
 * `dunningHold` ist `Boolean @default(false)` — es kann gar nicht null sein.
 * Der zweite Zweig war also überflüssig. Er war aber nicht harmlos: Prisma 7
 * behandelt einen null-Filter auf einem nicht-nullbaren Feld nicht als „trifft
 * nichts", sondern als fehlendes Argument und **weist die ganze Abfrage ab**.
 *
 * Die Folge war ein vollständiger Ausfall. Die Abfrage liegt im gemeinsamen
 * Pfad von Kandidatenliste und Mahnlauf, also endete beides in HTTP 500 —
 * keine Mahnung war möglich, und die Oberfläche zeigte nur „Interner
 * Serverfehler".
 *
 * Solche Fehler sind besonders zäh, weil TypeScript sie nicht sieht: die
 * generierten Prisma-Typen erlauben `null` in Filtern, und der Fehler
 * entsteht erst zur Laufzeit — beim ersten echten Aufruf, also oft erst beim
 * Nutzer.
 *
 * ## Was der Test tut
 *
 * Er löst für jede Prisma-Abfrage im Quelltext das Modell auf, liest deren
 * `where`-Block und prüft die darin gefilterten Felder gegen `schema.prisma`.
 * Kommentare werden vorher entfernt — sonst schlüge der Test auf der
 * Erklärung an, die im Mahnwesen genau diese Schreibweise zitiert.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const WURZEL = join(__dirname, "..", "..", "..");

/** Modell → Feld → nullbar? Nur Skalarfelder, keine Listen. */
function schemaFelder(): Map<string, Map<string, boolean>> {
  const schema = readFileSync(join(WURZEL, "prisma", "schema.prisma"), "utf-8");
  const modelle = new Map<string, Map<string, boolean>>();
  let aktuell: Map<string, boolean> | null = null;

  for (const roh of schema.split("\n")) {
    const z = roh.trim();
    const start = /^model\s+(\w+)\s*\{/.exec(z);
    if (start) {
      aktuell = new Map();
      modelle.set(start[1], aktuell);
      continue;
    }
    if (z.startsWith("}")) {
      aktuell = null;
      continue;
    }
    if (!aktuell || z.startsWith("//") || z.startsWith("@@")) continue;

    const feld = /^(\w+)\s+(\w+)(\[\])?(\?)?/.exec(z);
    if (!feld || feld[3]) continue; // Listen ueberspringen
    aktuell.set(feld[1], Boolean(feld[4]));
  }
  return modelle;
}

/** Balancierter {…}-Block ab der öffnenden Klammer. */
function block(text: string, start: number): string {
  let tiefe = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") tiefe++;
    else if (text[i] === "}") {
      tiefe--;
      if (tiefe === 0) return text.slice(start, i + 1);
    }
  }
  return "";
}

/**
 * Kommentare entfernen. Ohne das schlaegt der Test auf jeder Erklaerung an,
 * die die falsche Schreibweise zitiert — und genau so eine steht in
 * dunning.ts, damit der Fehler nicht wiederkommt.
 */
function ohneKommentare(quelle: string): string {
  return quelle
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function dateien(verzeichnis: string, gesammelt: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    if (eintrag === "node_modules" || eintrag === ".next") continue;
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) dateien(pfad, gesammelt);
    else if (/\.tsx?$/.test(eintrag) && !/\.test\.tsx?$/.test(eintrag)) {
      gesammelt.push(pfad);
    }
  }
  return gesammelt;
}

describe("Prisma-Abfragen: keine null-Filter auf nicht-nullbaren Feldern", () => {
  it("filtert nirgends mit null auf einem Feld, das nie null sein kann", () => {
    const modelle = schemaFelder();

    // Prisma-Client schreibt das Modell klein: prisma.invoice → Invoice
    const nachClient = new Map<string, string>();
    for (const name of modelle.keys()) {
      nachClient.set(name[0].toLowerCase() + name.slice(1), name);
    }

    const funde: string[] = [];

    for (const pfad of dateien(join(WURZEL, "src"))) {
      const quelle = ohneKommentare(readFileSync(pfad, "utf-8"));
      const aufrufe = quelle.matchAll(
        /\b(?:prisma|tx|client|db)\.(\w+)\.(\w+)\s*\(\s*\{/g,
      );

      for (const aufruf of aufrufe) {
        const modellName = nachClient.get(aufruf[1]);
        if (!modellName) continue;
        const felder = modelle.get(modellName)!;

        const argStart = quelle.indexOf("{", aufruf.index! + aufruf[0].length - 1);
        const arg = block(quelle, argStart);
        const where = /\bwhere:\s*\{/.exec(arg);
        if (!where) continue;

        const woBlock = block(arg, arg.indexOf("{", where.index + where[0].length - 1));

        for (const filter of woBlock.matchAll(/(?<![\w.])(\w+):\s*null\b/g)) {
          const feld = filter[1];
          if (felder.has(feld) && felder.get(feld) === false) {
            const zeile = quelle.slice(0, aufruf.index).split("\n").length;
            funde.push(
              `${pfad.replace(WURZEL, "").replace(/\\/g, "/")}:${zeile} — ` +
                `${modellName}.${feld} ist nicht nullbar`,
            );
          }
        }
      }
    }

    expect(
      funde,
      `Diese Abfragen filtern mit null auf einem Feld, das laut schema.prisma ` +
        `nie null sein kann:\n\n${funde.join("\n")}\n\n` +
        `Prisma 7 weist so eine Abfrage nicht teilweise ab, sondern GANZ — ` +
        `jeder Aufruf endet in HTTP 500. TypeScript sieht das nicht, weil die ` +
        `generierten Filter-Typen null erlauben; der Fehler entsteht erst zur ` +
        `Laufzeit. Genau so war das Mahnwesen vollstaendig ausgefallen.\n\n` +
        `Der null-Zweig ist ueberfluessig: ist das Feld nicht nullbar, reicht ` +
        `der Vergleich mit dem tatsaechlichen Wert.`,
    ).toEqual([]);
  });
});
