/**
 * Tests für Bilanz-Generator (P15).
 *
 * Hauptfokus: Bilanz-Identität summeAktiva = summePassiva. Bei jedem
 * konsistenten Buchungssatz muss die Identität halten.
 *
 * Mock-Setup: prisma.ledgerAccount + prisma.openingBalance +
 * prisma.journalEntryLine werden gemockt.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { BalanceSheetSection } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ledgerAccount: { findMany: vi.fn() },
    openingBalance: { findMany: vi.fn() },
    journalEntryLine: { groupBy: vi.fn() },
  },
}));
vi.mock("@/lib/tenant-settings", () => ({
  getTenantSettings: vi.fn().mockResolvedValue({
    bilanzToleranceEur: 0.01,
    datevAccountAnnualResult: "9999",
  }),
}));
// P-3 Sprint 2: Reports-Cache (Redis) — in Tests no-op machen, sonst
// kann der Cache stale Werte aus früheren Test-Runs liefern.
vi.mock("@/lib/cache/reports", () => ({
  getCachedReport: <T,>(_name: string, _tenantId: string, _key: string, fetchFn: () => Promise<T>) => fetchFn(),
  invalidateReportsCache: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { computeBilanz } from "./bilanz";

const mockAccts = prisma.ledgerAccount.findMany as unknown as ReturnType<typeof vi.fn>;
const mockOpenings = prisma.openingBalance.findMany as unknown as ReturnType<typeof vi.fn>;
// P-1 Sprint 2: code nutzt jetzt prisma.journalEntryLine.groupBy statt findMany.
// Buckets haben Shape: { account, _sum: { debitAmount, creditAmount } }
const mockLines = prisma.journalEntryLine.groupBy as unknown as ReturnType<typeof vi.fn>;

function toBuckets(lines: Array<{ account: string; debitAmount: number; creditAmount: number }>) {
  // Aggregiert pro Account (entspricht prisma.groupBy({ by: ['account'], _sum })).
  const sums = new Map<string, { debitAmount: number; creditAmount: number }>();
  for (const l of lines) {
    const cur = sums.get(l.account) ?? { debitAmount: 0, creditAmount: 0 };
    cur.debitAmount += l.debitAmount;
    cur.creditAmount += l.creditAmount;
    sums.set(l.account, cur);
  }
  return Array.from(sums.entries()).map(([account, _sum]) => ({ account, _sum }));
}

const ASOF = new Date("2025-12-31T23:59:59Z");

beforeEach(() => {
  mockAccts.mockReset();
  mockOpenings.mockReset();
  mockLines.mockReset();
  mockOpenings.mockResolvedValue([]);
});

// =============================================================================
// Identitäts-Garantie (A = P)
// =============================================================================

describe("Bilanz — Identitätsgarantie summeAktiva = summePassiva", () => {
  it("Leere Bilanz → A=0, P=0, Diff=0", async () => {
    mockAccts.mockResolvedValue([]);
    mockLines.mockResolvedValue([]);
    const r = await computeBilanz("t-1", 2025, ASOF);
    expect(r.summeAktiva).toBe(0);
    expect(r.summePassiva).toBe(0);
    expect(r.differenz).toBe(0);
    expect(r.warnings).toEqual([]);
  });

  it("Einlage 10.000€ Bar in Eigenkapital → A=P=10.000", async () => {
    // Konto 1800 Bank (Aktiva), Konto 2000 Eigenkapital (Passiva)
    mockAccts.mockResolvedValue([
      {
        id: "a-1",
        accountNumber: "1800",
        name: "Bank",
        balanceSheetSection: BalanceSheetSection.ASSET_CURRENT,
      },
      {
        id: "a-2",
        accountNumber: "2000",
        name: "Eigenkapital",
        balanceSheetSection: BalanceSheetSection.EQUITY,
      },
    ]);
    mockLines.mockResolvedValue(toBuckets([
      { account: "1800", debitAmount: 10000, creditAmount: 0 },
      { account: "2000", debitAmount: 0, creditAmount: 10000 },
    ]));
    const r = await computeBilanz("t-1", 2025, ASOF);
    expect(r.summeAktiva).toBe(10000);
    expect(r.summePassiva).toBe(10000);
    expect(r.differenz).toBe(0);
  });

  it("Kauf Anlagegut: 5.000€ Maschine an Bank → A=A (Tausch)", async () => {
    mockAccts.mockResolvedValue([
      {
        id: "a-1",
        accountNumber: "0500",
        name: "Maschinen",
        balanceSheetSection: BalanceSheetSection.ASSET_FIXED,
      },
      {
        id: "a-2",
        accountNumber: "1800",
        name: "Bank",
        balanceSheetSection: BalanceSheetSection.ASSET_CURRENT,
      },
    ]);
    // Eröffnungsbilanz: Bank hat 5000€
    mockOpenings.mockResolvedValue([
      { ledgerAccountId: "a-2", debitAmount: 5000, creditAmount: 0 },
    ]);
    mockLines.mockResolvedValue(toBuckets([
      { account: "0500", debitAmount: 5000, creditAmount: 0 },
      { account: "1800", debitAmount: 0, creditAmount: 5000 },
    ]));
    const r = await computeBilanz("t-1", 2025, ASOF);
    // Maschinen 5000, Bank 0 → Aktiva 5000
    // Keine Passiva-Bewegung → Passiva 0
    // Aber Anfangskapital nicht verbucht → Differenz 5000.
    // → Warning erwartet
    expect(r.summeAktiva).toBe(5000);
    expect(r.summePassiva).toBe(0);
    expect(r.differenz).toBe(5000);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("Mit Opening-Balance Eigenkapital → A=P=5.000 (ausgeglichen)", async () => {
    mockAccts.mockResolvedValue([
      {
        id: "a-1",
        accountNumber: "1800",
        name: "Bank",
        balanceSheetSection: BalanceSheetSection.ASSET_CURRENT,
      },
      {
        id: "a-2",
        accountNumber: "2000",
        name: "Eigenkapital",
        balanceSheetSection: BalanceSheetSection.EQUITY,
      },
    ]);
    mockOpenings.mockResolvedValue([
      { ledgerAccountId: "a-1", debitAmount: 5000, creditAmount: 0 },
      { ledgerAccountId: "a-2", debitAmount: 0, creditAmount: 5000 },
    ]);
    mockLines.mockResolvedValue([]);
    const r = await computeBilanz("t-1", 2025, ASOF);
    expect(r.summeAktiva).toBe(5000);
    expect(r.summePassiva).toBe(5000);
    expect(r.differenz).toBe(0);
  });
});

// =============================================================================
// Range-Fallback (Konto ohne explizite Section)
// =============================================================================

describe("Bilanz — Range-Fallback", () => {
  it("Konto ohne balanceSheetSection nutzt SKR04-Range", async () => {
    mockAccts.mockResolvedValue([
      {
        id: "a-1",
        accountNumber: "1200", // Range → ASSET_CURRENT
        name: "Forderungen",
        balanceSheetSection: null, // explizit null
      },
      {
        id: "a-2",
        accountNumber: "2000", // Range → EQUITY
        name: "Eigenkapital",
        balanceSheetSection: null,
      },
    ]);
    mockLines.mockResolvedValue(toBuckets([
      { account: "1200", debitAmount: 1000, creditAmount: 0 },
      { account: "2000", debitAmount: 0, creditAmount: 1000 },
    ]));
    const r = await computeBilanz("t-1", 2025, ASOF);
    expect(r.summeAktiva).toBe(1000);
    expect(r.summePassiva).toBe(1000);
    expect(r.differenz).toBe(0);
  });
});

// =============================================================================
// Jahresergebnis ins Eigenkapital
// =============================================================================

describe("Bilanz — Jahresergebnis fließt ins EK", () => {
  it("1.000€ Erlös, 600€ Aufwand → Gewinn 400€ in EK", async () => {
    mockAccts.mockResolvedValue([
      {
        id: "a-1",
        accountNumber: "1800",
        name: "Bank",
        balanceSheetSection: BalanceSheetSection.ASSET_CURRENT,
      },
      {
        id: "a-2",
        accountNumber: "2000",
        name: "Eigenkapital",
        balanceSheetSection: BalanceSheetSection.EQUITY,
      },
      // GuV-Konten — keine Section!
      { id: "a-3", accountNumber: "8400", name: "Erlöse", balanceSheetSection: null },
      { id: "a-4", accountNumber: "6710", name: "Aufwand", balanceSheetSection: null },
    ]);
    mockLines.mockResolvedValue(toBuckets([
      { account: "1800", debitAmount: 1000, creditAmount: 0 },
      { account: "8400", debitAmount: 0, creditAmount: 1000 },
      { account: "1800", debitAmount: 0, creditAmount: 600 },
      { account: "6710", debitAmount: 600, creditAmount: 0 },
    ]));
    const r = await computeBilanz("t-1", 2025, ASOF);
    // Aktiva: Bank 400€
    // Passiva: EK = Jahresüberschuss 400€
    expect(r.jahresergebnis).toBe(400);
    expect(r.summeAktiva).toBe(400);
    expect(r.summePassiva).toBe(400);
    expect(r.differenz).toBe(0);
  });
});

// =============================================================================
// Warnings
// =============================================================================

describe("Bilanz — Warnings", () => {
  it("Unklassifiziertes Konto mit Saldo → Warning", async () => {
    mockAccts.mockResolvedValue([
      {
        id: "a-1",
        accountNumber: "abc", // weder Range noch Section
        name: "Mystery",
        balanceSheetSection: null,
      },
    ]);
    mockLines.mockResolvedValue(toBuckets([
      { account: "abc", debitAmount: 100, creditAmount: 0 },
    ]));
    const r = await computeBilanz("t-1", 2025, ASOF);
    expect(r.warnings.some((w) => w.includes("abc"))).toBe(true);
  });
});
