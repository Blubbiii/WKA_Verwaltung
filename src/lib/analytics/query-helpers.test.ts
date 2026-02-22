import { describe, it, expect, vi } from "vitest";

// Mock Prisma dependencies so the module can be imported without a real database
vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));
vi.mock("@prisma/client", () => ({
  Prisma: {
    sql: () => "",
    join: () => "",
  },
}));

import {
  buildDateRange,
  hoursInPeriod,
  safeNumber,
  round,
  buildTurbineMap,
  monthLabel,
} from "./query-helpers";
import type { AnalyticsTurbineMeta } from "@/types/analytics";

// =============================================================================
// buildDateRange
// =============================================================================

describe("buildDateRange", () => {
  it("gibt korrektes Start- und Enddatum fuer ein Jahr zurueck", () => {
    const { from, to } = buildDateRange(2024);
    expect(from.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("funktioniert fuer das aktuelle Jahr 2026", () => {
    const { from, to } = buildDateRange(2026);
    expect(from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("funktioniert fuer Schaltjahre", () => {
    const { from, to } = buildDateRange(2024);
    // 2024 is a leap year (366 days)
    const days = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    expect(days).toBe(366);
  });

  it("funktioniert fuer Nicht-Schaltjahre", () => {
    const { from, to } = buildDateRange(2023);
    const days = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    expect(days).toBe(365);
  });

  it("gibt UTC-Daten zurueck (keine Zeitzonen-Verschiebung)", () => {
    const { from, to } = buildDateRange(2025);
    expect(from.getUTCHours()).toBe(0);
    expect(from.getUTCMinutes()).toBe(0);
    expect(to.getUTCHours()).toBe(0);
    expect(to.getUTCMinutes()).toBe(0);
  });
});

// =============================================================================
// hoursInPeriod
// =============================================================================

describe("hoursInPeriod", () => {
  it("berechnet Stunden fuer einen ganzen Tag", () => {
    const from = new Date("2024-01-01T00:00:00Z");
    const to = new Date("2024-01-02T00:00:00Z");
    expect(hoursInPeriod(from, to)).toBe(24);
  });

  it("berechnet Stunden fuer ein ganzes Jahr (365 Tage)", () => {
    const { from, to } = buildDateRange(2023);
    expect(hoursInPeriod(from, to)).toBe(8760); // 365 * 24
  });

  it("berechnet Stunden fuer ein Schaltjahr (366 Tage)", () => {
    const { from, to } = buildDateRange(2024);
    expect(hoursInPeriod(from, to)).toBe(8784); // 366 * 24
  });

  it("gibt 0 zurueck wenn from === to", () => {
    const date = new Date("2024-06-15T12:00:00Z");
    expect(hoursInPeriod(date, date)).toBe(0);
  });

  it("gibt negative Stunden zurueck wenn to < from", () => {
    const from = new Date("2024-01-02T00:00:00Z");
    const to = new Date("2024-01-01T00:00:00Z");
    expect(hoursInPeriod(from, to)).toBe(-24);
  });

  it("berechnet Bruchteile von Stunden korrekt", () => {
    const from = new Date("2024-01-01T00:00:00Z");
    const to = new Date("2024-01-01T01:30:00Z");
    expect(hoursInPeriod(from, to)).toBe(1.5);
  });
});

// =============================================================================
// safeNumber
// =============================================================================

describe("safeNumber", () => {
  it("gibt 0 zurueck fuer null", () => {
    expect(safeNumber(null)).toBe(0);
  });

  it("gibt 0 zurueck fuer undefined", () => {
    expect(safeNumber(undefined)).toBe(0);
  });

  it("konvertiert Number-Werte korrekt", () => {
    expect(safeNumber(42)).toBe(42);
    expect(safeNumber(3.14)).toBe(3.14);
    expect(safeNumber(-100)).toBe(-100);
  });

  it("konvertiert String-Zahlen korrekt", () => {
    expect(safeNumber("123")).toBe(123);
    expect(safeNumber("3.14")).toBe(3.14);
  });

  it("konvertiert BigInt korrekt", () => {
    expect(safeNumber(BigInt(1000))).toBe(1000);
  });

  it("gibt 0 zurueck fuer 0-Werte", () => {
    expect(safeNumber(0)).toBe(0);
    expect(safeNumber("0")).toBe(0);
  });

  it("gibt NaN zurueck fuer nicht-numerische Strings", () => {
    expect(safeNumber("abc")).toBeNaN();
  });
});

// =============================================================================
// round
// =============================================================================

describe("round", () => {
  it("rundet auf 2 Dezimalstellen (Standard)", () => {
    expect(round(3.14159)).toBe(3.14);
    expect(round(2.005)).toBe(2); // classic floating point: 2.005 * 100 = 200.499...
    expect(round(1.999)).toBe(2);
  });

  it("rundet auf 0 Dezimalstellen", () => {
    expect(round(3.7, 0)).toBe(4);
    expect(round(3.3, 0)).toBe(3);
  });

  it("rundet auf 1 Dezimalstelle", () => {
    expect(round(3.14, 1)).toBe(3.1);
    expect(round(3.15, 1)).toBe(3.2);
  });

  it("rundet auf 3 Dezimalstellen", () => {
    expect(round(1.23456, 3)).toBe(1.235);
  });

  it("behandelt negative Zahlen korrekt", () => {
    expect(round(-3.14159)).toBe(-3.14);
    expect(round(-1.005)).toBe(-1); // floating point
  });

  it("behandelt 0 korrekt", () => {
    expect(round(0)).toBe(0);
    expect(round(0, 5)).toBe(0);
  });

  it("behandelt ganze Zahlen korrekt", () => {
    expect(round(42)).toBe(42);
    expect(round(42, 0)).toBe(42);
  });
});

// =============================================================================
// buildTurbineMap
// =============================================================================

describe("buildTurbineMap", () => {
  const turbines: AnalyticsTurbineMeta[] = [
    { id: "t1", designation: "WEA 01", parkId: "p1", parkName: "Windpark Nord", ratedPowerKw: 3000 },
    { id: "t2", designation: "WEA 02", parkId: "p1", parkName: "Windpark Nord", ratedPowerKw: 3000 },
    { id: "t3", designation: "WEA 03", parkId: "p2", parkName: "Windpark Sued", ratedPowerKw: 2000 },
  ];

  it("erstellt eine Map mit Turbine-ID als Key", () => {
    const map = buildTurbineMap(turbines);
    expect(map.size).toBe(3);
    expect(map.has("t1")).toBe(true);
    expect(map.has("t2")).toBe(true);
    expect(map.has("t3")).toBe(true);
  });

  it("gibt korrekte Turbine-Metadaten zurueck", () => {
    const map = buildTurbineMap(turbines);
    const t1 = map.get("t1");
    expect(t1).toBeDefined();
    expect(t1!.designation).toBe("WEA 01");
    expect(t1!.parkName).toBe("Windpark Nord");
    expect(t1!.ratedPowerKw).toBe(3000);
  });

  it("gibt undefined fuer unbekannte IDs zurueck", () => {
    const map = buildTurbineMap(turbines);
    expect(map.get("unknown")).toBeUndefined();
  });

  it("erstellt leere Map fuer leeres Array", () => {
    const map = buildTurbineMap([]);
    expect(map.size).toBe(0);
  });
});

// =============================================================================
// monthLabel
// =============================================================================

describe("monthLabel", () => {
  it("gibt korrekte deutsche Monatsnamen zurueck", () => {
    expect(monthLabel(1)).toBe("Jan");
    expect(monthLabel(2)).toBe("Feb");
    expect(monthLabel(3)).toBe("M\u00e4r");
    expect(monthLabel(4)).toBe("Apr");
    expect(monthLabel(5)).toBe("Mai");
    expect(monthLabel(6)).toBe("Jun");
    expect(monthLabel(7)).toBe("Jul");
    expect(monthLabel(8)).toBe("Aug");
    expect(monthLabel(9)).toBe("Sep");
    expect(monthLabel(10)).toBe("Okt");
    expect(monthLabel(11)).toBe("Nov");
    expect(monthLabel(12)).toBe("Dez");
  });

  it("gibt Fallback fuer Monat 0 zurueck", () => {
    // Month 0 would be index -1 → MONTH_NAMES[-1] is undefined → fallback
    const result = monthLabel(0);
    // (0 - 1) % 12 = -1 → MONTH_NAMES[-1] = undefined → "M0"
    expect(result).toBe("M0");
  });

  it("gibt Fallback fuer Monat 13+ zurueck", () => {
    // Month 13 → (13 - 1) % 12 = 0 → "Jan" (wraps around)
    expect(monthLabel(13)).toBe("Jan");
  });
});
