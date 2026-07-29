import { describe, it, expect } from "vitest";
import {
  daysInMonth,
  addMonthsSafe,
  addYearsSafe,
  setMonthSafe,
  setDayOfMonthSafe,
} from "./date-utils";

/** Helper: local-time ISO date part, avoids UTC/TZ noise in assertions. */
function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("daysInMonth", () => {
  it("kennt die Monatslaengen", () => {
    expect(daysInMonth(2026, 0)).toBe(31); // Jan
    expect(daysInMonth(2026, 1)).toBe(28); // Feb (kein Schaltjahr)
    expect(daysInMonth(2024, 1)).toBe(29); // Feb (Schaltjahr)
    expect(daysInMonth(2026, 3)).toBe(30); // Apr
    expect(daysInMonth(2026, 11)).toBe(31); // Dez
  });

  it("behandelt 2000 als Schaltjahr und 1900 nicht", () => {
    expect(daysInMonth(2000, 1)).toBe(29);
    expect(daysInMonth(1900, 1)).toBe(28);
  });
});

describe("addMonthsSafe", () => {
  it("31.01. + 1 Monat → 28.02. (nicht 03.03.)", () => {
    expect(iso(addMonthsSafe(new Date(2026, 0, 31), 1))).toBe("2026-02-28");
  });

  it("31.01. + 1 Monat im Schaltjahr → 29.02.", () => {
    expect(iso(addMonthsSafe(new Date(2024, 0, 31), 1))).toBe("2024-02-29");
  });

  it("31.03. + 1 Monat → 30.04. (nicht 01.05.)", () => {
    expect(iso(addMonthsSafe(new Date(2026, 2, 31), 1))).toBe("2026-04-30");
  });

  it("31.12. + 1 Monat → 31.01. des Folgejahres", () => {
    expect(iso(addMonthsSafe(new Date(2026, 11, 31), 1))).toBe("2027-01-31");
  });

  it("30.11. + 3 Monate → 28.02. (nicht 02.03.)", () => {
    expect(iso(addMonthsSafe(new Date(2026, 10, 30), 3))).toBe("2027-02-28");
  });

  it("respektiert targetDay und klemmt ihn an die Monatslaenge", () => {
    // Der Auslöser aus Randfall 2: 31.01. + 1 Monat mit Zieltag 15.
    expect(iso(addMonthsSafe(new Date(2026, 0, 31), 1, 15))).toBe("2026-02-15");
    // Zieltag 31 im Februar → geklemmt
    expect(iso(addMonthsSafe(new Date(2026, 0, 15), 1, 31))).toBe("2026-02-28");
    // Zieltag 0 / negativ → 1.
    expect(iso(addMonthsSafe(new Date(2026, 0, 15), 1, 0))).toBe("2026-02-01");
  });

  it("rechnet auch rueckwaerts korrekt", () => {
    expect(iso(addMonthsSafe(new Date(2026, 2, 31), -1))).toBe("2026-02-28");
    expect(iso(addMonthsSafe(new Date(2026, 0, 31), -1))).toBe("2025-12-31");
    expect(iso(addMonthsSafe(new Date(2026, 0, 15), -13))).toBe("2024-12-15");
  });

  it("addiert ueber mehrere Jahre hinweg", () => {
    expect(iso(addMonthsSafe(new Date(2026, 0, 31), 25))).toBe("2028-02-29");
  });

  it("erhaelt die Uhrzeit und mutiert das Original nicht", () => {
    const base = new Date(2026, 0, 31, 2, 30, 15, 250);
    const next = addMonthsSafe(base, 1);
    expect(next.getHours()).toBe(2);
    expect(next.getMinutes()).toBe(30);
    expect(next.getSeconds()).toBe(15);
    expect(next.getMilliseconds()).toBe(250);
    expect(iso(base)).toBe("2026-01-31"); // Original unveraendert
  });

  it("+0 Monate ist die Identitaet", () => {
    expect(iso(addMonthsSafe(new Date(2026, 1, 28), 0))).toBe("2026-02-28");
  });
});

describe("addYearsSafe", () => {
  it("29.02. + 1 Jahr → 28.02. (nicht 01.03.)", () => {
    expect(iso(addYearsSafe(new Date(2024, 1, 29), 1))).toBe("2025-02-28");
  });

  it("29.02. + 4 Jahre → 29.02.", () => {
    expect(iso(addYearsSafe(new Date(2024, 1, 29), 4))).toBe("2028-02-29");
  });

  it("31.12. + 1 Jahr → 31.12.", () => {
    expect(iso(addYearsSafe(new Date(2026, 11, 31), 1))).toBe("2027-12-31");
  });

  it("respektiert targetDay mit Klemmung", () => {
    expect(iso(addYearsSafe(new Date(2024, 1, 29), 1, 28))).toBe("2025-02-28");
    expect(iso(addYearsSafe(new Date(2025, 1, 10), 1, 31))).toBe("2026-02-28");
  });

  it("rechnet rueckwaerts korrekt", () => {
    expect(iso(addYearsSafe(new Date(2024, 1, 29), -1))).toBe("2023-02-28");
  });
});

describe("setMonthSafe", () => {
  it("31.01. → April mit Tag 1 ergibt 01.04. (nicht 01.05.)", () => {
    expect(iso(setMonthSafe(new Date(2026, 0, 31), 3, 1))).toBe("2026-04-01");
  });

  it("klemmt den uebernommenen Tag an die Ziel-Monatslaenge", () => {
    // 31.01. → April ohne targetDay: 31. April existiert nicht → 30.04.
    expect(iso(setMonthSafe(new Date(2026, 0, 31), 3))).toBe("2026-04-30");
  });

  it("akzeptiert ein explizites Jahr", () => {
    expect(iso(setMonthSafe(new Date(2026, 1, 28), 0, 1, 2027))).toBe("2027-01-01");
  });

  it("29.02. → Januar des Folgejahres bleibt im Januar", () => {
    expect(iso(setMonthSafe(new Date(2024, 1, 29), 0, 15, 2025))).toBe("2025-01-15");
  });
});

describe("setDayOfMonthSafe", () => {
  it("klemmt Tag 31 im Februar auf 28.", () => {
    expect(iso(setDayOfMonthSafe(new Date(2026, 1, 10), 31))).toBe("2026-02-28");
  });

  it("klemmt Tag 31 im Februar eines Schaltjahres auf 29.", () => {
    expect(iso(setDayOfMonthSafe(new Date(2024, 1, 10), 31))).toBe("2024-02-29");
  });

  it("laesst gueltige Tage unveraendert", () => {
    expect(iso(setDayOfMonthSafe(new Date(2026, 4, 10), 31))).toBe("2026-05-31");
  });
});
