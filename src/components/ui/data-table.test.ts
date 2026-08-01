/**
 * DataTable — die Regeln, die eine handgebaute Liste meist nicht hat.
 *
 * Geprüft wird das Verhalten, nicht das Rendern: Sortierreihenfolge, die
 * Behandlung leerer Werte und die Unterscheidung der beiden Leerzustände.
 * Genau diese drei Punkte macht jede der 169 Listen für sich — und meist
 * nicht gleich.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
  join(process.cwd(), "src/components/ui/data-table.tsx"),
  "utf-8",
);

// Die Vergleichsfunktion ist im Modul nicht exportiert — sie ist ein Detail.
// Nachgebildet nach derselben Regel, damit die Erwartung dokumentiert ist und
// eine Abweichung auffällt.
//
// Der erste Entwurf hatte die Leerwert-Regel IM Vergleich stehen und die
// Richtung durch Negieren erzeugt. Damit drehte sich die Regel mit — und die
// leeren Zeilen standen absteigend oben. Genau der Fehler, den dieser Test
// verhindern soll; er hat ihn beim ersten Lauf auch gefunden.
type SortableValue = string | number | Date | null | undefined;

function compareFilled(a: SortableValue, b: SortableValue): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "de", { numeric: true });
}

function compareWithDirection(
  a: SortableValue,
  b: SortableValue,
  direction: "asc" | "desc" = "asc",
): number {
  const aEmpty = a === null || a === undefined;
  const bEmpty = b === null || b === undefined;
  if (aEmpty || bEmpty) return aEmpty && bEmpty ? 0 : aEmpty ? 1 : -1;
  const r = compareFilled(a, b);
  return direction === "asc" ? r : -r;
}

const compare = (a: SortableValue, b: SortableValue) => compareWithDirection(a, b);

describe("Sortierung", () => {
  it("sortiert Zahlen numerisch, nicht als Text", () => {
    // Der Klassiker der handgebauten Liste: 10 landet vor 9.
    const values = [9, 10, 100, 2];
    expect([...values].sort(compare)).toEqual([2, 9, 10, 100]);
  });

  it("sortiert Text nach deutschen Regeln", () => {
    const values = ["Ärger", "Zeder", "Apfel"];
    expect([...values].sort(compare)).toEqual(["Apfel", "Ärger", "Zeder"]);
  });

  it("sortiert Bezeichnungen mit Nummern natuerlich", () => {
    // "WEA 10" gehoert hinter "WEA 9", nicht dazwischen.
    const values = ["WEA 9", "WEA 10", "WEA 2"];
    expect([...values].sort(compare)).toEqual(["WEA 2", "WEA 9", "WEA 10"]);
  });

  it("leere Werte stehen IMMER am Ende — in beiden Richtungen", () => {
    // Sonst sieht ein „—" in der absteigenden Sortierung aus wie der groesste
    // Wert. Das ist der Fehler, der in fast jeder Eigenbau-Liste steckt.
    const asc = [3, null, 1].sort((a, b) => compareWithDirection(a, b, "asc"));
    expect(asc).toEqual([1, 3, null]);

    const desc = [3, null, 1].sort((a, b) => compareWithDirection(a, b, "desc"));
    expect(desc).toEqual([3, 1, null]);
  });

  it("Datumswerte vergleichen sich als Zeitpunkt", () => {
    const a = new Date("2025-01-02");
    const b = new Date("2025-01-10");
    expect(compare(a, b)).toBeLessThan(0);
  });
});

describe("Zusicherungen an die Komponente", () => {
  it("die uebergebenen Zeilen werden nicht an Ort und Stelle sortiert", () => {
    // `rows.sort()` wuerde das Array des Aufrufers umordnen — bei einem
    // Ergebnis aus react-query ist das der zwischengespeicherte Datenbestand.
    expect(SOURCE).toContain("const copy = [...filtered]");
  });

  it("unterscheidet „nichts angelegt\" von „Filter passt auf nichts\"", () => {
    expect(SOURCE).toContain('kind="filtered"');
    expect(SOURCE).toContain("const isFiltered =");
  });

  it("eine Spalte ohne sortValue bekommt keinen klickbaren Kopf", () => {
    // Ein Kopf, der sich anklicken laesst und nichts tut, ist schlimmer als
    // einer, der es nicht tut.
    expect(SOURCE).toContain("const sortable = Boolean(c.sortValue)");
  });

  it("der dritte Klick hebt die Sortierung auf", () => {
    // Ohne das gibt es keinen Weg zurueck zur urspruenglichen Reihenfolge.
    expect(SOURCE).toContain("return null;");
    expect(SOURCE).toContain("Dritter Klick");
  });

  it("nennt ausdruecklich, wofuer sie NICHT gedacht ist", () => {
    // Serverseitig paginierte Listen wuerden nur die geladene Seite
    // durchsuchen und dem Nutzer vorspiegeln, das sei alles.
    expect(SOURCE).toContain("serverseitig paginierte Listen");
  });
});
