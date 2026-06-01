/**
 * Goldmaster-Tests für AfA & GWG nach §7/§6 EStG (P14).
 *
 * Deckt:
 *  - LINEAR pro-rata-temporis (Anschaffungsmonat voll, Abgangsmonat raus)
 *  - LINEAR: 12 monatliche Beträge = Jahres-AfA
 *  - GWG_SOFORT: 100% im Anschaffungsmonat, Folgemonate 0
 *  - GWG_POOL: 20% pro Jahr, 5 Jahre, dann 0
 *  - DECLINING_BALANCE: bei Anschaffung ≥ 2023 → DegressiveNotAllowedError
 *  - DECLINING_BALANCE: bei Anschaffung < 2023 → läuft
 *  - Vor Anschaffung → 0
 *  - Nach Abgangsdatum → 0
 *  - Restwert-Floor
 *  - resolveAfaMethod Backwards-Compat
 *  - calculateAfaSchedule Akkumulation
 */

import { describe, it, expect } from "vitest";
import { AfaMethod } from "@prisma/client";
import {
  DegressiveNotAllowedError,
  calculateAfaSchedule,
  calculateMonthlyAfa,
  resolveAfaMethod,
} from "./afa";

const baseInput = {
  acquisitionDate: new Date("2024-03-15T00:00:00.000Z"),
  acquisitionCost: 12000,
  residualValue: 0,
  usefulLifeMonths: 120, // 10 Jahre
  alreadyDepreciated: 0,
  disposalDate: null,
};

// ============================================================================
// LINEAR — pro-rata-temporis (§7 Abs. 1 S. 4 EStG)
// ============================================================================

describe("LINEAR — pro-rata-temporis", () => {
  it("vor Anschaffung → 0", () => {
    const r = calculateMonthlyAfa(
      { ...baseInput, method: AfaMethod.LINEAR },
      2024,
      2,
    );
    expect(r.amount).toBe(0);
    expect(r.bookValueBefore).toBe(12000);
  });

  it("Anschaffungsmonat März → voller Monatsbetrag (12000/120 = 100€)", () => {
    const r = calculateMonthlyAfa(
      { ...baseInput, method: AfaMethod.LINEAR },
      2024,
      3,
    );
    expect(r.amount).toBe(100);
    expect(r.bookValueAfter).toBe(11900);
  });

  it("Folgemonat April → 100€", () => {
    const r = calculateMonthlyAfa(
      { ...baseInput, method: AfaMethod.LINEAR, alreadyDepreciated: 100 },
      2024,
      4,
    );
    expect(r.amount).toBe(100);
  });

  it("12 Monate Schedule ab Anschaffung März → 10 × 100€ = 1000€ in 2024", () => {
    const months = calculateAfaSchedule(
      { ...baseInput, method: AfaMethod.LINEAR },
      new Date("2024-01-01T00:00:00Z"),
      new Date("2024-12-31T23:59:59Z"),
    );
    const sum = months.reduce((s, m) => s + m.result.amount, 0);
    // März..Dez = 10 Monate × 100€
    expect(sum).toBe(1000);
  });

  it("Voll-Jahr 2025 → 12 × 100€ = 1200€", () => {
    const months = calculateAfaSchedule(
      { ...baseInput, method: AfaMethod.LINEAR, alreadyDepreciated: 1000 },
      new Date("2025-01-01Z"),
      new Date("2025-12-31Z"),
    );
    const sum = months.reduce((s, m) => s + m.result.amount, 0);
    expect(sum).toBe(1200);
  });

  it("Restwert-Floor — letzte Buchung erreicht residualValue", () => {
    // Asset fast voll abgeschrieben — alreadyDepreciated = 11950
    const r = calculateMonthlyAfa(
      { ...baseInput, method: AfaMethod.LINEAR, alreadyDepreciated: 11950 },
      2034,
      3,
    );
    expect(r.amount).toBe(50); // nur noch 50€ bis Restwert 0
    expect(r.bookValueAfter).toBe(0);
    expect(r.fullyDepreciated).toBe(true);
  });

  it("usefulLifeMonths=0 → amount=0", () => {
    const r = calculateMonthlyAfa(
      { ...baseInput, method: AfaMethod.LINEAR, usefulLifeMonths: 0 },
      2024,
      3,
    );
    expect(r.amount).toBe(0);
  });
});

// ============================================================================
// Abgangsmonat (Disposal)
// ============================================================================

describe("Abgangsmonat — keine AfA mehr", () => {
  it("Disposal 2025-06-10 → Juni 2025 = 0", () => {
    const r = calculateMonthlyAfa(
      {
        ...baseInput,
        method: AfaMethod.LINEAR,
        disposalDate: new Date("2025-06-10Z"),
        alreadyDepreciated: 1500,
      },
      2025,
      6,
    );
    expect(r.amount).toBe(0);
  });

  it("Mai 2025 (vor Disposal) → 100€", () => {
    const r = calculateMonthlyAfa(
      {
        ...baseInput,
        method: AfaMethod.LINEAR,
        disposalDate: new Date("2025-06-10Z"),
        alreadyDepreciated: 1400,
      },
      2025,
      5,
    );
    expect(r.amount).toBe(100);
  });

  it("Juli 2025 (nach Disposal) → 0", () => {
    const r = calculateMonthlyAfa(
      {
        ...baseInput,
        method: AfaMethod.LINEAR,
        disposalDate: new Date("2025-06-10Z"),
        alreadyDepreciated: 1500,
      },
      2025,
      7,
    );
    expect(r.amount).toBe(0);
  });
});

// ============================================================================
// GWG_SOFORT — §6 Abs. 2 EStG
// ============================================================================

describe("GWG_SOFORT — Vollabschreibung im Anschaffungsmonat", () => {
  const gwgInput = {
    acquisitionDate: new Date("2024-04-10Z"),
    acquisitionCost: 800,
    residualValue: 0,
    usefulLifeMonths: 36,
    alreadyDepreciated: 0,
    disposalDate: null,
  };

  it("Anschaffungsmonat → 100% AK", () => {
    const r = calculateMonthlyAfa(
      { ...gwgInput, method: AfaMethod.GWG_SOFORT },
      2024,
      4,
    );
    expect(r.amount).toBe(800);
    expect(r.bookValueAfter).toBe(0);
    expect(r.fullyDepreciated).toBe(true);
  });

  it("Folgemonat → 0", () => {
    const r = calculateMonthlyAfa(
      { ...gwgInput, method: AfaMethod.GWG_SOFORT, alreadyDepreciated: 800 },
      2024,
      5,
    );
    expect(r.amount).toBe(0);
  });

  it("Vor Anschaffungsmonat → 0", () => {
    const r = calculateMonthlyAfa(
      { ...gwgInput, method: AfaMethod.GWG_SOFORT },
      2024,
      3,
    );
    expect(r.amount).toBe(0);
  });
});

// ============================================================================
// GWG_POOL — §6 Abs. 2a EStG, 5-Jahre-Sammelposten
// ============================================================================

describe("GWG_POOL — 20% pro Jahr / 5 Jahre", () => {
  const poolInput = {
    acquisitionDate: new Date("2024-01-15Z"),
    acquisitionCost: 600,
    residualValue: 0,
    usefulLifeMonths: 60,
    alreadyDepreciated: 0,
    disposalDate: null,
  };

  it("Monatlich 600/60 = 10€", () => {
    const r = calculateMonthlyAfa(
      { ...poolInput, method: AfaMethod.GWG_POOL },
      2024,
      1,
    );
    expect(r.amount).toBe(10);
  });

  it("12 Monate × 10€ = 120€ jährlich (= 20% von 600)", () => {
    const months = calculateAfaSchedule(
      { ...poolInput, method: AfaMethod.GWG_POOL },
      new Date("2024-01-01Z"),
      new Date("2024-12-31Z"),
    );
    const sum = months.reduce((s, m) => s + m.result.amount, 0);
    expect(sum).toBe(120);
  });

  it("Nach 5 Jahren → 0 (Pool ausgelaufen)", () => {
    const r = calculateMonthlyAfa(
      { ...poolInput, method: AfaMethod.GWG_POOL, alreadyDepreciated: 600 },
      2029,
      2,
    );
    expect(r.amount).toBe(0);
  });

  it("60 Monate Schedule = volle AK abgeschrieben", () => {
    const months = calculateAfaSchedule(
      { ...poolInput, method: AfaMethod.GWG_POOL },
      new Date("2024-01-01Z"),
      new Date("2028-12-31Z"),
    );
    const sum = months.reduce((s, m) => s + m.result.amount, 0);
    expect(sum).toBe(600);
  });
});

// ============================================================================
// DECLINING_BALANCE — Übergangsregel §52 Abs. 14a EStG
// ============================================================================

describe("DECLINING_BALANCE — seit 2023 für Neuanschaffungen verboten", () => {
  it("Anschaffung 2024 + DECLINING_BALANCE → DegressiveNotAllowedError", () => {
    expect(() =>
      calculateMonthlyAfa(
        {
          acquisitionDate: new Date("2024-03-15Z"),
          acquisitionCost: 10000,
          residualValue: 0,
          usefulLifeMonths: 60,
          alreadyDepreciated: 0,
          method: AfaMethod.DECLINING_BALANCE,
          disposalDate: null,
        },
        2024,
        3,
      ),
    ).toThrow(DegressiveNotAllowedError);
  });

  it("Anschaffung 2023-01-01 → verboten (Stichtag)", () => {
    expect(() =>
      calculateMonthlyAfa(
        {
          acquisitionDate: new Date("2023-01-01Z"),
          acquisitionCost: 10000,
          residualValue: 0,
          usefulLifeMonths: 60,
          alreadyDepreciated: 0,
          method: AfaMethod.DECLINING_BALANCE,
          disposalDate: null,
        },
        2023,
        1,
      ),
    ).toThrow(DegressiveNotAllowedError);
  });

  it("Anschaffung 2022-12-31 → erlaubt (vor Cutoff)", () => {
    const r = calculateMonthlyAfa(
      {
        acquisitionDate: new Date("2022-12-31Z"),
        acquisitionCost: 10000,
        residualValue: 0,
        usefulLifeMonths: 60,
        alreadyDepreciated: 0,
        method: AfaMethod.DECLINING_BALANCE,
        disposalDate: null,
      },
      2022,
      12,
    );
    // Linear-Rate 60 Monate = 12/60 = 20% p.a.; degressiv = 2×20% = 40%, gecappt 30%.
    // Monatlich: 10000 × 0.3 / 12 = 250€
    expect(r.amount).toBe(250);
  });
});

// ============================================================================
// resolveAfaMethod — Backwards-Compat
// ============================================================================

describe("resolveAfaMethod", () => {
  it("Wenn afaMethod gesetzt: dieser Wert", () => {
    expect(
      resolveAfaMethod({ afaMethod: AfaMethod.GWG_SOFORT, depreciationMethod: "LINEAR" }),
    ).toBe(AfaMethod.GWG_SOFORT);
  });

  it("Wenn afaMethod=null + depreciationMethod=LINEAR → LINEAR", () => {
    expect(
      resolveAfaMethod({ afaMethod: null, depreciationMethod: "LINEAR" }),
    ).toBe(AfaMethod.LINEAR);
  });

  it("Wenn afaMethod=null + depreciationMethod=DECLINING_BALANCE → DECLINING_BALANCE", () => {
    expect(
      resolveAfaMethod({ afaMethod: null, depreciationMethod: "DECLINING_BALANCE" }),
    ).toBe(AfaMethod.DECLINING_BALANCE);
  });
});

// ============================================================================
// calculateAfaSchedule — Akkumulation über mehrere Monate
// ============================================================================

describe("calculateAfaSchedule — Akkumulation", () => {
  it("alreadyDepreciated wächst während der Iteration korrekt", () => {
    const schedule = calculateAfaSchedule(
      { ...baseInput, method: AfaMethod.LINEAR },
      new Date("2024-03-01Z"),
      new Date("2024-05-31Z"),
    );
    expect(schedule).toHaveLength(3);
    expect(schedule[0].result.bookValueBefore).toBe(12000);
    expect(schedule[1].result.bookValueBefore).toBe(11900);
    expect(schedule[2].result.bookValueBefore).toBe(11800);
  });

  it("Year-Wechsel funktioniert (Dezember → Januar)", () => {
    const schedule = calculateAfaSchedule(
      { ...baseInput, method: AfaMethod.LINEAR, alreadyDepreciated: 900 },
      new Date("2024-12-01Z"),
      new Date("2025-02-28Z"),
    );
    expect(schedule).toHaveLength(3);
    expect(schedule[0].year).toBe(2024);
    expect(schedule[0].month).toBe(12);
    expect(schedule[1].year).toBe(2025);
    expect(schedule[1].month).toBe(1);
  });
});
