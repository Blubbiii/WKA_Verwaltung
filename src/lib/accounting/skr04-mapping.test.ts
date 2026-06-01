/**
 * Tests für SKR04 → BalanceSheetSection Range-Mapping (P15).
 */

import { describe, it, expect } from "vitest";
import { BalanceSheetSection } from "@prisma/client";
import {
  BALANCE_SHEET_SECTION_LABELS,
  isAssetSection,
  isLiabilitySection,
  mapSkr04ToBalanceSheetSection,
} from "./skr04-mapping";

describe("mapSkr04ToBalanceSheetSection — Aktiva", () => {
  it.each([
    ["0150", BalanceSheetSection.ASSET_FIXED, "Anlagevermögen (Grundstücke)"],
    ["0500", BalanceSheetSection.ASSET_FIXED, "Anlagevermögen (Anlagen)"],
    ["0999", BalanceSheetSection.ASSET_FIXED, "Anlagevermögen (Untergrenze)"],
    ["1200", BalanceSheetSection.ASSET_CURRENT, "Forderungen"],
    ["1399", BalanceSheetSection.ASSET_CURRENT, "Umlaufvermögen (Ende)"],
    ["1400", BalanceSheetSection.ASSET_DEFERRED, "RAP Aktiv (Anfang)"],
    ["1499", BalanceSheetSection.ASSET_DEFERRED, "RAP Aktiv (Ende)"],
    ["1576", BalanceSheetSection.ASSET_CURRENT, "Vorsteuer 19%"],
    ["1800", BalanceSheetSection.ASSET_CURRENT, "Bank"],
    ["1999", BalanceSheetSection.ASSET_CURRENT, "Kasse"],
  ])("%s → %s (%s)", (acc, expected, _label) => {
    expect(mapSkr04ToBalanceSheetSection(acc)).toBe(expected);
  });
});

describe("mapSkr04ToBalanceSheetSection — Passiva", () => {
  it.each([
    ["2000", BalanceSheetSection.EQUITY, "Eigenkapital (Anfang)"],
    ["2999", BalanceSheetSection.EQUITY, "Eigenkapital (Ende)"],
    ["3000", BalanceSheetSection.PROVISION, "Rückstellungen (Anfang)"],
    ["3099", BalanceSheetSection.PROVISION, "Rückstellungen (Ende)"],
    ["3100", BalanceSheetSection.LIABILITY_LONG, "Langfristige Verbindlichkeit"],
    ["3399", BalanceSheetSection.LIABILITY_LONG, "Verbindl. lang (Ende)"],
    ["3400", BalanceSheetSection.LIABILITY_SHORT, "Verbindl. kurz (Lieferanten)"],
    ["3776", BalanceSheetSection.LIABILITY_SHORT, "USt 19% (Schuld)"],
    ["3899", BalanceSheetSection.LIABILITY_SHORT, "Verbindl. kurz (Ende)"],
    ["3900", BalanceSheetSection.LIABILITY_DEFERRED, "RAP Passiv (Anfang)"],
    ["3999", BalanceSheetSection.LIABILITY_DEFERRED, "RAP Passiv (Ende)"],
  ])("%s → %s (%s)", (acc, expected, _label) => {
    expect(mapSkr04ToBalanceSheetSection(acc)).toBe(expected);
  });
});

describe("mapSkr04ToBalanceSheetSection — keine Bilanz-Konten", () => {
  it.each([
    ["4000", "Aufwand"],
    ["6710", "Werbeaufwand"],
    ["7999", "Aufwand-Ende"],
    ["8400", "Erlöse"],
    ["8999", "Erlöse-Ende"],
    ["9000", "Statistik/Vortrag"],
    ["9999", "Statistik/Vortrag-Ende"],
  ])("%s → null (%s)", (acc) => {
    expect(mapSkr04ToBalanceSheetSection(acc)).toBeNull();
  });

  it("Garbage input → null", () => {
    expect(mapSkr04ToBalanceSheetSection("ABC")).toBeNull();
    expect(mapSkr04ToBalanceSheetSection("")).toBeNull();
  });
});

describe("isAssetSection / isLiabilitySection", () => {
  it("Alle Aktiv-Sections", () => {
    expect(isAssetSection(BalanceSheetSection.ASSET_FIXED)).toBe(true);
    expect(isAssetSection(BalanceSheetSection.ASSET_CURRENT)).toBe(true);
    expect(isAssetSection(BalanceSheetSection.ASSET_DEFERRED)).toBe(true);
  });

  it("Alle Passiv-Sections", () => {
    expect(isLiabilitySection(BalanceSheetSection.EQUITY)).toBe(true);
    expect(isLiabilitySection(BalanceSheetSection.PROVISION)).toBe(true);
    expect(isLiabilitySection(BalanceSheetSection.LIABILITY_LONG)).toBe(true);
    expect(isLiabilitySection(BalanceSheetSection.LIABILITY_SHORT)).toBe(true);
    expect(isLiabilitySection(BalanceSheetSection.LIABILITY_DEFERRED)).toBe(true);
  });

  it("Mutually exclusive", () => {
    for (const section of Object.values(BalanceSheetSection)) {
      expect(isAssetSection(section)).toBe(!isLiabilitySection(section));
    }
  });
});

describe("Labels", () => {
  it("Alle Sections haben ein Label", () => {
    for (const section of Object.values(BalanceSheetSection)) {
      expect(BALANCE_SHEET_SECTION_LABELS[section]).toBeTruthy();
      expect(BALANCE_SHEET_SECTION_LABELS[section].length).toBeGreaterThan(3);
    }
  });
});
