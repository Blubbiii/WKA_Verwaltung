/**
 * A5: Aufteilung auf mehrere Verpächter nach Quote und Stichtag.
 *
 * Diese Zahlen werden zu Gutschriften auf verschiedene Konten und zu
 * getrennten Umsatzsteuersubjekten. Eine Lücke in den Anteilen ordnet Geld
 * still falsch zu — das halten diese Tests fest.
 */

import { describe, it, expect } from "vitest";
import { splitByLessor, validateShares, type LessorShare } from "./share-split";

/** UTC-Datum, damit kein Zeitzonenversatz die Tagesgrenzen verschiebt. */
function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const YEAR_2026 = { periodStart: d("2026-01-01"), periodEnd: d("2026-12-31") };

describe("Ein Verpächter", () => {
  it("bekommt alles", () => {
    const result = splitByLessor({
      ...YEAR_2026,
      amountEur: 12_000,
      shares: [{ personId: "A", sharePercent: 100, validFrom: null, validTo: null }],
    });
    expect(result.allocations).toEqual([
      { personId: "A", amountEur: 12_000, days: 365, effectiveSharePercent: 100 },
    ]);
  });
});

describe("Erbengemeinschaft ohne Wechsel", () => {
  it("teilt nach Quote", () => {
    const result = splitByLessor({
      ...YEAR_2026,
      amountEur: 12_000,
      shares: [
        { personId: "A", sharePercent: 50, validFrom: null, validTo: null },
        { personId: "B", sharePercent: 30, validFrom: null, validTo: null },
        { personId: "C", sharePercent: 20, validFrom: null, validTo: null },
      ],
    });
    if (result.allocations === null) throw new Error(result.reason);
    expect(result.allocations.map((a) => a.amountEur)).toEqual([6_000, 3_600, 2_400]);
  });

  it("kommt mit Drittelquoten zurecht", () => {
    // 1/3 = 33,33 % — die Summe ist 99,99 % und liegt in der Toleranz.
    const result = splitByLessor({
      ...YEAR_2026,
      amountEur: 1_000,
      shares: [
        { personId: "A", sharePercent: 33.33, validFrom: null, validTo: null },
        { personId: "B", sharePercent: 33.33, validFrom: null, validTo: null },
        { personId: "C", sharePercent: 33.34, validFrom: null, validTo: null },
      ],
    });
    if (result.allocations === null) throw new Error(result.reason);
    const sum = result.allocations.reduce((s, a) => s + a.amountEur, 0);
    // Die Summe muss EXAKT stimmen — ein Cent, der nirgends steht, faellt in
    // der Buchhaltung auf.
    expect(Math.round(sum * 100) / 100).toBe(1_000);
  });

  it("die Summe stimmt auch bei sieben gleichen Anteilen", () => {
    const shares: LessorShare[] = Array.from({ length: 7 }, (_, i) => ({
      personId: `P${i}`,
      sharePercent: 100 / 7,
      validFrom: null,
      validTo: null,
    }));
    const result = splitByLessor({ ...YEAR_2026, amountEur: 1_000, shares });
    if (result.allocations === null) throw new Error(result.reason);
    const sum = result.allocations.reduce((s, a) => s + a.amountEur, 0);
    expect(Math.round(sum * 100) / 100).toBe(1_000);
  });
});

describe("Eigentümerwechsel zum Stichtag", () => {
  it("teilt zeitanteilig", () => {
    // A verkauft zum 30.06. an B. 2026 hat 365 Tage, davon 181 bis zum 30.06.
    const result = splitByLessor({
      ...YEAR_2026,
      amountEur: 36_500,
      shares: [
        { personId: "A", sharePercent: 100, validFrom: null, validTo: d("2026-06-30") },
        { personId: "B", sharePercent: 100, validFrom: d("2026-07-01"), validTo: null },
      ],
    });
    if (result.allocations === null) throw new Error(result.reason);

    const a = result.allocations.find((x) => x.personId === "A")!;
    const b = result.allocations.find((x) => x.personId === "B")!;
    expect(a.days).toBe(181);
    expect(b.days).toBe(184);
    expect(a.amountEur).toBe(18_100);
    expect(b.amountEur).toBe(18_400);
    expect(a.amountEur + b.amountEur).toBe(36_500);
  });

  it("der Wechseltag selbst gehoert dem Erwerber", () => {
    // validTo 30.06. heisst: A ist bis EINSCHLIESSLICH 30.06. beteiligt.
    const result = splitByLessor({
      periodStart: d("2026-06-29"),
      periodEnd: d("2026-07-02"),
      amountEur: 400,
      shares: [
        { personId: "A", sharePercent: 100, validFrom: null, validTo: d("2026-06-30") },
        { personId: "B", sharePercent: 100, validFrom: d("2026-07-01"), validTo: null },
      ],
    });
    if (result.allocations === null) throw new Error(result.reason);
    expect(result.allocations.find((x) => x.personId === "A")!.days).toBe(2);
    expect(result.allocations.find((x) => x.personId === "B")!.days).toBe(2);
  });

  it("Quote UND Zeit wirken zusammen", () => {
    // Genau das macht niemand von Hand richtig: A haelt das ganze Jahr 50 %.
    // Die anderen 50 % gehen zur Jahresmitte von B auf C ueber.
    const result = splitByLessor({
      ...YEAR_2026,
      amountEur: 36_500,
      shares: [
        { personId: "A", sharePercent: 50, validFrom: null, validTo: null },
        { personId: "B", sharePercent: 50, validFrom: null, validTo: d("2026-06-30") },
        { personId: "C", sharePercent: 50, validFrom: d("2026-07-01"), validTo: null },
      ],
    });
    if (result.allocations === null) throw new Error(result.reason);

    const a = result.allocations.find((x) => x.personId === "A")!;
    const b = result.allocations.find((x) => x.personId === "B")!;
    const c = result.allocations.find((x) => x.personId === "C")!;

    expect(a.amountEur).toBe(18_250);
    expect(b.amountEur).toBe(9_050);
    expect(c.amountEur).toBe(9_200);
    expect(a.amountEur + b.amountEur + c.amountEur).toBe(36_500);
  });

  it("ein Wechsel wird als Hinweis ausgewiesen", () => {
    const result = splitByLessor({
      ...YEAR_2026,
      amountEur: 1_000,
      shares: [
        { personId: "A", sharePercent: 100, validFrom: null, validTo: d("2026-06-30") },
        { personId: "B", sharePercent: 100, validFrom: d("2026-07-01"), validTo: null },
      ],
    });
    if (result.allocations === null) throw new Error(result.reason);
    expect(result.segmentCount).toBe(2);
    expect(result.warnings.some((w) => w.includes("Eigentümerwechsel"))).toBe(true);
  });

  it("Anteile ausserhalb des Zeitraums bleiben unberuecksichtigt", () => {
    const result = splitByLessor({
      ...YEAR_2026,
      amountEur: 1_000,
      shares: [
        { personId: "A", sharePercent: 100, validFrom: null, validTo: null },
        // Ein Anteil, der erst 2027 beginnt, darf 2026 nichts bekommen.
        { personId: "Z", sharePercent: 100, validFrom: d("2027-01-01"), validTo: null },
      ],
    });
    if (result.allocations === null) throw new Error(result.reason);
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].personId).toBe("A");
  });
});

describe("Was NICHT still durchgeht", () => {
  it("eine Luecke in den Anteilen wird abgewiesen", () => {
    // 50 % + 30 % = 80 %. Wuerde man das verteilen, fehlten 20 % des Geldes —
    // und niemand merkte es, bis ein Miteigentuemer sich meldet.
    const result = splitByLessor({
      ...YEAR_2026,
      amountEur: 10_000,
      shares: [
        { personId: "A", sharePercent: 50, validFrom: null, validTo: null },
        { personId: "B", sharePercent: 30, validFrom: null, validTo: null },
      ],
    });
    expect(result.allocations).toBeNull();
    if (result.allocations !== null) throw new Error("unerwartet");
    expect(result.reason).toContain("80.00 % statt 100 %");
  });

  it("eine Ueberschneidung wird abgewiesen", () => {
    // Verkaeufer und Erwerber ueberlappen um einen Tag → 200 % an diesem Tag.
    const result = splitByLessor({
      ...YEAR_2026,
      amountEur: 10_000,
      shares: [
        { personId: "A", sharePercent: 100, validFrom: null, validTo: d("2026-07-01") },
        { personId: "B", sharePercent: 100, validFrom: d("2026-07-01"), validTo: null },
      ],
    });
    expect(result.allocations).toBeNull();
    if (result.allocations !== null) throw new Error("unerwartet");
    expect(result.reason).toContain("200.00 %");
  });

  it("eine zeitliche Luecke wird benannt", () => {
    // A endet am 30.06., B beginnt erst am 02.07. — der 01.07. gehoert
    // niemandem.
    const result = splitByLessor({
      ...YEAR_2026,
      amountEur: 10_000,
      shares: [
        { personId: "A", sharePercent: 100, validFrom: null, validTo: d("2026-06-30") },
        { personId: "B", sharePercent: 100, validFrom: d("2026-07-02"), validTo: null },
      ],
    });
    expect(result.allocations).toBeNull();
    if (result.allocations !== null) throw new Error("unerwartet");
    expect(result.reason).toContain("01.07.2026");
  });

  it("ohne Verpaechter kommt null", () => {
    const result = splitByLessor({ ...YEAR_2026, amountEur: 1_000, shares: [] });
    expect(result.allocations).toBeNull();
  });

  it("ein umgedrehter Zeitraum wird abgewiesen", () => {
    const result = splitByLessor({
      periodStart: d("2026-12-31"),
      periodEnd: d("2026-01-01"),
      amountEur: 1_000,
      shares: [{ personId: "A", sharePercent: 100, validFrom: null, validTo: null }],
    });
    expect(result.allocations).toBeNull();
  });
});

describe("Sommerzeit", () => {
  it("ein Zeitraum ueber die Zeitumstellung zaehlt volle Tage", () => {
    // Mit Zeitstempeln statt Tagesgrenzen haette der 29.03.2026 nur 23 Stunden
    // und die Verteilung verschoebe sich um Cent-Betraege.
    const result = splitByLessor({
      periodStart: d("2026-03-28"),
      periodEnd: d("2026-03-31"),
      amountEur: 400,
      shares: [{ personId: "A", sharePercent: 100, validFrom: null, validTo: null }],
    });
    if (result.allocations === null) throw new Error(result.reason);
    expect(result.allocations[0].days).toBe(4);
    expect(result.allocations[0].amountEur).toBe(400);
  });
});

describe("validateShares — Pruefung beim Erfassen", () => {
  it("meldet eine fehlende Quote", () => {
    const problems = validateShares([
      { personId: "A", sharePercent: 60, validFrom: null, validTo: null },
    ]);
    expect(problems.some((p) => p.includes("60.00 % statt 100 %"))).toBe(true);
  });

  it("akzeptiert eine vollstaendige Definition", () => {
    const problems = validateShares([
      { personId: "A", sharePercent: 60, validFrom: null, validTo: null },
      { personId: "B", sharePercent: 40, validFrom: null, validTo: null },
    ]);
    expect(problems).toEqual([]);
  });

  it("akzeptiert einen sauberen Eigentuemerwechsel", () => {
    const problems = validateShares([
      { personId: "A", sharePercent: 100, validFrom: null, validTo: d("2026-06-30") },
      { personId: "B", sharePercent: 100, validFrom: d("2026-07-01"), validTo: null },
    ]);
    expect(problems).toEqual([]);
  });

  it("meldet eine unmoegliche Quote", () => {
    const problems = validateShares([
      { personId: "A", sharePercent: 0, validFrom: null, validTo: null },
    ]);
    expect(problems.some((p) => p.includes("Ungültige Quote"))).toBe(true);
  });

  it("meldet ein Ende vor dem Beginn", () => {
    const problems = validateShares([
      { personId: "A", sharePercent: 100, validFrom: d("2026-07-01"), validTo: d("2026-06-01") },
    ]);
    expect(problems.some((p) => p.includes("Ende eines Anteils"))).toBe(true);
  });

  it("prueft auch eine Definition ganz ohne Datumsangaben", () => {
    // Sonst bliebe der haeufigste Fall ungeprueft.
    const problems = validateShares([
      { personId: "A", sharePercent: 50, validFrom: null, validTo: null },
    ]);
    expect(problems.length).toBeGreaterThan(0);
  });
});
