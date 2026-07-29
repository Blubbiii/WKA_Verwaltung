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
  GwgThresholdViolationError,
  calculateAfaSchedule,
  calculateMonthlyAfa,
  resolveAfaMethod,
  resolveDegressiveRate,
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
    // Asset fast voll abgeschrieben — alreadyDepreciated = 11950.
    // F16: Der Test stand vorher auf 2034-03. Anschaffung 2024-03 + 120 Monate
    // Nutzungsdauer endet aber mit 2034-02 — 2034-03 wäre Monat 121 und damit
    // genau die Buchung, die es nach §7 Abs. 1 EStG nicht geben darf.
    const r = calculateMonthlyAfa(
      { ...baseInput, method: AfaMethod.LINEAR, alreadyDepreciated: 11950 },
      2034,
      2,
    );
    expect(r.amount).toBe(50); // nur noch 50€ bis Restwert 0
    expect(r.bookValueAfter).toBe(0);
    expect(r.fullyDepreciated).toBe(true);
  });

  it("F16: Monat 121 (2034-03) erzeugt keine Buchung mehr", () => {
    const r = calculateMonthlyAfa(
      { ...baseInput, method: AfaMethod.LINEAR, alreadyDepreciated: 11950 },
      2034,
      3,
    );
    expect(r.amount).toBe(0);
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
    // F13: KORRIGIERTE Erwartung. Vorher stand hier 250 € — das beruhte auf
    // "2× linear, max. 30 %", was in keiner Fassung des §7 Abs. 2 EStG steht.
    // Anschaffung 31.12.2022 fällt in das Corona-Fenster 2020–2022:
    // Vervielfältiger 2,5 / Höchstsatz 25 %.
    //   linear 12/60 = 20 % → 2,5 × 20 % = 50 % → gecappt auf 25 %
    //   Jahresbetrag 10.000 × 0,25 = 2.500 € → monatlich 208,33 €
    // (Dezember als Anschaffungsmonat = 1 Monat zeitanteilig.)
    expect(r.amount).toBe(208.33);
  });
});

// ============================================================================
// F13 — Degressive AfA: Satz-Tabelle & Methodik
// ============================================================================

describe("F13 — resolveDegressiveRate (§7 Abs. 2 EStG Zeitfassungen)", () => {
  it("2020–2022: Vervielfältiger 2,5 / Höchstsatz 25 %", () => {
    const r = resolveDegressiveRate(new Date("2021-05-01Z"), 60);
    expect(r.matched).toBe(true);
    expect(r.factor).toBe(2.5);
    expect(r.maxRate).toBe(0.25);
    // linear 20 % × 2,5 = 50 % → Cap 25 %
    expect(r.rate).toBe(0.25);
  });

  it("2024er-Fassung: Vervielfältiger 2,0 / Höchstsatz 20 %", () => {
    const r = resolveDegressiveRate(new Date("2024-06-01Z"), 120);
    expect(r.factor).toBe(2.0);
    expect(r.maxRate).toBe(0.2);
    // linear 10 % × 2,0 = 20 % → genau am Cap
    expect(r.rate).toBeCloseTo(0.2, 10);
  });

  it("Cap greift nur wenn linear × Faktor darüber liegt", () => {
    // Nutzungsdauer 30 Jahre → linear 3,33 % × 2,5 = 8,33 % (weit unter Cap)
    const r = resolveDegressiveRate(new Date("2021-01-01Z"), 360);
    expect(r.rate).toBeCloseTo((12 / 360) * 2.5, 10);
  });

  it("Datum außerhalb aller Fenster → Fallback (2,0 / 20 %), matched=false", () => {
    const r = resolveDegressiveRate(new Date("2015-03-01Z"), 60);
    expect(r.matched).toBe(false);
    expect(r.factor).toBe(2.0);
    expect(r.rate).toBe(0.2);
  });
});

describe("F13 — Degressive AfA ist Jahres-AfA, nicht Monats-AfA", () => {
  // AK 10.000, ND 60 Monate, Anschaffung 01.01.2021 (Fenster 2,5 / 25 %).
  const degInput = {
    acquisitionDate: new Date("2021-01-01Z"),
    acquisitionCost: 10000,
    residualValue: 0,
    usefulLifeMonths: 60,
    method: AfaMethod.DECLINING_BALANCE,
    alreadyDepreciated: 0,
    disposalDate: null,
  };

  it("Monatsbetrag ist innerhalb eines Jahres KONSTANT", () => {
    // Alter Code degressierte innerhalb des Jahres (Buchwert sank monatlich).
    const jan = calculateMonthlyAfa(degInput, 2021, 1);
    const dez = calculateMonthlyAfa(
      { ...degInput, alreadyDepreciated: 11 * jan.amount },
      2021,
      12,
    );
    expect(dez.amount).toBe(jan.amount);
    // 10.000 × 25 % / 12
    expect(jan.amount).toBe(208.33);
  });

  it("Jahr 1 = 25 % der AK, Jahr 2 = 25 % des Restbuchwerts", () => {
    const y1 = calculateAfaSchedule(
      degInput,
      new Date("2021-01-01Z"),
      new Date("2021-12-31Z"),
    );
    const sum1 = y1.reduce((s, m) => s + m.result.amount, 0);
    expect(sum1).toBeCloseTo(2500, 1);

    const y2 = calculateAfaSchedule(
      { ...degInput, alreadyDepreciated: sum1 },
      new Date("2022-01-01Z"),
      new Date("2022-12-31Z"),
    );
    const sum2 = y2.reduce((s, m) => s + m.result.amount, 0);
    // Buchwert 7.500 × 25 % = 1.875
    expect(sum2).toBeCloseTo(1875, 1);
  });

  it("§7 Abs. 3: Übergang zur linearen AfA — Asset erreicht exakt 0", () => {
    // Ohne den Übergang läuft die geometrische Reihe nie auf 0 aus.
    const schedule = calculateAfaSchedule(
      degInput,
      new Date("2021-01-01Z"),
      new Date("2025-12-31Z"), // genau 60 Monate
    );
    const total = schedule.reduce((s, m) => s + m.result.amount, 0);
    expect(total).toBeCloseTo(10000, 1);
    expect(schedule[schedule.length - 1].result.bookValueAfter).toBeCloseTo(0, 2);
  });

  it("Nach Ablauf der Nutzungsdauer wird nichts mehr gebucht", () => {
    const schedule = calculateAfaSchedule(
      degInput,
      new Date("2026-01-01Z"),
      new Date("2026-12-31Z"),
    );
    expect(schedule.every((m) => m.result.amount === 0)).toBe(true);
  });

  it("Anschaffungsjahr wird zeitanteilig gekürzt (§7 Abs. 2 S. 3)", () => {
    // Anschaffung Oktober → nur 3 Monate im Anschaffungsjahr.
    const schedule = calculateAfaSchedule(
      { ...degInput, acquisitionDate: new Date("2021-10-15Z") },
      new Date("2021-01-01Z"),
      new Date("2021-12-31Z"),
    );
    const sum = schedule.reduce((s, m) => s + m.result.amount, 0);
    // 2.500 × 3/12 = 625
    expect(sum).toBeCloseTo(625, 1);
  });
});

// ============================================================================
// F15 — GWG-Schwellen (§6 Abs. 2 / 2a EStG)
// ============================================================================

describe("F15 — GWG-Schwellen werden geprüft", () => {
  it("GWG_SOFORT mit 50.000 € AK → GwgThresholdViolationError", () => {
    expect(() =>
      calculateMonthlyAfa(
        {
          acquisitionDate: new Date("2025-03-01Z"),
          acquisitionCost: 50000,
          residualValue: 0,
          usefulLifeMonths: 120,
          alreadyDepreciated: 0,
          method: AfaMethod.GWG_SOFORT,
          disposalDate: null,
        },
        2025,
        3,
      ),
    ).toThrow(GwgThresholdViolationError);
  });

  it("GWG_SOFORT mit exakt 800 € → erlaubt", () => {
    const r = calculateMonthlyAfa(
      {
        acquisitionDate: new Date("2025-03-01Z"),
        acquisitionCost: 800,
        residualValue: 0,
        usefulLifeMonths: 36,
        alreadyDepreciated: 0,
        method: AfaMethod.GWG_SOFORT,
        disposalDate: null,
      },
      2025,
      3,
    );
    expect(r.amount).toBe(800);
  });

  it("GWG_POOL mit 5.000 € AK (über Obergrenze) → Error", () => {
    expect(() =>
      calculateMonthlyAfa(
        {
          acquisitionDate: new Date("2025-03-01Z"),
          acquisitionCost: 5000,
          residualValue: 0,
          usefulLifeMonths: 60,
          alreadyDepreciated: 0,
          method: AfaMethod.GWG_POOL,
          disposalDate: null,
        },
        2025,
        3,
      ),
    ).toThrow(GwgThresholdViolationError);
  });

  it("GWG_POOL mit 200 € AK (unter Untergrenze) → Error", () => {
    expect(() =>
      calculateMonthlyAfa(
        {
          acquisitionDate: new Date("2025-03-01Z"),
          acquisitionCost: 200,
          residualValue: 0,
          usefulLifeMonths: 60,
          alreadyDepreciated: 0,
          method: AfaMethod.GWG_POOL,
          disposalDate: null,
        },
        2025,
        3,
      ),
    ).toThrow(GwgThresholdViolationError);
  });
});

// ============================================================================
// F14 — GWG-Sammelposten ohne zeitanteilige Kürzung (§6 Abs. 2a EStG)
// ============================================================================

describe("F14 — Sammelposten: 1/5 im Bildungsjahr, kein sechstes Jahr", () => {
  // Beispiel aus dem Audit: 900 € am 20.11.2025.
  const lateInput = {
    acquisitionDate: new Date("2025-11-20Z"),
    acquisitionCost: 900,
    residualValue: 0,
    usefulLifeMonths: 60,
    method: AfaMethod.GWG_POOL,
    alreadyDepreciated: 0,
    disposalDate: null,
  };

  it("Bildungsjahr 2025 → volle 180 € (nicht 30 €)", () => {
    const schedule = calculateAfaSchedule(
      lateInput,
      new Date("2025-01-01Z"),
      new Date("2025-12-31Z"),
    );
    const sum = schedule.reduce((s, m) => s + m.result.amount, 0);
    expect(sum).toBeCloseTo(180, 2);
  });

  it("Jedes der vier Folgejahre → 180 €", () => {
    let acc = 180;
    for (const y of [2026, 2027, 2028, 2029]) {
      const schedule = calculateAfaSchedule(
        { ...lateInput, alreadyDepreciated: acc },
        new Date(`${y}-01-01Z`),
        new Date(`${y}-12-31Z`),
      );
      const sum = schedule.reduce((s, m) => s + m.result.amount, 0);
      expect(sum).toBeCloseTo(180, 2);
      acc += sum;
    }
    expect(acc).toBeCloseTo(900, 2);
  });

  it("Sechstes Jahr 2030 → 0 (kein Überlauf mehr)", () => {
    const schedule = calculateAfaSchedule(
      { ...lateInput, alreadyDepreciated: 900 },
      new Date("2030-01-01Z"),
      new Date("2030-12-31Z"),
    );
    expect(schedule.every((m) => m.result.amount === 0)).toBe(true);
  });
});

// ============================================================================
// F16 — Lineare AfA terminiert exakt nach usefulLifeMonths
// ============================================================================

describe("F16 — LINEAR läuft nicht einen Monat zu lang", () => {
  // 10.000 / 120 = 83,3333 → gerundet 83,33; 120 × 83,33 = 9.999,60.
  const oddInput = {
    acquisitionDate: new Date("2020-01-15Z"),
    acquisitionCost: 10000,
    residualValue: 0,
    usefulLifeMonths: 120,
    method: AfaMethod.LINEAR,
    alreadyDepreciated: 0,
    disposalDate: null,
  };

  it("Summe über exakt 120 Monate = AK (Ausgleich im letzten Monat)", () => {
    const schedule = calculateAfaSchedule(
      oddInput,
      new Date("2020-01-01Z"),
      new Date("2029-12-31Z"),
    );
    const sum = schedule.reduce((s, m) => s + m.result.amount, 0);
    expect(sum).toBeCloseTo(10000, 2);
    expect(schedule[schedule.length - 1].result.bookValueAfter).toBeCloseTo(0, 2);
  });

  it("Monat 121 (Januar 2030) → 0", () => {
    const r = calculateMonthlyAfa(
      { ...oddInput, alreadyDepreciated: 10000 },
      2030,
      1,
    );
    expect(r.amount).toBe(0);
  });

  it("Monat 121 auch dann 0, wenn rechnerisch noch Restwert da wäre", () => {
    // Simuliert Altdaten mit 9.999,60 gebuchtem Bestand.
    const r = calculateMonthlyAfa(
      { ...oddInput, alreadyDepreciated: 9999.6 },
      2030,
      1,
    );
    expect(r.amount).toBe(0);
  });

  it("Letzter Monat der Nutzungsdauer bucht den Ausgleichsbetrag", () => {
    const r = calculateMonthlyAfa(
      { ...oddInput, alreadyDepreciated: 119 * 83.33 },
      2029,
      12,
    );
    expect(r.amount).toBeCloseTo(83.73, 2);
    expect(r.bookValueAfter).toBeCloseTo(0, 2);
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
