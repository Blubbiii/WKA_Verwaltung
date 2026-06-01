/**
 * Tests für den UStVA-Generator (P12).
 *
 * Deckt die 4 Klassifikations-Pfade ab:
 *   Pfad 1: line.ustvaKennzahl Override
 *   Pfad 2: TaxCode → Template-Kennzahl
 *   Pfad 3: USt-Konto-Match (Output/Input 19/7)
 *   Pfad 4: Range-Fallback auf taxBehavior + 8xxx
 *
 * Plus:
 *   - Kleinunternehmer (§19) — leere Lines + Hinweis
 *   - Reverse-Charge (§13b) — Bemessungsgrundlage auf KZ 46
 *   - IGE (innergem. Erwerb) — KZ 84
 *   - IGL (innergem. Lieferung) — KZ 41
 *   - Balance-Berechnung (totalTaxPayable - totalInputTax)
 *
 * Mock-Setup: Wir mocken prisma.journalEntryLine.findMany +
 * prisma.ledgerAccount.findMany + getTenantSettings + isKleinunternehmer
 * — alle anderen Calls sind unbeteiligt.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaxCategory } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    journalEntryLine: { findMany: vi.fn() },
    ledgerAccount: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/tenant-settings", () => ({
  getTenantSettings: vi.fn(),
}));
vi.mock("@/lib/accounting/kleinunternehmer", () => ({
  isKleinunternehmer: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getTenantSettings } from "@/lib/tenant-settings";
import { isKleinunternehmer } from "@/lib/accounting/kleinunternehmer";
import { generateUstva } from "./ustva";

const mockLines = prisma.journalEntryLine.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const mockAccts = prisma.ledgerAccount.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const mockSettings = getTenantSettings as unknown as ReturnType<typeof vi.fn>;
const mockKleinunt = isKleinunternehmer as unknown as ReturnType<typeof vi.fn>;

const SETTINGS = {
  datevAccountOutputTax19: "1776",
  datevAccountOutputTax7: "1771",
  datevAccountInputTax19: "1576",
  datevAccountInputTax7: "1571",
  datevAccountEinspeisung: "8400",
};

const PERIOD_START = new Date("2026-01-01");
const PERIOD_END = new Date("2026-03-31");

beforeEach(() => {
  mockLines.mockReset();
  mockAccts.mockReset();
  mockSettings.mockReset();
  mockKleinunt.mockReset();
  mockKleinunt.mockResolvedValue(false);
  mockSettings.mockResolvedValue(SETTINGS);
  mockAccts.mockResolvedValue([]);
});

// =============================================================================
// Kleinunternehmer §19
// =============================================================================

describe("Kleinunternehmer §19", () => {
  it("returns empty lines + warning when tenant is Kleinunternehmer", async () => {
    mockKleinunt.mockResolvedValue(true);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.kleinunternehmer).toBe(true);
    expect(r.lines).toEqual([]);
    expect(r.warnings[0]).toContain("Kleinunternehmer");
    expect(r.totalTaxPayable).toBe(0);
    expect(r.totalInputTax).toBe(0);
    expect(r.balance).toBe(0);
    // Prisma sollte NICHT aufgerufen worden sein (early return).
    expect(mockLines).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Pfad 3: USt-Konto-Match
// =============================================================================

describe("Pfad 3 — USt-Konto-Match", () => {
  it("KZ 81 tax from output-tax-19 credit balance", async () => {
    mockLines.mockResolvedValue([
      { account: "1776", debitAmount: 0, creditAmount: 19, ustvaKennzahl: null, taxCode: null },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    const kz81 = r.lines.find((l) => l.kennzahl === "81")!;
    expect(kz81.taxAmount).toBe(19);
    expect(kz81.amount).toBe(0); // Bemessungsgrundlage steht woanders
  });

  it("KZ 86 tax from output-tax-7 credit balance", async () => {
    mockLines.mockResolvedValue([
      { account: "1771", debitAmount: 0, creditAmount: 7, ustvaKennzahl: null, taxCode: null },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.lines.find((l) => l.kennzahl === "86")!.taxAmount).toBe(7);
  });

  it("KZ 66 input-tax-19 debit balance", async () => {
    mockLines.mockResolvedValue([
      { account: "1576", debitAmount: 19, creditAmount: 0, ustvaKennzahl: null, taxCode: null },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.lines.find((l) => l.kennzahl === "66")!.taxAmount).toBe(19);
  });

  it("KZ 61 input-tax-7 debit balance", async () => {
    mockLines.mockResolvedValue([
      { account: "1571", debitAmount: 7, creditAmount: 0, ustvaKennzahl: null, taxCode: null },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.lines.find((l) => l.kennzahl === "61")!.taxAmount).toBe(7);
  });
});

// =============================================================================
// Pfad 2: TaxCode → Template-Kennzahl
// =============================================================================

describe("Pfad 2 — TaxCode-Klassifikation", () => {
  function taxCodeFor(box: string, category: TaxCategory) {
    return {
      vatReportBoxOverride: null,
      template: { category, defaultVatReportBox: box },
    };
  }

  it("STANDARD_19 Erlös 8400 → KZ 81 net (Haben-Saldo)", async () => {
    mockLines.mockResolvedValue([
      {
        account: "8400",
        debitAmount: 0,
        creditAmount: 100,
        ustvaKennzahl: null,
        taxCode: taxCodeFor("81", TaxCategory.STANDARD_19),
      },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.lines.find((l) => l.kennzahl === "81")!.amount).toBe(100);
  });

  it("REDUCED_7 Erlös 8300 → KZ 86", async () => {
    mockLines.mockResolvedValue([
      {
        account: "8300",
        debitAmount: 0,
        creditAmount: 50,
        ustvaKennzahl: null,
        taxCode: taxCodeFor("86", TaxCategory.REDUCED_7),
      },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.lines.find((l) => l.kennzahl === "86")!.amount).toBe(50);
  });

  it("REVERSE_CHARGE_13B Aufwand 4400 → KZ 46 (Bemessungsgrundlage = Aufwand)", async () => {
    mockLines.mockResolvedValue([
      {
        account: "4400",
        debitAmount: 1000,
        creditAmount: 0,
        ustvaKennzahl: null,
        taxCode: taxCodeFor("46", TaxCategory.REVERSE_CHARGE_13B),
      },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.lines.find((l) => l.kennzahl === "46")!.amount).toBe(1000);
  });

  it("IGE_INTRA_EU Aufwand 4500 → KZ 84", async () => {
    mockLines.mockResolvedValue([
      {
        account: "4500",
        debitAmount: 500,
        creditAmount: 0,
        ustvaKennzahl: null,
        taxCode: taxCodeFor("84", TaxCategory.IGE_INTRA_EU),
      },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.lines.find((l) => l.kennzahl === "84")!.amount).toBe(500);
  });

  it("IGL_INTRA_EU Erlös 8120 → KZ 41", async () => {
    mockLines.mockResolvedValue([
      {
        account: "8120",
        debitAmount: 0,
        creditAmount: 2000,
        ustvaKennzahl: null,
        taxCode: taxCodeFor("41", TaxCategory.IGL_INTRA_EU),
      },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.lines.find((l) => l.kennzahl === "41")!.amount).toBe(2000);
  });

  it("vatReportBoxOverride beats template defaultVatReportBox", async () => {
    mockLines.mockResolvedValue([
      {
        account: "8400",
        debitAmount: 0,
        creditAmount: 100,
        ustvaKennzahl: null,
        taxCode: {
          vatReportBoxOverride: "43", // override to "steuerfrei mit Vorsteuer"
          template: { category: TaxCategory.STANDARD_19, defaultVatReportBox: "81" },
        },
      },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.lines.find((l) => l.kennzahl === "43")!.amount).toBe(100);
    expect(r.lines.find((l) => l.kennzahl === "81")!.amount).toBe(0);
  });
});

// =============================================================================
// Pfad 1: ustvaKennzahl Override (höchste Prio)
// =============================================================================

describe("Pfad 1 — ustvaKennzahl Override", () => {
  it("ustvaKennzahl beats taxCode classification", async () => {
    mockLines.mockResolvedValue([
      {
        account: "8400",
        debitAmount: 0,
        creditAmount: 100,
        ustvaKennzahl: "89", // override to steuerfrei §4 Nr 8
        taxCode: {
          vatReportBoxOverride: null,
          template: { category: TaxCategory.STANDARD_19, defaultVatReportBox: "81" },
        },
      },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.lines.find((l) => l.kennzahl === "89")!.amount).toBe(100);
    expect(r.lines.find((l) => l.kennzahl === "81")!.amount).toBe(0);
  });

  it("ustvaKennzahl=66 (Vorsteuer) saldiert debit-credit", async () => {
    mockLines.mockResolvedValue([
      {
        account: "manual-tax-account",
        debitAmount: 50,
        creditAmount: 0,
        ustvaKennzahl: "66",
        taxCode: null,
      },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.lines.find((l) => l.kennzahl === "66")!.taxAmount).toBe(50);
  });
});

// =============================================================================
// Pfad 4: Range-Fallback (Alt-Daten)
// =============================================================================

describe("Pfad 4 — Range-Fallback", () => {
  it("8xxx-Konto ohne TaxCode + taxBehavior=TAXABLE_19 → KZ 81", async () => {
    mockLines.mockResolvedValue([
      { account: "8400", debitAmount: 0, creditAmount: 100, ustvaKennzahl: null, taxCode: null },
    ]);
    mockAccts.mockResolvedValue([
      { accountNumber: "8400", taxBehavior: "TAXABLE_19" },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.lines.find((l) => l.kennzahl === "81")!.amount).toBe(100);
  });

  it("8xxx + taxBehavior=TAXABLE_7 → KZ 86", async () => {
    mockLines.mockResolvedValue([
      { account: "8300", debitAmount: 0, creditAmount: 50, ustvaKennzahl: null, taxCode: null },
    ]);
    mockAccts.mockResolvedValue([
      { accountNumber: "8300", taxBehavior: "TAXABLE_7" },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.lines.find((l) => l.kennzahl === "86")!.amount).toBe(50);
  });

  it("8xxx + taxBehavior=EXEMPT → KZ 89", async () => {
    mockLines.mockResolvedValue([
      { account: "8100", debitAmount: 0, creditAmount: 200, ustvaKennzahl: null, taxCode: null },
    ]);
    mockAccts.mockResolvedValue([
      { accountNumber: "8100", taxBehavior: "EXEMPT" },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.lines.find((l) => l.kennzahl === "89")!.amount).toBe(200);
  });

  it("8xxx ohne LedgerAccount → KZ 81 Default + warning", async () => {
    mockLines.mockResolvedValue([
      { account: "8999", debitAmount: 0, creditAmount: 42, ustvaKennzahl: null, taxCode: null },
    ]);
    mockAccts.mockResolvedValue([]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.lines.find((l) => l.kennzahl === "81")!.amount).toBe(42);
    expect(r.warnings[0]).toContain("Alt-Daten-Fallback");
  });

  it("Nicht-8xxx-Konto (Bank/Forderung) → kein Beitrag", async () => {
    mockLines.mockResolvedValue([
      { account: "1200", debitAmount: 1000, creditAmount: 0, ustvaKennzahl: null, taxCode: null },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.lines.every((l) => l.amount === 0 && l.taxAmount === 0)).toBe(true);
  });
});

// =============================================================================
// Balance-Berechnung
// =============================================================================

describe("Balance — totalTaxPayable - totalInputTax", () => {
  it("19% Verkauf brutto 119: tax payable 19, balance +19", async () => {
    mockLines.mockResolvedValue([
      // Erlöse 8400 Haben 100
      {
        account: "8400",
        debitAmount: 0,
        creditAmount: 100,
        ustvaKennzahl: null,
        taxCode: {
          vatReportBoxOverride: null,
          template: { category: TaxCategory.STANDARD_19, defaultVatReportBox: "81" },
        },
      },
      // USt 1776 Haben 19
      { account: "1776", debitAmount: 0, creditAmount: 19, ustvaKennzahl: null, taxCode: null },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.totalTaxPayable).toBe(19);
    expect(r.totalInputTax).toBe(0);
    expect(r.balance).toBe(19);
  });

  it("Vorsteuer 19 → balance -19 (Erstattung)", async () => {
    mockLines.mockResolvedValue([
      { account: "1576", debitAmount: 19, creditAmount: 0, ustvaKennzahl: null, taxCode: null },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.totalTaxPayable).toBe(0);
    expect(r.totalInputTax).toBe(19);
    expect(r.balance).toBe(-19);
  });

  it("Mischung: 19€ Schuld, 7€ Vorsteuer → balance +12", async () => {
    mockLines.mockResolvedValue([
      { account: "1776", debitAmount: 0, creditAmount: 19, ustvaKennzahl: null, taxCode: null },
      { account: "1576", debitAmount: 7, creditAmount: 0, ustvaKennzahl: null, taxCode: null },
    ]);
    const r = await generateUstva("t-1", PERIOD_START, PERIOD_END);
    expect(r.balance).toBe(12);
  });
});
