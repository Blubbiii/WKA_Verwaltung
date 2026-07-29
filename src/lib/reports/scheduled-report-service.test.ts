import { describe, it, expect } from "vitest";
import { calculateNextRun } from "./scheduled-report-service";

/** Helper: local-time ISO date part, avoids UTC/TZ noise in assertions. */
function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("calculateNextRun — Monatsende", () => {
  it("MONTHLY am 31.01. ergibt den 01.02., nicht den 01.03.", () => {
    // setMonth(+1) auf dem 31.01. fragt nach dem "31. Februar" → 03.03.,
    // das folgende setDate(1) landete dann auf dem 01.03.
    expect(iso(calculateNextRun("MONTHLY", new Date(2026, 0, 31)))).toBe("2026-02-01");
  });

  it("MONTHLY am 31.05. ergibt den 01.06.", () => {
    expect(iso(calculateNextRun("MONTHLY", new Date(2026, 4, 31)))).toBe("2026-06-01");
  });

  it("MONTHLY am 31.12. ergibt den 01.01. des Folgejahres", () => {
    expect(iso(calculateNextRun("MONTHLY", new Date(2026, 11, 31)))).toBe("2027-01-01");
  });

  it("QUARTERLY am 31.01. ergibt den 01.04., nicht den 01.05.", () => {
    expect(iso(calculateNextRun("QUARTERLY", new Date(2026, 0, 31)))).toBe("2026-04-01");
  });

  it("QUARTERLY im letzten Quartal rollt auf den 01.01. des Folgejahres", () => {
    expect(iso(calculateNextRun("QUARTERLY", new Date(2026, 11, 31)))).toBe("2027-01-01");
  });

  it("ANNUALLY am 29.02. ergibt den 01.01. des Folgejahres", () => {
    expect(iso(calculateNextRun("ANNUALLY", new Date(2024, 1, 29)))).toBe("2025-01-01");
  });

  it("laeuft fuer jeden Tag des Jahres immer in den unmittelbar folgenden Monat", () => {
    // Regressionsnetz: MONTHLY darf nie einen Monat ueberspringen.
    const day = new Date(2026, 0, 1);
    while (day.getFullYear() === 2026) {
      const next = calculateNextRun("MONTHLY", new Date(day));
      const expectedMonth = (day.getMonth() + 1) % 12;
      expect(next.getMonth()).toBe(expectedMonth);
      expect(next.getDate()).toBe(1);
      day.setDate(day.getDate() + 1);
    }
  });

  it("setzt die Uhrzeit auf 06:00", () => {
    const next = calculateNextRun("MONTHLY", new Date(2026, 0, 31, 23, 45));
    expect(next.getHours()).toBe(6);
    expect(next.getMinutes()).toBe(0);
  });
});
