/**
 * Goldmaster-Tests §288 BGB Verzugszinsen (P16, D3).
 *
 * Beispiele aus IHK-Merkblatt + Standard-Steuerberater-Rechnungen.
 * Bei jeder Änderung an interest.ts müssen diese Werte exakt halten.
 */

import { describe, it, expect } from "vitest";
import { computeDefaultInterest } from "./interest";

describe("computeDefaultInterest — kein Verzug", () => {
  it("Zahlung am Fälligkeitstag → noDefault=true, 0 Zinsen", () => {
    const r = computeDefaultInterest({
      principal: 1000,
      dueDate: new Date("2026-03-15Z"),
      asOf: new Date("2026-03-15Z"),
      baseRatePercent: 1.27,
      isBusinessCustomer: false,
    });
    expect(r.noDefault).toBe(true);
    expect(r.daysOverdue).toBe(0);
    expect(r.interestAmount).toBe(0);
    expect(r.lumpSumEur).toBe(0);
  });

  it("principal=0 → noDefault=true", () => {
    const r = computeDefaultInterest({
      principal: 0,
      dueDate: new Date("2026-01-01Z"),
      asOf: new Date("2026-06-01Z"),
      baseRatePercent: 1.27,
      isBusinessCustomer: true,
    });
    expect(r.noDefault).toBe(true);
    expect(r.interestAmount).toBe(0);
  });

  it("asOf vor dueDate → noDefault=true", () => {
    const r = computeDefaultInterest({
      principal: 1000,
      dueDate: new Date("2026-06-01Z"),
      asOf: new Date("2026-05-01Z"),
      baseRatePercent: 1.27,
      isBusinessCustomer: false,
    });
    expect(r.noDefault).toBe(true);
  });
});

describe("computeDefaultInterest — B2C (§288 Abs. 1 BGB)", () => {
  it("365 Tage Verzug bei 1.27% Basis → 6.27% × 1000€ × 1 = 62.70€", () => {
    const r = computeDefaultInterest({
      principal: 1000,
      dueDate: new Date("2026-01-01Z"),
      asOf: new Date("2027-01-01Z"),
      baseRatePercent: 1.27,
      isBusinessCustomer: false,
    });
    expect(r.daysOverdue).toBe(365);
    expect(r.effectiveRatePercent).toBe(6.27);
    expect(r.interestAmount).toBe(62.7);
    expect(r.lumpSumEur).toBe(0); // B2C → keine Pauschale
    expect(r.totalEur).toBe(62.7);
  });

  it("30 Tage Verzug bei 0% Basis → 5% × 1000€ × 30/365 = 4.11€", () => {
    const r = computeDefaultInterest({
      principal: 1000,
      dueDate: new Date("2026-04-01Z"),
      asOf: new Date("2026-05-01Z"),
      baseRatePercent: 0,
      isBusinessCustomer: false,
    });
    expect(r.daysOverdue).toBe(30);
    expect(r.effectiveRatePercent).toBe(5);
    expect(r.interestAmount).toBe(4.11);
  });

  it("Negativer Basiszinssatz wird verrechnet", () => {
    const r = computeDefaultInterest({
      principal: 10000,
      dueDate: new Date("2022-01-01Z"),
      asOf: new Date("2022-12-31Z"),
      baseRatePercent: -0.88,
      isBusinessCustomer: false,
    });
    // Effektiver Satz: 5 - 0.88 = 4.12%
    expect(r.effectiveRatePercent).toBe(4.12);
  });
});

describe("computeDefaultInterest — B2B (§288 Abs. 2 + 5 BGB)", () => {
  it("365 Tage Verzug bei 1.27% Basis → 10.27% × 1000€ + 40€ = 102.70 + 40 = 142.70", () => {
    const r = computeDefaultInterest({
      principal: 1000,
      dueDate: new Date("2026-01-01Z"),
      asOf: new Date("2027-01-01Z"),
      baseRatePercent: 1.27,
      isBusinessCustomer: true,
    });
    expect(r.effectiveRatePercent).toBe(10.27);
    expect(r.interestAmount).toBe(102.7);
    expect(r.lumpSumEur).toBe(40);
    expect(r.totalEur).toBe(142.7);
  });

  it("40€-Pauschale schon ausgeschüttet → lumpSumEur=0", () => {
    const r = computeDefaultInterest({
      principal: 1000,
      dueDate: new Date("2026-01-01Z"),
      asOf: new Date("2026-02-01Z"),
      baseRatePercent: 1.27,
      isBusinessCustomer: true,
      lumpSumAlreadyApplied: true,
    });
    expect(r.lumpSumEur).toBe(0);
  });

  it("Hoher Betrag (50.000€) + 1 Tag Verzug bei B2B 10.27%", () => {
    const r = computeDefaultInterest({
      principal: 50000,
      dueDate: new Date("2026-03-15Z"),
      asOf: new Date("2026-03-16Z"),
      baseRatePercent: 1.27,
      isBusinessCustomer: true,
    });
    // 50000 × 10.27% / 365 × 1 = 14.07€
    expect(r.daysOverdue).toBe(1);
    expect(r.interestAmount).toBe(14.07);
    expect(r.lumpSumEur).toBe(40);
    expect(r.totalEur).toBe(54.07);
  });
});

describe("computeDefaultInterest — Tagezähler", () => {
  it("Tag nach Fälligkeit = 1 Verzugstag", () => {
    const r = computeDefaultInterest({
      principal: 100,
      dueDate: new Date("2026-06-01Z"),
      asOf: new Date("2026-06-02Z"),
      baseRatePercent: 0,
      isBusinessCustomer: false,
    });
    expect(r.daysOverdue).toBe(1);
  });

  it("Über Monatsgrenze hinweg", () => {
    const r = computeDefaultInterest({
      principal: 100,
      dueDate: new Date("2026-01-15Z"),
      asOf: new Date("2026-02-15Z"),
      baseRatePercent: 0,
      isBusinessCustomer: false,
    });
    expect(r.daysOverdue).toBe(31); // 16 Tage Jan + 15 Tage Feb
  });
});
