/**
 * Tests für Chart-of-Accounts Resolver (Audit-C).
 */

import { describe, it, expect } from "vitest";
import { BalanceSheetSection } from "@prisma/client";
import {
  getAccountMapper,
  isExpenseAccount,
  isPnlAccount,
  isRevenueAccount,
} from "./chart-of-accounts";

describe("getAccountMapper — Resolver", () => {
  it("SKR04 → mapSkr04-Aufruf", () => {
    const mapper = getAccountMapper("SKR04");
    // 1200 SKR04 = Forderungen aus L+L (ASSET_CURRENT)
    expect(mapper("1200")).toBe(BalanceSheetSection.ASSET_CURRENT);
  });

  it("SKR03 → mapSkr03-Aufruf", () => {
    const mapper = getAccountMapper("SKR03");
    // 1200 SKR03 = Bank (ASSET_CURRENT, gleicher Section — aber andere Bedeutung)
    expect(mapper("1200")).toBe(BalanceSheetSection.ASSET_CURRENT);
  });

  it("SKR03 Privatkonto 1800 → EQUITY (Unterschied zu SKR04!)", () => {
    expect(getAccountMapper("SKR03")("1800")).toBe(BalanceSheetSection.EQUITY);
    // SKR04 hat 1800 nicht als Privatkonto:
    expect(getAccountMapper("SKR04")("1800")).toBe(BalanceSheetSection.ASSET_CURRENT);
  });
});

describe("isPnlAccount — Kontenrahmen-spezifisch", () => {
  it("4000 ist GuV in beiden Kontenrahmen", () => {
    expect(isPnlAccount("4000", "SKR03")).toBe(true);
    expect(isPnlAccount("4000", "SKR04")).toBe(true);
  });

  it("8400 ist Erlös (GuV) in beiden", () => {
    expect(isPnlAccount("8400", "SKR03")).toBe(true);
    expect(isPnlAccount("8400", "SKR04")).toBe(true);
  });

  it("SKR03: 3000 (Wareneingang) ist GuV; SKR04: 3000 ist NICHT GuV", () => {
    expect(isPnlAccount("3000", "SKR03")).toBe(true);
    expect(isPnlAccount("3000", "SKR04")).toBe(false);
  });

  it("SKR03: 2700 (a.o. Erträge) ist GuV; SKR04: 2700 ist NICHT GuV", () => {
    expect(isPnlAccount("2700", "SKR03")).toBe(true);
    expect(isPnlAccount("2700", "SKR04")).toBe(false);
  });

  it("9000 (Statistik) ist KEIN GuV in beiden", () => {
    expect(isPnlAccount("9000", "SKR03")).toBe(false);
    expect(isPnlAccount("9000", "SKR04")).toBe(false);
  });
});

describe("isRevenueAccount", () => {
  it("8xxx ist Erlös in beiden Kontenrahmen", () => {
    expect(isRevenueAccount("8400", "SKR03")).toBe(true);
    expect(isRevenueAccount("8400", "SKR04")).toBe(true);
  });

  it("4xxx ist KEIN Erlös", () => {
    expect(isRevenueAccount("4000", "SKR03")).toBe(false);
    expect(isRevenueAccount("4000", "SKR04")).toBe(false);
  });
});

describe("isExpenseAccount", () => {
  it("4xxx-7xxx Aufwand in beiden", () => {
    expect(isExpenseAccount("4000", "SKR03")).toBe(true);
    expect(isExpenseAccount("4000", "SKR04")).toBe(true);
    expect(isExpenseAccount("7999", "SKR03")).toBe(true);
    expect(isExpenseAccount("7999", "SKR04")).toBe(true);
  });

  it("SKR03: 3000-3499 ist Aufwand (Wareneingang); SKR04: NICHT", () => {
    expect(isExpenseAccount("3200", "SKR03")).toBe(true);
    expect(isExpenseAccount("3200", "SKR04")).toBe(false);
  });

  it("8xxx ist KEIN Aufwand", () => {
    expect(isExpenseAccount("8400", "SKR03")).toBe(false);
    expect(isExpenseAccount("8400", "SKR04")).toBe(false);
  });
});
