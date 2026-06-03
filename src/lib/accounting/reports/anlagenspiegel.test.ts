/**
 * Tests für Anlagenspiegel (P25, HGB §284 Abs. 3).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fixedAsset: { findMany: vi.fn() },
    // M-6 Perf: code lädt cumAfaStart separat via groupBy.
    fixedAssetDepreciation: { groupBy: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { computeAnlagenspiegel } from "./anlagenspiegel";

interface TestAsset {
  category: string;
  acquisitionDate: Date;
  acquisitionCost: number;
  residualValue: number;
  disposalDate: Date | null;
  depreciations: Array<{ periodEnd: Date; amount: number }>;
}

const mockAssets = prisma.fixedAsset.findMany as unknown as ReturnType<typeof vi.fn>;
const mockGroupBy = prisma.fixedAssetDepreciation.groupBy as unknown as ReturnType<
  typeof vi.fn
>;

/**
 * Setzt beide Mocks aus alter Test-Form (Assets mit FULL depreciations-Liste).
 * - assets.depreciations wird auf das Berichtsjahr gefiltert
 * - cumAfaStart aggregiert alle Depreciations VOR fiscalYear → groupBy-Buckets
 */
function setupAssetsForYear(assets: TestAsset[], fiscalYear: number): void {
  const yearStart = new Date(Date.UTC(fiscalYear, 0, 1));
  const yearEnd = new Date(Date.UTC(fiscalYear, 11, 31, 23, 59, 59));

  const filteredAssets = assets.map((a, idx) => ({
    id: `asset-${idx}`,
    ...a,
    depreciations: a.depreciations.filter(
      (d) => d.periodEnd >= yearStart && d.periodEnd <= yearEnd,
    ),
  }));

  const groupBuckets = assets
    .map((a, idx) => {
      const beforeYear = a.depreciations.filter((d) => d.periodEnd < yearStart);
      const sum = beforeYear.reduce((s, d) => s + d.amount, 0);
      return { assetId: `asset-${idx}`, _sum: { amount: sum } };
    })
    .filter((b) => b._sum.amount !== 0);

  mockAssets.mockResolvedValue(filteredAssets);
  mockGroupBy.mockResolvedValue(groupBuckets);
}

beforeEach(() => {
  mockAssets.mockReset();
  mockGroupBy.mockReset();
  mockGroupBy.mockResolvedValue([]);
});

describe("computeAnlagenspiegel — leeres Anlagevermögen", () => {
  it("Keine Assets → leere rows + 0-Totals", async () => {
    mockAssets.mockResolvedValue([]);
    const r = await computeAnlagenspiegel("t-1", 2025);
    expect(r.rows).toEqual([]);
    expect(r.totals.ahkEnde).toBe(0);
    expect(r.totals.buchwertEnde).toBe(0);
  });
});

describe("computeAnlagenspiegel — Bestand zu Jahresbeginn", () => {
  it("Asset von 2023 mit 10.000€ + 1.000€ kumAfA, +500€ Jahres-AfA → Buchwert Ende 8.500€", async () => {
    setupAssetsForYear([
      {
        category: "Anlagen",
        acquisitionDate: new Date("2023-01-01Z"),
        acquisitionCost: 10000,
        residualValue: 0,
        disposalDate: null,
        depreciations: [
          { periodEnd: new Date("2024-12-31Z"), amount: 1000 }, // bis Vorjahr
          { periodEnd: new Date("2025-12-31Z"), amount: 500 }, // im Jahr
        ],
      },
    ], 2025);

    const r = await computeAnlagenspiegel("t-1", 2025);
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0];
    expect(row.category).toBe("Anlagen");
    expect(row.assetCount).toBe(1);
    expect(row.ahkBeginn).toBe(10000);
    expect(row.ahkZugaenge).toBe(0);
    expect(row.ahkAbgaenge).toBe(0);
    expect(row.ahkEnde).toBe(10000);
    expect(row.afaKumBeginn).toBe(1000);
    expect(row.afaJahr).toBe(500);
    expect(row.afaKumEnde).toBe(1500);
    expect(row.buchwertEnde).toBe(8500);
    expect(row.buchwertVorjahresEnde).toBe(9000);
  });
});

describe("computeAnlagenspiegel — Zugang im Jahr", () => {
  it("Neue Anschaffung 5000€ + 250€ AfA → Zugang 5000, Buchwert Ende 4750", async () => {
    setupAssetsForYear([
      {
        category: "Maschinen",
        acquisitionDate: new Date("2025-06-15Z"),
        acquisitionCost: 5000,
        residualValue: 0,
        disposalDate: null,
        depreciations: [{ periodEnd: new Date("2025-12-31Z"), amount: 250 }],
      },
    ], 2025);

    const r = await computeAnlagenspiegel("t-1", 2025);
    const row = r.rows[0];
    expect(row.ahkBeginn).toBe(0);
    expect(row.ahkZugaenge).toBe(5000);
    expect(row.ahkEnde).toBe(5000);
    expect(row.afaJahr).toBe(250);
    expect(row.buchwertEnde).toBe(4750);
    expect(row.buchwertVorjahresEnde).toBe(0);
  });
});

describe("computeAnlagenspiegel — Abgang im Jahr", () => {
  it("Bestand 2023 + Abgang im Jahr → ahkAbgaenge gesetzt, ahkEnde 0", async () => {
    setupAssetsForYear([
      {
        category: "Fahrzeuge",
        acquisitionDate: new Date("2023-01-01Z"),
        acquisitionCost: 20000,
        residualValue: 0,
        disposalDate: new Date("2025-06-30Z"),
        depreciations: [
          { periodEnd: new Date("2024-12-31Z"), amount: 4000 },
          { periodEnd: new Date("2025-06-30Z"), amount: 1000 },
        ],
      },
    ], 2025);

    const r = await computeAnlagenspiegel("t-1", 2025);
    const row = r.rows[0];
    expect(row.ahkBeginn).toBe(20000);
    expect(row.ahkAbgaenge).toBe(20000);
    expect(row.ahkEnde).toBe(0);
    expect(row.afaJahr).toBe(1000);
    expect(row.afaAbgaenge).toBe(5000);
    expect(row.buchwertEnde).toBe(0);
  });
});

describe("computeAnlagenspiegel — Mehrere Kategorien + Totals", () => {
  it("2 Kategorien werden gruppiert + Summe stimmt", async () => {
    setupAssetsForYear([
      {
        category: "Anlagen",
        acquisitionDate: new Date("2024-01-01Z"),
        acquisitionCost: 10000,
        residualValue: 0,
        disposalDate: null,
        depreciations: [{ periodEnd: new Date("2025-12-31Z"), amount: 1000 }],
      },
      {
        category: "Maschinen",
        acquisitionDate: new Date("2024-01-01Z"),
        acquisitionCost: 5000,
        residualValue: 0,
        disposalDate: null,
        depreciations: [{ periodEnd: new Date("2025-12-31Z"), amount: 500 }],
      },
    ], 2025);

    const r = await computeAnlagenspiegel("t-1", 2025);
    expect(r.rows).toHaveLength(2);
    expect(r.totals.ahkBeginn).toBe(15000);
    expect(r.totals.ahkEnde).toBe(15000);
    expect(r.totals.afaJahr).toBe(1500);
    expect(r.totals.assetCount).toBe(2);
  });
});

describe("computeAnlagenspiegel — Restwert respektiert", () => {
  it("Buchwert wird nicht unter residualValue gedrückt", async () => {
    setupAssetsForYear([
      {
        category: "Test",
        acquisitionDate: new Date("2020-01-01Z"),
        acquisitionCost: 10000,
        residualValue: 500,
        disposalDate: null,
        depreciations: [
          { periodEnd: new Date("2024-12-31Z"), amount: 9500 }, // bereits voll abgeschrieben
        ],
      },
    ], 2025);

    const r = await computeAnlagenspiegel("t-1", 2025);
    expect(r.rows[0].buchwertEnde).toBe(500); // Restwert-Floor
  });
});
