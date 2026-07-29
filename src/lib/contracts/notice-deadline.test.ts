import { describe, it, expect } from "vitest";
import { calculateNoticeDeadline } from "./notice-deadline";

/** Helper: local-time ISO date part, avoids UTC/TZ noise in assertions. */
function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("calculateNoticeDeadline", () => {
  it("31.03. minus 1 Monat ergibt den 28.02., nicht den 03.03.", () => {
    // Der Schadensfall: setMonth(-1) liefert 03.03. Der Nutzer glaubt, er habe
    // bis zum 03.03. Zeit — tatsaechlich war der 28.02. der letzte Tag.
    expect(iso(calculateNoticeDeadline(new Date(2026, 2, 31), 1))).toBe("2026-02-28");
  });

  it("31.03. minus 1 Monat im Schaltjahr ergibt den 29.02.", () => {
    expect(iso(calculateNoticeDeadline(new Date(2024, 2, 31), 1))).toBe("2024-02-29");
  });

  it("31.05. minus 1 Monat ergibt den 30.04., nicht den 01.05.", () => {
    expect(iso(calculateNoticeDeadline(new Date(2026, 4, 31), 1))).toBe("2026-04-30");
  });

  it("31.12. minus 3 Monate ergibt den 30.09., nicht den 01.10.", () => {
    expect(iso(calculateNoticeDeadline(new Date(2026, 11, 31), 3))).toBe("2026-09-30");
  });

  it("31.01. minus 1 Monat geht ins Vorjahr auf den 31.12.", () => {
    expect(iso(calculateNoticeDeadline(new Date(2026, 0, 31), 1))).toBe("2025-12-31");
  });

  it("31.12. minus 12 Monate ergibt den 31.12. des Vorjahres", () => {
    expect(iso(calculateNoticeDeadline(new Date(2026, 11, 31), 12))).toBe("2025-12-31");
  });

  it("29.02. minus 12 Monate ergibt den 28.02. des Vorjahres", () => {
    expect(iso(calculateNoticeDeadline(new Date(2024, 1, 29), 12))).toBe("2023-02-28");
  });

  it("liegt nie nach dem Vertragsende", () => {
    // Regression gegen den setMonth-Ueberlauf: der Termin darf niemals in den
    // Monat *nach* dem rechnerischen Zielmonat rutschen.
    for (let month = 0; month < 12; month++) {
      const end = new Date(2026, month, 31); // 31. bzw. normalisiert
      const deadline = calculateNoticeDeadline(end, 1);
      expect(deadline.getTime()).toBeLessThan(end.getTime());
      // Zielmonat = Vormonat des Vertragsendes
      const expectedMonth = (end.getMonth() + 11) % 12;
      expect(deadline.getMonth()).toBe(expectedMonth);
    }
  });

  it("Frist 0 laesst das Datum unveraendert", () => {
    expect(iso(calculateNoticeDeadline(new Date(2026, 2, 31), 0))).toBe("2026-03-31");
  });

  it("mutiert das Vertragsende nicht", () => {
    const end = new Date(2026, 2, 31);
    calculateNoticeDeadline(end, 1);
    expect(iso(end)).toBe("2026-03-31");
  });
});
