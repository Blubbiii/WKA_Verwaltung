import { describe, it, expect } from "vitest";
import { calculateNextRun } from "./scheduler";
import { calculateNextRunDate } from "@/lib/invoices/recurring-invoice-service";
import type { BillingRuleFrequency } from "./types";

/** Helper: local-time ISO date part, avoids UTC/TZ noise in assertions. */
function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rule(frequency: BillingRuleFrequency, dayOfMonth: number | null = null) {
  return {
    frequency,
    cronPattern: null,
    dayOfMonth,
    lastRunAt: null,
    nextRunAt: null,
  };
}

// =============================================================================
// Randfall 1: calculateNextRun überspringt einen ganzen Monat
// =============================================================================

describe("calculateNextRun — Monatsende (Randfall 1)", () => {
  it("MONTHLY am 31.01. ergibt den 01.02., nicht den 01.03.", () => {
    expect(iso(calculateNextRun(rule("MONTHLY"), new Date(2026, 0, 31)))).toBe("2026-02-01");
  });

  it("MONTHLY am 31.03. mit dayOfMonth=15 ergibt den 15.04.", () => {
    expect(iso(calculateNextRun(rule("MONTHLY", 15), new Date(2026, 2, 31)))).toBe("2026-04-15");
  });

  it("MONTHLY vor dem Stichtag bleibt im selben Monat", () => {
    expect(iso(calculateNextRun(rule("MONTHLY", 20), new Date(2026, 0, 5)))).toBe("2026-01-20");
  });

  it("MONTHLY am 31.12. rollt korrekt ins Folgejahr", () => {
    expect(iso(calculateNextRun(rule("MONTHLY"), new Date(2026, 11, 31)))).toBe("2027-01-01");
  });

  it("QUARTERLY am 31.01. ergibt den 01.04., nicht den 01.05.", () => {
    expect(iso(calculateNextRun(rule("QUARTERLY"), new Date(2026, 0, 31)))).toBe("2026-04-01");
  });

  it("QUARTERLY nach dem letzten Quartal rollt auf Januar des Folgejahres", () => {
    expect(iso(calculateNextRun(rule("QUARTERLY"), new Date(2026, 10, 30)))).toBe("2027-01-01");
  });

  it("SEMI_ANNUAL am 31.01. ergibt den 01.07.", () => {
    expect(iso(calculateNextRun(rule("SEMI_ANNUAL"), new Date(2026, 0, 31)))).toBe("2026-07-01");
  });

  it("ANNUAL am 29.02. eines Schaltjahres ergibt den 01.01. des Folgejahres", () => {
    expect(iso(calculateNextRun(rule("ANNUAL"), new Date(2024, 1, 29)))).toBe("2025-01-01");
  });

  it("setzt die Uhrzeit auf Mitternacht", () => {
    const next = calculateNextRun(rule("MONTHLY"), new Date(2026, 0, 31, 17, 45, 30));
    expect(next.getHours()).toBe(0);
    expect(next.getMinutes()).toBe(0);
  });
});

// =============================================================================
// Randfall 2: calculateNextRunDate (Dauerrechnungen)
// =============================================================================

describe("calculateNextRunDate — Monatsende & Schaltjahr (Randfall 2)", () => {
  it("MONTHLY ab 31.01. mit Tag 15 ergibt den 15.02., nicht den 15.03.", () => {
    expect(iso(calculateNextRunDate("MONTHLY", new Date(2026, 0, 31), 15))).toBe("2026-02-15");
  });

  it("MONTHLY ab 31.01. ohne Tag ergibt den 01.02.", () => {
    expect(iso(calculateNextRunDate("MONTHLY", new Date(2026, 0, 31)))).toBe("2026-02-01");
  });

  it("QUARTERLY ab 31.01. mit Tag 28 ergibt den 28.04.", () => {
    expect(iso(calculateNextRunDate("QUARTERLY", new Date(2026, 0, 31), 28))).toBe("2026-04-28");
  });

  it("SEMI_ANNUAL ab 31.03. mit Tag 20 ergibt den 20.09.", () => {
    expect(iso(calculateNextRunDate("SEMI_ANNUAL", new Date(2026, 2, 31), 20))).toBe("2026-09-20");
  });

  it("ANNUAL ab 29.02.2024 mit Tag 28 ergibt den 28.02.2025, nicht den 28.03.2025", () => {
    expect(iso(calculateNextRunDate("ANNUAL", new Date(2024, 1, 29), 28))).toBe("2025-02-28");
  });

  it("laeuft um 02:00 Uhr", () => {
    const next = calculateNextRunDate("MONTHLY", new Date(2026, 0, 31), 15);
    expect(next.getHours()).toBe(2);
  });
});
