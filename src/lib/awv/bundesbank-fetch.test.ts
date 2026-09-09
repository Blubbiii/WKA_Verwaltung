/**
 * Tests für Bundesbank-CSV-Parser (P25).
 */

import { describe, it, expect } from "vitest";
import { parseBundesbankCsv } from "./bundesbank-fetch";

describe("parseBundesbankCsv", () => {
  it("Standardformat mit ; und Anführungszeichen", () => {
    const csv = `"Date";"Value"
"2025-01-01";"2.27"
"2025-07-01";"1.27"`;
    const r = parseBundesbankCsv(csv);
    expect(r).toHaveLength(2);
    expect(r[0].validFrom.getUTCFullYear()).toBe(2025);
    expect(r[0].validFrom.getUTCMonth()).toBe(0); // Januar
    expect(r[0].ratePercent).toBe(2.27);
    expect(r[1].validFrom.getUTCMonth()).toBe(6); // Juli
    expect(r[1].ratePercent).toBe(1.27);
  });

  it("Komma als Separator", () => {
    const csv = `2025-01-01,2.27
2025-07-01,1.27`;
    const r = parseBundesbankCsv(csv);
    expect(r).toHaveLength(2);
  });

  it("Deutsches Dezimal-Komma wird zu Punkt", () => {
    const csv = `"2025-01-01";"2,27"`;
    const r = parseBundesbankCsv(csv);
    expect(r[0].ratePercent).toBe(2.27);
  });

  it("Negativer Basiszinssatz (2022-Periode)", () => {
    const csv = `"2022-01-01";"-0.88"`;
    const r = parseBundesbankCsv(csv);
    expect(r[0].ratePercent).toBe(-0.88);
  });

  it("Filter: nur 01.01. und 01.07. werden akzeptiert", () => {
    const csv = `"2025-01-01";"2.27"
"2025-04-01";"1.50"
"2025-07-01";"1.27"
"2025-10-01";"1.00"`;
    const r = parseBundesbankCsv(csv);
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.validFrom.getUTCMonth())).toEqual([0, 6]);
  });

  it("Garbage-Zeilen werden übersprungen", () => {
    const csv = `header,header
not-a-date,abc
2025-01-01,2.27
,
2025-07-01,1.27`;
    const r = parseBundesbankCsv(csv);
    expect(r).toHaveLength(2);
  });

  it("Leere CSV → leeres Array", () => {
    expect(parseBundesbankCsv("")).toEqual([]);
  });

  it("YYYY-MM (ohne Tag) → 01.des Monats", () => {
    const csv = `"2025-01";"2.27"`;
    const r = parseBundesbankCsv(csv);
    expect(r).toHaveLength(1);
    expect(r[0].validFrom.getUTCDate()).toBe(1);
  });
});
