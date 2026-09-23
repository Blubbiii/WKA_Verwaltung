/**
 * Produktionsdaten je Anlage für die Stromabrechnung.
 *
 * Vorher stellte `loadProductionData` je Anlage zwei Abfragen (Produktion,
 * Betreiber) — bei 20 Anlagen 41 Rundreisen zur Datenbank statt drei. Und
 * `findFirst` ohne Sortierung nahm bei überlappenden Betreiberzeiträumen
 * irgendeinen davon.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const turbineFindMany = vi.fn();
const productionFindFirst = vi.fn();
const productionFindMany = vi.fn();
const operatorFindFirst = vi.fn();
const operatorFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    turbine: { findMany: (...a: unknown[]) => turbineFindMany(...a) },
    turbineProduction: {
      findFirst: (...a: unknown[]) => productionFindFirst(...a),
      findMany: (...a: unknown[]) => productionFindMany(...a),
    },
    turbineOperator: {
      findFirst: (...a: unknown[]) => operatorFindFirst(...a),
      findMany: (...a: unknown[]) => operatorFindMany(...a),
    },
  },
}));
vi.mock("@/lib/logger", () => ({
  apiLogger: { child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => ({ warn: vi.fn() }) },
}));

import { loadProductionData } from "./energy-calculator";

const ANLAGEN = [
  { id: "t1", designation: "WEA 1" },
  { id: "t2", designation: "WEA 2" },
  { id: "t3", designation: "WEA 3" },
];

beforeEach(() => {
  vi.clearAllMocks();
  turbineFindMany.mockResolvedValue(ANLAGEN);
  // Alte Einzelabfragen, falls der Code sie noch stellt:
  productionFindFirst.mockImplementation(({ where }: { where: { turbineId: string } }) =>
    Promise.resolve({ productionKwh: { t1: 1000, t2: 2000, t3: 0 }[where.turbineId] ?? 0 }),
  );
  operatorFindFirst.mockImplementation(({ where }: { where: { turbineId: string } }) =>
    Promise.resolve(
      where.turbineId === "t3"
        ? null
        : { operatorFundId: "f1", operatorFund: { id: "f1", name: "Betreiber GmbH" } },
    ),
  );
  // Neue Sammelabfragen:
  productionFindMany.mockResolvedValue([
    { turbineId: "t1", productionKwh: 1000 },
    { turbineId: "t2", productionKwh: 2000 },
  ]);
  operatorFindMany.mockResolvedValue([
    { turbineId: "t1", operatorFundId: "f1", operatorFund: { id: "f1", name: "Betreiber GmbH" } },
    { turbineId: "t2", operatorFundId: "f1", operatorFund: { id: "f1", name: "Betreiber GmbH" } },
  ]);
});

describe("loadProductionData", () => {
  it("liefert je Anlage Produktion und Betreiber; Anlagen ohne Betreiber fehlen", async () => {
    const daten = await loadProductionData("park-1", 2026, 3, "tenant-1");
    expect(daten).toEqual([
      { turbineId: "t1", turbineDesignation: "WEA 1", operatorFundId: "f1", operatorFundName: "Betreiber GmbH", productionKwh: 1000 },
      { turbineId: "t2", turbineDesignation: "WEA 2", operatorFundId: "f1", operatorFundName: "Betreiber GmbH", productionKwh: 2000 },
    ]);
  });

  it("stellt eine feste Zahl von Abfragen, unabhängig von der Zahl der Anlagen", async () => {
    await loadProductionData("park-1", 2026, 3, "tenant-1");
    const einzel = productionFindFirst.mock.calls.length + operatorFindFirst.mock.calls.length;
    expect(einzel, "Einzelabfragen je Anlage (N+1)").toBe(0);
    expect(productionFindMany).toHaveBeenCalledTimes(1);
    expect(operatorFindMany).toHaveBeenCalledTimes(1);
  });

  it("die Jahressumme addiert alle Monate einer Anlage", async () => {
    productionFindMany.mockResolvedValue([
      { turbineId: "t1", productionKwh: 400 },
      { turbineId: "t1", productionKwh: 600 },
      { turbineId: "t2", productionKwh: 2000 },
    ]);
    const daten = await loadProductionData("park-1", 2026, null, "tenant-1");
    expect(daten.find((d) => d.turbineId === "t1")?.productionKwh).toBe(1000);
  });

  it("bei überlappenden Betreiberzeiträumen gilt der jüngste", async () => {
    operatorFindMany.mockResolvedValue([
      // Sortiert nach validFrom absteigend — so fordert es die Abfrage an.
      { turbineId: "t1", operatorFundId: "neu", operatorFund: { id: "neu", name: "Neuer Betreiber" } },
      { turbineId: "t1", operatorFundId: "alt", operatorFund: { id: "alt", name: "Alter Betreiber" } },
    ]);
    const daten = await loadProductionData("park-1", 2026, 3, "tenant-1");
    expect(daten.find((d) => d.turbineId === "t1")?.operatorFundId).toBe("neu");
    const aufruf = operatorFindMany.mock.calls[0][0] as { orderBy?: unknown };
    expect(aufruf.orderBy).toEqual({ validFrom: "desc" });
  });
});
