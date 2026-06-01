/**
 * Tests für SKR03 → BalanceSheetSection Mapping (Audit-C).
 */

import { describe, it, expect } from "vitest";
import { BalanceSheetSection } from "@prisma/client";
import { mapSkr03ToBalanceSheetSection } from "./skr03-mapping";

describe("mapSkr03ToBalanceSheetSection — Aktiva", () => {
  it.each([
    ["0150", BalanceSheetSection.ASSET_FIXED],
    ["0699", BalanceSheetSection.ASSET_FIXED],
    ["1000", BalanceSheetSection.ASSET_CURRENT],
    ["1200", BalanceSheetSection.ASSET_CURRENT], // Bank
    ["1400", BalanceSheetSection.ASSET_CURRENT], // Forderungen
    ["1576", BalanceSheetSection.ASSET_CURRENT], // Vorsteuer
    ["1599", BalanceSheetSection.ASSET_CURRENT],
    ["1600", BalanceSheetSection.ASSET_DEFERRED], // RAP Aktiv Start
    ["1699", BalanceSheetSection.ASSET_DEFERRED],
    ["1900", BalanceSheetSection.ASSET_CURRENT],
  ])("%s → %s", (acc, expected) => {
    expect(mapSkr03ToBalanceSheetSection(acc)).toBe(expected);
  });
});

describe("mapSkr03ToBalanceSheetSection — Passiva", () => {
  it.each([
    ["1700", BalanceSheetSection.LIABILITY_LONG], // Kreditinstitut
    ["1799", BalanceSheetSection.LIABILITY_LONG],
    ["1800", BalanceSheetSection.EQUITY], // Privat
    ["1899", BalanceSheetSection.EQUITY],
    ["2000", BalanceSheetSection.EQUITY],
    ["2299", BalanceSheetSection.EQUITY], // Gesellschafter
    ["2300", BalanceSheetSection.PROVISION],
    ["2599", BalanceSheetSection.PROVISION],
    ["3500", BalanceSheetSection.LIABILITY_SHORT], // USt-Schuld
    ["3700", BalanceSheetSection.LIABILITY_SHORT], // Lieferanten
    ["3899", BalanceSheetSection.LIABILITY_SHORT],
    ["3900", BalanceSheetSection.LIABILITY_DEFERRED],
    ["3999", BalanceSheetSection.LIABILITY_DEFERRED],
  ])("%s → %s", (acc, expected) => {
    expect(mapSkr03ToBalanceSheetSection(acc)).toBe(expected);
  });
});

describe("mapSkr03ToBalanceSheetSection — Keine Bilanz-Konten", () => {
  it.each([
    ["2700"], // a.o. Erträge
    ["3000"], // Wareneingang
    ["3499"], // Bezugsleistungen
    ["4000"], // Aufwand
    ["8400"], // Erlöse
    ["9000"], // Statistik
  ])("%s → null", (acc) => {
    expect(mapSkr03ToBalanceSheetSection(acc)).toBeNull();
  });

  it("Garbage → null", () => {
    expect(mapSkr03ToBalanceSheetSection("ABC")).toBeNull();
  });
});

describe("SKR03 vs SKR04 — Privatkonto-Unterschied", () => {
  it("SKR03: 1800 → EQUITY (Privatkonto)", () => {
    expect(mapSkr03ToBalanceSheetSection("1800")).toBe(BalanceSheetSection.EQUITY);
  });
  // (SKR04 hätte hier ASSET_CURRENT — getrennt getestet im skr04-mapping.test.ts)
});
