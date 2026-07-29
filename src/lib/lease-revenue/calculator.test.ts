/**
 * Invarianten-Tests für den Lease-Revenue-Calculator (Nutzungsentgelt).
 *
 * Kern-Invariante (Audit 2026-07, Findings F1-F7):
 *
 *   Σ item.subtotalEur === actualFeeEur + Σ Zuschläge
 *                          (Weg / Kabel / Ausgleich / Versiegelung)
 *
 * Der verteilte "Topf" (actualFeeEur = MAX(Erlösanteil, Mindestpacht)) darf
 * weder über- noch unterverteilt werden. Zuschläge sind Positionen, die
 * ZUSÄTZLICH zum Topf fließen (gesonderte Entschädigungssätze aus dem Park).
 *
 * Fixture bewusst so gebaut, dass ein Flurstück an ZWEI Pachtgeber verpachtet
 * ist — das ist der Kern von F1 (Doppelzählung) und F3 (Standort-Topf).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ------------------------------------------------------------------
// Prisma-Mock (muss VOR dem Import des Calculators stehen)
// ------------------------------------------------------------------

const parkFindFirst = vi.fn();
const energyAggregate = vi.fn();
const energyFindFirst = vi.fn();
const energyFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    park: { findFirst: (...a: unknown[]) => parkFindFirst(...a) },
    energySettlement: {
      aggregate: (...a: unknown[]) => energyAggregate(...a),
      findFirst: (...a: unknown[]) => energyFindFirst(...a),
      findUnique: (...a: unknown[]) => energyFindUnique(...a),
    },
    leaseRevenueSettlement: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    leaseRevenueSettlementItem: { deleteMany: vi.fn(), create: vi.fn() },
    leasePlot: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { calculateSettlementFees, loadSettlementData } from "./calculator";

// ------------------------------------------------------------------
// Fixture
// ------------------------------------------------------------------

const TENANT = "tenant-1";
const PARK = "park-1";
const YEAR = 2025;

/** Park-Stammdaten laut Audit-Szenario */
const MIN_RENT_PER_TURBINE = 5000; // €/WEA/Jahr
const WEA_SHARE = 10; // %
const POOL_SHARE = 90; // %
const REVENUE_SHARE_PCT = 5; // %
const PARK_REVENUE = 2_000_000; // €
const TURBINE_COUNT = 5;

const WEG_RATE = 0.5; // €/m²
const KABEL_RATE = 5; // €/m
const AUSGLEICH_RATE = 0.15; // €/m²

/** Erwartete Kennzahlen (von Hand nachgerechnet) */
const EXPECTED_CALCULATED_FEE = (PARK_REVENUE * REVENUE_SHARE_PCT) / 100; // 100.000
const EXPECTED_MIN_GUARANTEE = MIN_RENT_PER_TURBINE * TURBINE_COUNT; // 25.000
const EXPECTED_ACTUAL_FEE = Math.max(EXPECTED_CALCULATED_FEE, EXPECTED_MIN_GUARANTEE); // 100.000

/**
 * Erwartete Zuschläge (ZUSÄTZLICH zum Topf):
 *  - WEG  : nur ANNUAL-Flächen → 4.000 m² × 0,50 €/m² = 2.000 €
 *           (die 25.000 m² ONE_TIME-Fläche darf NICHT jährlich fließen → F4)
 *  - KABEL: nur lengthM × €/m. Die Trasse hat keine lengthM gepflegt →  0 €
 *           (Fläche als Länge zu interpretieren wäre F6)
 *  - AUSGLEICH: fließt in diesem Calculator bewusst in die Poolfläche ein
 *           (Pool-Modell), erzeugt also KEINEN separaten Zuschlag → 0 €
 *  - VERSIEGELUNG: es gibt keinen PlotAreaType dafür → strukturell 0 €  (F7)
 */
const EXPECTED_WEG_FEE = 4000 * WEG_RATE; // 2.000
const EXPECTED_KABEL_FEE = 0;
const EXPECTED_AUSGLEICH_FEE = 0;
const EXPECTED_SEALED_FEE = 0;
const EXPECTED_SURCHARGES =
  EXPECTED_WEG_FEE + EXPECTED_KABEL_FEE + EXPECTED_AUSGLEICH_FEE + EXPECTED_SEALED_FEE;

function dec(n: number) {
  return n;
}

function makeArea(
  areaType: string,
  opts: { areaSqm?: number | null; lengthM?: number | null; compensationType?: string } = {},
) {
  return {
    id: `${areaType}-${Math.random().toString(36).slice(2, 8)}`,
    areaType,
    areaSqm: opts.areaSqm != null ? dec(opts.areaSqm) : null,
    lengthM: opts.lengthM != null ? dec(opts.lengthM) : null,
    compensationType: opts.compensationType ?? "ANNUAL",
    compensationFixedAmount: null,
    compensationPercentage: null,
  };
}

function makeLease(id: string, lessorId: string) {
  return {
    id,
    status: "ACTIVE",
    lessorId,
    directBillingFundId: null,
    lessor: { id: lessorId },
  };
}

/**
 * Baut die Park-Fixture.
 *
 * Flurstück P1  →  verpachtet an Lease A UND Lease B (zwei Miteigentümer!)
 *   · POOL 10.000 m²
 *   · WEA_STANDORT (1 Anlage, 2.000 m²)
 *
 * Flurstück P2  →  verpachtet an Lease C
 *   · POOL 10.000 m²
 *   · 4 × WEA_STANDORT (je 2.000 m²)
 *   · WEG 4.000 m² ANNUAL      → 2.000 € Zuschlag
 *   · WEG 25.000 m² ONE_TIME   → darf NICHT jährlich fließen
 *   · KABEL 2.000 m², lengthM = null → 0 € (kein €/m-Wert ableitbar)
 *   · AUSGLEICH 20.000 m²
 */
function buildPark(opts: { annualOnly?: boolean } = {}) {
  const leaseA = makeLease("lease-A", "person-A");
  const leaseB = makeLease("lease-B", "person-B");
  const leaseC = makeLease("lease-C", "person-C");

  const p1Areas = [
    makeArea("POOL", { areaSqm: 10_000 }),
    makeArea("WEA_STANDORT", { areaSqm: 2_000 }),
  ];

  const p2Areas = [
    makeArea("POOL", { areaSqm: 10_000 }),
    makeArea("WEA_STANDORT", { areaSqm: 2_000 }),
    makeArea("WEA_STANDORT", { areaSqm: 2_000 }),
    makeArea("WEA_STANDORT", { areaSqm: 2_000 }),
    makeArea("WEA_STANDORT", { areaSqm: 2_000 }),
    makeArea("WEG", { areaSqm: 4_000 }),
    makeArea("WEG", { areaSqm: 25_000, compensationType: "ONE_TIME" }),
    makeArea("KABEL", { areaSqm: 2_000, lengthM: null }),
    makeArea("AUSGLEICH", { areaSqm: 20_000 }),
  ].filter((a) => (opts.annualOnly ? a.compensationType === "ANNUAL" : true));

  return {
    id: PARK,
    tenantId: TENANT,
    name: "WP Testpark",
    commissioningDate: new Date(Date.UTC(2020, 0, 1)),
    minimumRentPerTurbine: dec(MIN_RENT_PER_TURBINE),
    weaSharePercentage: dec(WEA_SHARE),
    poolSharePercentage: dec(POOL_SHARE),
    wegCompensationPerSqm: dec(WEG_RATE),
    kabelCompensationPerM: dec(KABEL_RATE),
    ausgleichCompensationPerSqm: dec(AUSGLEICH_RATE),
    billingEntityFundId: null,
    revenuePhases: [
      { phaseNumber: 1, startYear: 1, endYear: null, revenueSharePercentage: dec(REVENUE_SHARE_PCT) },
    ],
    turbines: Array.from({ length: TURBINE_COUNT }, (_, i) => ({
      id: `turbine-${i + 1}`,
      designation: `WEA ${i + 1}`,
      ratedPowerKw: dec(3000),
      minimumRent: null,
      weaSharePercentage: null,
      poolSharePercentage: null,
    })),
    plots: [
      {
        id: "plot-1",
        plotNumber: "P1",
        cadastralDistrict: "Testflur",
        fieldNumber: "1",
        areaSqm: dec(12_000),
        plotAreas: p1Areas,
        leasePlots: [
          { leaseId: leaseA.id, plotId: "plot-1", lease: leaseA },
          { leaseId: leaseB.id, plotId: "plot-1", lease: leaseB },
        ],
      },
      {
        id: "plot-2",
        plotNumber: "P2",
        cadastralDistrict: "Testflur",
        fieldNumber: "2",
        areaSqm: dec(60_000),
        plotAreas: p2Areas,
        leasePlots: [{ leaseId: leaseC.id, plotId: "plot-2", lease: leaseC }],
      },
    ],
  };
}

/**
 * Emuliert den Prisma-`where`-Filter auf `plotAreas`, damit der Mock sich wie
 * die echte DB verhält (der Calculator darf den Filter selbst setzen).
 */
function applyPlotAreaFilter(park: ReturnType<typeof buildPark>, args: unknown) {
  const include = (args as { include?: { plots?: { include?: { plotAreas?: unknown } } } })?.include;
  const plotAreasArg = include?.plots?.include?.plotAreas;
  const where =
    typeof plotAreasArg === "object" && plotAreasArg !== null
      ? (plotAreasArg as { where?: { compensationType?: string } }).where
      : undefined;
  if (!where?.compensationType) return park;
  return {
    ...park,
    plots: park.plots.map((p) => ({
      ...p,
      plotAreas: p.plotAreas.filter((a) => a.compensationType === where.compensationType),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const park = buildPark();
  parkFindFirst.mockImplementation(async (args: unknown) => applyPlotAreaFilter(park, args));
  energyAggregate.mockResolvedValue({ _sum: { netOperatorRevenueEur: dec(PARK_REVENUE) } });
  energyFindFirst.mockResolvedValue(null);
  energyFindUnique.mockResolvedValue(null);
});

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe("Lease-Revenue Invarianten", () => {
  it("Basisannahmen der Fixture stimmen (Topf = 100.000 €)", async () => {
    const input = await loadSettlementData(TENANT, PARK, YEAR);
    const result = calculateSettlementFees(input);

    expect(result.calculatedFeeEur).toBeCloseTo(EXPECTED_CALCULATED_FEE, 2);
    expect(result.minimumGuaranteeEur).toBeCloseTo(EXPECTED_MIN_GUARANTEE, 2);
    expect(result.actualFeeEur).toBeCloseTo(EXPECTED_ACTUAL_FEE, 2);
    expect(result.weaStandortTotalEur).toBeCloseTo(10_000, 2);
    expect(result.poolAreaTotalEur).toBeCloseTo(90_000, 2);
  });

  it("INVARIANTE: Σ subtotalEur === actualFeeEur + Σ Zuschläge", async () => {
    const input = await loadSettlementData(TENANT, PARK, YEAR);
    const result = calculateSettlementFees(input);

    const sumSubtotal = result.items.reduce((s, i) => s + i.subtotalEur, 0);

    expect(sumSubtotal).toBeCloseTo(EXPECTED_ACTUAL_FEE + EXPECTED_SURCHARGES, 2);
  });

  it("INVARIANTE: Standort-Topf wird exakt (weder über- noch unter-) verteilt", async () => {
    const input = await loadSettlementData(TENANT, PARK, YEAR);
    const result = calculateSettlementFees(input);

    const sumStandort = result.items.reduce((s, i) => s + i.standortFeeEur, 0);
    expect(sumStandort).toBeCloseTo(result.weaStandortTotalEur, 2);
  });

  it("INVARIANTE: Pool-Topf wird exakt verteilt", async () => {
    const input = await loadSettlementData(TENANT, PARK, YEAR);
    const result = calculateSettlementFees(input);

    const sumPool = result.items.reduce((s, i) => s + i.poolFeeEur, 0);
    expect(sumPool).toBeCloseTo(result.poolAreaTotalEur, 2);
  });

  it("F1: Flurstück mit zwei Pachtgebern wird hälftig geteilt, C wird nicht verwässert", async () => {
    const input = await loadSettlementData(TENANT, PARK, YEAR);
    const result = calculateSettlementFees(input);

    const a = result.items.find((i) => i.leaseId === "lease-A")!;
    const b = result.items.find((i) => i.leaseId === "lease-B")!;
    const c = result.items.find((i) => i.leaseId === "lease-C")!;

    // P1-Pool (10.000 m²) hälftig auf A und B
    expect(a.poolAreaSqm).toBeCloseTo(5_000, 2);
    expect(b.poolAreaSqm).toBeCloseTo(5_000, 2);
    // C hat P2-Pool 10.000 m² + Ausgleich 20.000 m² (Pool-Modell)
    expect(c.poolAreaSqm).toBeCloseTo(30_000, 2);

    expect(a.poolFeeEur).toBeCloseTo(b.poolFeeEur, 2);
    // Gesamt-Poolfläche 40.000 m² → C 75 % von 90.000 €
    expect(c.poolFeeEur).toBeCloseTo(67_500, 2);
    expect(a.poolFeeEur).toBeCloseTo(11_250, 2);
  });

  it("F4: ONE_TIME-Entschädigungen fließen nicht in die Jahresabrechnung", async () => {
    const input = await loadSettlementData(TENANT, PARK, YEAR);
    const c = input.leases.find((l) => l.leaseId === "lease-C")!;

    // Nur die 4.000 m² ANNUAL-Wegefläche → 2.000 €.
    // Mit ONE_TIME wären es 2.000 + 12.500 = 14.500 €.
    expect(c.roadUsageFeeEur).toBeCloseTo(EXPECTED_WEG_FEE, 2);
  });

  it("F6: Kabeltrasse ohne lengthM ergibt 0 m (keine m²-als-Meter-Umdeutung)", async () => {
    const input = await loadSettlementData(TENANT, PARK, YEAR);
    const c = input.leases.find((l) => l.leaseId === "lease-C")!;

    expect(c.cableLengthM).toBeCloseTo(0, 2);
  });

  it("F7: sealedAreaRate ist 0, solange kein PlotAreaType für versiegelte Fläche existiert", async () => {
    const input = await loadSettlementData(TENANT, PARK, YEAR);
    for (const lease of input.leases) {
      expect(lease.sealedAreaSqm).toBe(0);
      expect(lease.sealedAreaRate).toBe(0);
    }
  });

  it("F3: Summe der Standort-Anteile entspricht der Anzahl WEA-Standorte", async () => {
    const input = await loadSettlementData(TENANT, PARK, YEAR);
    const sumUnits = input.leases.reduce(
      (s, l) => s + (l.standortShareUnits ?? l.turbineCount),
      0,
    );
    expect(sumUnits).toBeCloseTo(input.totalStandortShareUnits ?? input.totalWEACount, 4);
    expect(sumUnits).toBeCloseTo(5, 4);
  });

  it("F12: Jahres-EnergySettlement und Monats-Settlements werden nicht doppelt gezählt", async () => {
    await loadSettlementData(TENANT, PARK, YEAR);

    // Es MUSS eine Basis gewählt werden: entweder das Jahres-Settlement
    // (month = null) oder die Monats-Settlements — nie beides summiert.
    const usedYearlyLookup = energyFindFirst.mock.calls.length > 0;
    const aggregateWhere = energyAggregate.mock.calls[0]?.[0]?.where as
      | { month?: unknown }
      | undefined;
    const aggregateFiltersMonth =
      aggregateWhere !== undefined && "month" in (aggregateWhere ?? {});

    expect(usedYearlyLookup || aggregateFiltersMonth).toBe(true);
  });
});
