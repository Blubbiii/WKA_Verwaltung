/**
 * Zähler auf weich gelöschten Beziehungen — und wann sie filtern dürfen.
 *
 * ## Die Falle, in die ich selbst getappt bin
 *
 * `_count` in Prisma zählt ungefiltert. Bei einem weich gelöschten Modell
 * zählen gelöschte Zeilen mit. Vor einer **Löschsperre** sieht das nach einem
 * Fehler aus, und die Meldungen bestärkten das:
 *
 *     "Flurstück hat noch aktive Pachtverträge"   (der Pachtvertrag ist gelöscht)
 *     "wird noch verwendet (1 Pachtverträge)"     (dito)
 *
 * Ich habe daraufhin `where: { deletedAt: null }` ergänzt — und damit einen
 * echten Schaden eingebaut. Die Fremdschlüssel sagen, warum:
 *
 * | Beziehung | onDelete | Folge des Hart-Löschens |
 * |---|---|---|
 * | `LeasePlot → Plot` | **Cascade** | Der aufbewahrte Pachtvertrag verliert seine Flächen |
 * | `Lease → Person` | Restrict | HTTP 500 statt sauberer Sperre |
 * | `Contract → Park`/`Turbine` | SetNull | Der aufbewahrte Vertrag verliert seinen Bezug |
 *
 * **Weich gelöscht heisst aufbewahrt, nicht weg.** § 147 AO verlangt die
 * Aufbewahrung, und ein aufbewahrter Beleg, dessen Bezüge ins Leere zeigen,
 * ist keine Aufbewahrung. Die Sperren waren also in der Sache richtig — falsch
 * war nur ihr Wortlaut, der behauptete, es gäbe einen Weg heraus.
 *
 * ## Die Regel, die daraus folgt
 *
 * - **Löschsperren zählen ungefiltert.** Alles, worauf ein aufbewahrter
 *   Datensatz zeigt, bleibt gesperrt. Die Meldung sagt das offen, statt zu
 *   einer Aufräumarbeit aufzufordern, die nicht möglich ist.
 * - **Anzeigezähler filtern.** „3 Dokumente" bei zwei vorhandenen und einem
 *   gelöschten ist schlicht falsch — und ohne Folgen für die Datenlage.
 *
 * Dieser Test hält beide Seiten fest. Die erste Hälfte existiert vor allem,
 * damit niemand denselben Weg noch einmal geht, den ich gegangen bin.
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

/** Alle `_count: { select: { … } }`-Blöcke einer Quelle, als Rohtext. */
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

/**
 * Der Rumpf einer HTTP-Funktion — von `export async function X` bis zum
 * nächsten `export async function` oder Dateiende.
 *
 * Ohne diese Eingrenzung greift die Prüfung den falschen Block: eine Route
 * hat meist mehrere `_count`-Vorkommen, und der erste steht im GET.
 */
function funktionsrumpf(quelle: string, methode: string): string {
  const beginn = quelle.indexOf(`export async function ${methode}`);
  if (beginn < 0) return "";
  const naechste = quelle.indexOf("export async function ", beginn + 10);
  return quelle.slice(beginn, naechste < 0 ? quelle.length : naechste);
}

const ROUTEN = alleRouteDateien("src/app/api");

describe("Loeschsperren zaehlen Aufbewahrtes MIT", () => {
  const SPERREN = [
    ["src/app/api/plots/[id]/route.ts", "leasePlots", "LeasePlot.plot ist onDelete: Cascade"],
    ["src/app/api/persons/[id]/route.ts", "leases", "Lease.lessor ist Restrict — sonst HTTP 500"],
    ["src/app/api/persons/[id]/route.ts", "contracts", "Contract.partner ist SetNull"],
    ["src/app/api/parks/[id]/route.ts", "contracts", "Contract.park ist SetNull"],
    ["src/app/api/turbines/[id]/route.ts", "contracts", "Contract.turbine ist SetNull"],
  ] as const;

  for (const [datei, relation, grund] of SPERREN) {
    it(`${datei.split("/").slice(-2).join("/")}: ${relation} filtert NICHT`, () => {
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
        `${datei}: "${relation}" wird in der Loeschsperre GEFILTERT gezaehlt.\n\n` +
          `Das sieht nach der richtigen Korrektur aus und ist es nicht — ich ` +
          `habe genau das schon einmal eingebaut und zuruecknehmen muessen.\n\n` +
          `Grund hier: ${grund}. Weich geloescht heisst AUFBEWAHRT (§ 147 AO), ` +
          `nicht weg. Wird die Sperre gefiltert, laesst sie das Hart-Loeschen ` +
          `zu, und der aufbewahrte Datensatz verliert stillschweigend seinen ` +
          `Bezug — oder die Datenbank bricht mit 500 ab.\n\n` +
          `Wenn die Meldung irrefuehrend ist, gehoert die MELDUNG geaendert, ` +
          `nicht die Zaehlung.`,
      ).not.toContain("where");
    });
  }

  it("die Meldungen behaupten nicht, es gaebe einen Weg heraus", () => {
    // Der eigentliche Mangel war der Wortlaut: "hat noch AKTIVE
    // Pachtvertraege" bei einem geloeschten Pachtvertrag, oder die
    // Aufforderung, zuerst etwas zu entfernen, das sich nicht entfernen
    // laesst. Wer das liest, sucht den Fehler bei sich.
    const IRREFUEHREND = [
      ["src/app/api/plots/[id]/route.ts", /noch aktive Pachtverträge/],
      ["src/app/api/turbines/[id]/route.ts", /noch aktive Verträge/],
      ["src/app/api/parks/[id]/route.ts", /Bitte zuerst alle Verträge entfernen/],
    ] as const;

    for (const [datei, muster] of IRREFUEHREND) {
      const quelle = readFileSync(datei, "utf-8");
      expect(
        muster.test(quelle),
        `${datei} enthaelt wieder eine Meldung, die zu einer Aufraeumarbeit ` +
          `auffordert, die nicht moeglich ist: ${muster}`,
      ).toBe(false);
    }
  });
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

    // Stand 02.08.2026: 37. Darin enthalten sind die fuenf Loeschsperren
    // oben, die ABSICHTLICH ungefiltert zaehlen — der Scanner kann beides
    // nicht unterscheiden, und ein Scanner, der raet, waere schlechter als
    // eine Zahl mit Erklaerung.
    //
    // Die uebrigen sind reine Anzeigen: "3 Dokumente" bei zwei vorhandenen
    // und einem geloeschten. Falsch, aber ohne Folgen fuer die Datenlage —
    // deshalb nicht im selben Zug korrigiert.
    //
    // Die Zahl darf NICHT steigen. Wer einen neuen ANZEIGE-Zaehler auf ein
    // weich geloeschtes Modell setzt, soll hier stolpern und
    // `where: { deletedAt: null }` ergaenzen. Wer eine neue LOESCHSPERRE
    // baut, traegt sie oben in SPERREN ein und zieht diese Zahl hoch.
    expect(
      funde.length,
      `Ungefilterte Zaehler auf weich geloeschten Modellen:\n${funde.join("\n")}`,
    ).toBeLessThanOrEqual(37);
  });
});
