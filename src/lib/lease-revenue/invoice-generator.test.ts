/**
 * Unit tests for Invoice Generator pure helpers.
 *
 * These helpers are extracted from the lease revenue invoice generation pipeline
 * and must be rock-solid — bugs here produce incorrect invoice amounts,
 * wrong service periods on invoices, or malformed recipient addresses in PDFs.
 */

import { describe, expect, it } from "vitest";
import {
  round2,
  buildRecipientName,
  buildRecipientAddress,
  buildFundName,
  getServicePeriodDates,
  getServicePeriodLabel,
  buildPlotDescription,
} from "./invoice-generator";

// ============================================================
// round2
// ============================================================

describe("round2", () => {
  it("rounds to 2 decimal places", () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24); // banker's rounding NOT used
    expect(round2(1.236)).toBe(1.24);
  });

  it("handles zero and integers", () => {
    expect(round2(0)).toBe(0);
    expect(round2(100)).toBe(100);
    expect(round2(42.0)).toBe(42);
  });

  it("handles negative numbers", () => {
    expect(round2(-1.234)).toBe(-1.23);
    expect(round2(-1.239)).toBe(-1.24);
    expect(round2(-100.5)).toBe(-100.5);
  });

  it("handles very small numbers (cent precision)", () => {
    expect(round2(0.001)).toBe(0);
    expect(round2(0.005)).toBe(0.01);
    expect(round2(0.009)).toBe(0.01);
  });

  it("handles large monetary amounts without precision loss", () => {
    expect(round2(123456.789)).toBe(123456.79);
    expect(round2(999999.995)).toBe(1000000); // floating-point edge — documented behavior
  });

  it("is idempotent", () => {
    const v = round2(1.239);
    expect(round2(v)).toBe(v);
  });
});

// ============================================================
// buildRecipientName
// ============================================================

describe("buildRecipientName", () => {
  it("prefers companyName when set", () => {
    expect(
      buildRecipientName({
        firstName: "Max",
        lastName: "Mustermann",
        companyName: "Acme GmbH",
      }),
    ).toBe("Acme GmbH");
  });

  it("falls back to firstName + lastName", () => {
    expect(
      buildRecipientName({
        firstName: "Max",
        lastName: "Mustermann",
        companyName: null,
      }),
    ).toBe("Max Mustermann");
  });

  it("uses only firstName if lastName missing", () => {
    expect(
      buildRecipientName({
        firstName: "Max",
        lastName: null,
        companyName: null,
      }),
    ).toBe("Max");
  });

  it("uses only lastName if firstName missing", () => {
    expect(
      buildRecipientName({
        firstName: null,
        lastName: "Mustermann",
        companyName: null,
      }),
    ).toBe("Mustermann");
  });

  it("returns 'Unbekannt' when all fields are null", () => {
    expect(
      buildRecipientName({
        firstName: null,
        lastName: null,
        companyName: null,
      }),
    ).toBe("Unbekannt");
  });

  it("ignores empty-string companyName (falsy)", () => {
    expect(
      buildRecipientName({
        firstName: "Max",
        lastName: "Mustermann",
        companyName: "",
      }),
    ).toBe("Max Mustermann");
  });
});

// ============================================================
// buildRecipientAddress
// ============================================================

describe("buildRecipientAddress", () => {
  it("builds full German address with street + house number", () => {
    expect(
      buildRecipientAddress({
        street: "Hauptstrasse",
        houseNumber: "12a",
        postalCode: "12345",
        city: "Berlin",
        country: "Deutschland",
      }),
    ).toBe("Hauptstrasse 12a\n12345 Berlin");
  });

  it("omits country for Deutschland (implicit)", () => {
    const result = buildRecipientAddress({
      street: "Hauptstrasse",
      houseNumber: "1",
      postalCode: "12345",
      city: "Berlin",
      country: "Deutschland",
    });
    expect(result).not.toContain("Deutschland");
  });

  it("includes foreign country on separate line", () => {
    expect(
      buildRecipientAddress({
        street: "Bahnhofstrasse",
        houseNumber: "1",
        postalCode: "8001",
        city: "Zürich",
        country: "Schweiz",
      }),
    ).toBe("Bahnhofstrasse 1\n8001 Zürich\nSchweiz");
  });

  it("handles street without house number", () => {
    expect(
      buildRecipientAddress({
        street: "Marktplatz",
        houseNumber: null,
        postalCode: "12345",
        city: "Berlin",
        country: "Deutschland",
      }),
    ).toBe("Marktplatz\n12345 Berlin");
  });

  it("handles city without postalCode", () => {
    expect(
      buildRecipientAddress({
        street: "Hauptstrasse",
        houseNumber: "1",
        postalCode: null,
        city: "Berlin",
        country: "Deutschland",
      }),
    ).toBe("Hauptstrasse 1\nBerlin");
  });

  it("omits postalCode+city line when both missing", () => {
    expect(
      buildRecipientAddress({
        street: "Hauptstrasse",
        houseNumber: "1",
        postalCode: null,
        city: null,
        country: "Deutschland",
      }),
    ).toBe("Hauptstrasse 1");
  });

  it("handles completely empty address", () => {
    expect(
      buildRecipientAddress({
        street: null,
        houseNumber: null,
        postalCode: null,
        city: null,
        country: "Deutschland",
      }),
    ).toBe("");
  });
});

// ============================================================
// buildFundName
// ============================================================

describe("buildFundName", () => {
  it("appends legalForm to name when present", () => {
    expect(
      buildFundName({ name: "Windpark Nord", legalForm: "GmbH & Co. KG" }),
    ).toBe("Windpark Nord GmbH & Co. KG");
  });

  it("returns plain name when legalForm is null", () => {
    expect(buildFundName({ name: "Windpark Nord", legalForm: null })).toBe(
      "Windpark Nord",
    );
  });

  it("handles empty legalForm as falsy", () => {
    expect(buildFundName({ name: "Windpark Nord", legalForm: "" })).toBe(
      "Windpark Nord",
    );
  });
});

// ============================================================
// getServicePeriodDates
// ============================================================

describe("getServicePeriodDates", () => {
  // Uses Date.UTC construction to be DST-safe and timezone-independent.
  // Expected dates below are always UTC-anchored (e.g. 2025-01-01T00:00:00Z).
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

  it("returns Q1 range for ADVANCE + QUARTERLY month 1-3", () => {
    const q1 = getServicePeriodDates(2025, "ADVANCE", "QUARTERLY", 2);
    expect(q1.start).toEqual(utc(2025, 0, 1));
    expect(q1.end).toEqual(utc(2025, 2, 31));
  });

  it("returns Q2 range for month 4-6", () => {
    const q2 = getServicePeriodDates(2025, "ADVANCE", "QUARTERLY", 5);
    expect(q2.start).toEqual(utc(2025, 3, 1));
    expect(q2.end).toEqual(utc(2025, 5, 30));
  });

  it("returns Q3 range for month 7-9", () => {
    const q3 = getServicePeriodDates(2025, "ADVANCE", "QUARTERLY", 9);
    expect(q3.start).toEqual(utc(2025, 6, 1));
    expect(q3.end).toEqual(utc(2025, 8, 30));
  });

  it("returns Q4 range for month 10-12", () => {
    const q4 = getServicePeriodDates(2025, "ADVANCE", "QUARTERLY", 12);
    expect(q4.start).toEqual(utc(2025, 9, 1));
    expect(q4.end).toEqual(utc(2025, 11, 31));
  });

  it("handles leap year February correctly (MONTHLY)", () => {
    const feb2024 = getServicePeriodDates(2024, "ADVANCE", "MONTHLY", 2);
    expect(feb2024.start).toEqual(utc(2024, 1, 1));
    expect(feb2024.end).toEqual(utc(2024, 1, 29));
  });

  it("handles non-leap year February correctly (MONTHLY)", () => {
    const feb2025 = getServicePeriodDates(2025, "ADVANCE", "MONTHLY", 2);
    expect(feb2025.start).toEqual(utc(2025, 1, 1));
    expect(feb2025.end).toEqual(utc(2025, 1, 28));
  });

  it("returns January range for MONTHLY month 1", () => {
    const jan = getServicePeriodDates(2025, "ADVANCE", "MONTHLY", 1);
    expect(jan.start).toEqual(utc(2025, 0, 1));
    expect(jan.end).toEqual(utc(2025, 0, 31));
  });

  it("returns December range for MONTHLY month 12", () => {
    const dec = getServicePeriodDates(2025, "ADVANCE", "MONTHLY", 12);
    expect(dec.start).toEqual(utc(2025, 11, 1));
    expect(dec.end).toEqual(utc(2025, 11, 31));
  });

  it("returns full year for FINAL period type", () => {
    const result = getServicePeriodDates(2025, "FINAL", null, null);
    expect(result.start).toEqual(utc(2025, 0, 1));
    expect(result.end).toEqual(utc(2025, 11, 31));
  });

  it("returns full year for ADVANCE + YEARLY", () => {
    const result = getServicePeriodDates(2025, "ADVANCE", "YEARLY", null);
    expect(result.start).toEqual(utc(2025, 0, 1));
    expect(result.end).toEqual(utc(2025, 11, 31));
  });

  it("falls back to full year when month missing for QUARTERLY", () => {
    const result = getServicePeriodDates(2025, "ADVANCE", "QUARTERLY", null);
    expect(result.start).toEqual(utc(2025, 0, 1));
    expect(result.end).toEqual(utc(2025, 11, 31));
  });

  it("is timezone-independent (DST transition March 2025)", () => {
    // 2025-03-30: CET→CEST wechsel. Bei lokaler Zeit würde Q1-Ende um 1h shiften.
    const q1 = getServicePeriodDates(2025, "ADVANCE", "QUARTERLY", 3);
    expect(q1.end.toISOString()).toBe("2025-03-31T00:00:00.000Z");
  });

  it("is timezone-independent (DST transition October 2025)", () => {
    // 2025-10-26: CEST→CET wechsel.
    const q4 = getServicePeriodDates(2025, "ADVANCE", "QUARTERLY", 10);
    expect(q4.start.toISOString()).toBe("2025-10-01T00:00:00.000Z");
  });
});

// ============================================================
// getServicePeriodLabel
// ============================================================

describe("getServicePeriodLabel", () => {
  it("formats QUARTERLY label", () => {
    expect(getServicePeriodLabel(2025, "ADVANCE", "QUARTERLY", 1)).toBe(
      "Quartal 1 - 2025",
    );
    expect(getServicePeriodLabel(2025, "ADVANCE", "QUARTERLY", 6)).toBe(
      "Quartal 2 - 2025",
    );
    expect(getServicePeriodLabel(2025, "ADVANCE", "QUARTERLY", 12)).toBe(
      "Quartal 4 - 2025",
    );
  });

  it("formats MONTHLY label with German month names", () => {
    expect(getServicePeriodLabel(2025, "ADVANCE", "MONTHLY", 1)).toBe(
      "Januar 2025",
    );
    expect(getServicePeriodLabel(2025, "ADVANCE", "MONTHLY", 3)).toBe(
      "Maerz 2025",
    );
    expect(getServicePeriodLabel(2025, "ADVANCE", "MONTHLY", 12)).toBe(
      "Dezember 2025",
    );
  });

  it("formats FINAL label as yearly", () => {
    expect(getServicePeriodLabel(2025, "FINAL", null, null)).toBe("Jahr 2025");
  });

  it("formats YEARLY advance label as yearly", () => {
    expect(getServicePeriodLabel(2025, "ADVANCE", "YEARLY", null)).toBe(
      "Jahr 2025",
    );
  });

  it("falls back to yearly when month missing", () => {
    expect(getServicePeriodLabel(2025, "ADVANCE", "QUARTERLY", null)).toBe(
      "Jahr 2025",
    );
  });
});

// ============================================================
// buildPlotDescription
// ============================================================

describe("buildPlotDescription", () => {
  it("returns empty string for empty array", () => {
    expect(buildPlotDescription([])).toBe("");
  });

  it("returns empty string for non-array input", () => {
    expect(buildPlotDescription(null)).toBe("");
    expect(buildPlotDescription(undefined)).toBe("");
    expect(buildPlotDescription("not an array")).toBe("");
    expect(buildPlotDescription({})).toBe("");
  });

  it("formats a single plot with all fields", () => {
    expect(
      buildPlotDescription([
        { plotNumber: "7", fieldNumber: "2", cadastralDistrict: "Barenburg" },
      ]),
    ).toBe("Flst. 7, Flur 2, Gem. Barenburg");
  });

  it("omits fieldNumber when '0'", () => {
    expect(
      buildPlotDescription([
        { plotNumber: "7", fieldNumber: "0", cadastralDistrict: "Barenburg" },
      ]),
    ).toBe("Flst. 7, Gem. Barenburg");
  });

  it("omits fieldNumber when missing", () => {
    expect(
      buildPlotDescription([
        { plotNumber: "7", cadastralDistrict: "Barenburg" },
      ]),
    ).toBe("Flst. 7, Gem. Barenburg");
  });

  it("omits cadastralDistrict when missing", () => {
    expect(
      buildPlotDescription([{ plotNumber: "7", fieldNumber: "2" }]),
    ).toBe("Flst. 7, Flur 2");
  });

  it("filters out plots without plotNumber", () => {
    expect(
      buildPlotDescription([
        { fieldNumber: "2", cadastralDistrict: "Barenburg" },
        { plotNumber: "7", fieldNumber: "2", cadastralDistrict: "Barenburg" },
      ]),
    ).toBe("Flst. 7, Flur 2, Gem. Barenburg");
  });

  it("joins multiple plots with ' / '", () => {
    expect(
      buildPlotDescription([
        { plotNumber: "7", fieldNumber: "2", cadastralDistrict: "Barenburg" },
        { plotNumber: "9", fieldNumber: "2", cadastralDistrict: "Barenburg" },
      ]),
    ).toBe("Flst. 7, Flur 2, Gem. Barenburg / Flst. 9, Flur 2, Gem. Barenburg");
  });

  it("handles plot with only plotNumber", () => {
    expect(buildPlotDescription([{ plotNumber: "42" }])).toBe("Flst. 42");
  });
});
