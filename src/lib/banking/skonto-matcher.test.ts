/**
 * Tests für Skonto-Bank-Match-Heuristik (P18 D10).
 */

import { describe, it, expect } from "vitest";
import { evaluateSkontoMatch } from "./skonto-matcher";

const baseInput = {
  txAmount: 1000,
  txDate: new Date("2026-06-10Z"),
  grossAmount: 1000,
  skontoDeadline: null,
  skontoAmount: null,
  skontoPercent: null,
};

describe("evaluateSkontoMatch — exakter Match", () => {
  it("Beide Beträge exakt → reason=exact, variance=0", () => {
    const r = evaluateSkontoMatch(baseInput);
    expect(r.matches).toBe(true);
    expect(r.reason).toBe("exact");
    expect(r.variance).toBe(0);
    expect(r.skontoAmount).toBe(0);
  });
});

describe("evaluateSkontoMatch — Rundungs-Toleranz", () => {
  it("Differenz 0.01 € → reason=tolerance", () => {
    const r = evaluateSkontoMatch({ ...baseInput, txAmount: 999.99 });
    expect(r.matches).toBe(true);
    expect(r.reason).toBe("tolerance");
    expect(r.variance).toBe(0.01);
  });

  it("Differenz 0.02 € (Default-Grenze) → match", () => {
    const r = evaluateSkontoMatch({ ...baseInput, txAmount: 999.98 });
    expect(r.matches).toBe(true);
    expect(r.reason).toBe("tolerance");
  });

  it("Differenz 0.03 € → no match (Default-Toleranz überschritten)", () => {
    const r = evaluateSkontoMatch({ ...baseInput, txAmount: 999.97 });
    expect(r.matches).toBe(false);
    expect(r.reason).toBe("no-match");
  });

  it("Custom toleranceEur 0.10 → 999.90 € match", () => {
    const r = evaluateSkontoMatch({
      ...baseInput,
      txAmount: 999.9,
      toleranceEur: 0.1,
    });
    expect(r.matches).toBe(true);
    expect(r.reason).toBe("tolerance");
  });
});

describe("evaluateSkontoMatch — Skonto-Pfad (D10 Hauptfall)", () => {
  it("980 € auf 1000 €-Rg mit 2% Skonto innerhalb Frist → reason=skonto, skontoAmount=20", () => {
    const r = evaluateSkontoMatch({
      txAmount: 980,
      txDate: new Date("2026-06-05Z"),
      grossAmount: 1000,
      skontoDeadline: new Date("2026-06-10Z"),
      skontoAmount: 20,
      skontoPercent: 2,
    });
    expect(r.matches).toBe(true);
    expect(r.reason).toBe("skonto");
    expect(r.skontoAmount).toBe(20);
    expect(r.variance).toBe(20);
  });

  it("Skonto erst aus Prozent berechnet (skontoAmount=null)", () => {
    const r = evaluateSkontoMatch({
      txAmount: 980,
      txDate: new Date("2026-06-05Z"),
      grossAmount: 1000,
      skontoDeadline: new Date("2026-06-10Z"),
      skontoAmount: null,
      skontoPercent: 2,
    });
    expect(r.matches).toBe(true);
    expect(r.reason).toBe("skonto");
    expect(r.skontoAmount).toBe(20);
  });

  it("Nach Skonto-Frist → kein Skonto-Match", () => {
    const r = evaluateSkontoMatch({
      txAmount: 980,
      txDate: new Date("2026-06-15Z"), // nach Deadline
      grossAmount: 1000,
      skontoDeadline: new Date("2026-06-10Z"),
      skontoAmount: 20,
      skontoPercent: 2,
    });
    expect(r.matches).toBe(false);
  });

  it("Falscher Skonto-Betrag → kein Match", () => {
    const r = evaluateSkontoMatch({
      txAmount: 950, // entspricht 5%, nicht 2%
      txDate: new Date("2026-06-05Z"),
      grossAmount: 1000,
      skontoDeadline: new Date("2026-06-10Z"),
      skontoAmount: 20,
      skontoPercent: 2,
    });
    expect(r.matches).toBe(false);
  });

  it("Skonto am letzten Tag (genau auf deadline) → match", () => {
    const r = evaluateSkontoMatch({
      txAmount: 980,
      txDate: new Date("2026-06-10Z"),
      grossAmount: 1000,
      skontoDeadline: new Date("2026-06-10Z"),
      skontoAmount: 20,
      skontoPercent: 2,
    });
    expect(r.matches).toBe(true);
  });

  it("Skonto mit Cent-Rundung (3% von 100€ = 3€, Eingang 97€)", () => {
    const r = evaluateSkontoMatch({
      txAmount: 97,
      txDate: new Date("2026-06-05Z"),
      grossAmount: 100,
      skontoDeadline: new Date("2026-06-10Z"),
      skontoAmount: 3,
      skontoPercent: 3,
    });
    expect(r.matches).toBe(true);
    expect(r.reason).toBe("skonto");
  });
});

describe("evaluateSkontoMatch — kein Skonto-Pool, große Diff", () => {
  it("Große Differenz ohne Skonto-Setup → no match", () => {
    const r = evaluateSkontoMatch({
      ...baseInput,
      txAmount: 800,
    });
    expect(r.matches).toBe(false);
    expect(r.variance).toBe(200);
  });
});
