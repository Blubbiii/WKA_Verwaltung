/**
 * Unit-Tests für die TaxCode-Domain (P10).
 *
 * Testet die reine Logik:
 * - DEFAULT_TAX_CODES Vollständigkeit (alle 9 Kategorien abgedeckt)
 * - taxTypeToCategory Mapping
 * - getDefaultCodeForCategory Lookup
 * - buildDefaultTaxCodeInput Form
 * - seedDefaultTaxCodes Idempotenz (skipDuplicates)
 */

import { describe, it, expect, vi } from "vitest";
import { TaxCategory } from "@prisma/client";
import {
  DEFAULT_TAX_CODES,
  buildDefaultTaxCodeInput,
  getDefaultCodeForCategory,
  seedDefaultTaxCodes,
  taxTypeToCategory,
} from "./tax-codes";

describe("DEFAULT_TAX_CODES", () => {
  it("has exactly 8 entries (one default per category that needs one)", () => {
    expect(DEFAULT_TAX_CODES.length).toBe(8);
  });

  it("contains unique codes", () => {
    const codes = DEFAULT_TAX_CODES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("STANDARD_19 has rate 0.19 and vatReportBox 81", () => {
    const std = DEFAULT_TAX_CODES.find((c) => c.category === TaxCategory.STANDARD_19);
    expect(std).toBeDefined();
    expect(std!.rate).toBe(0.19);
    expect(std!.vatReportBox).toBe("81");
    expect(std!.reverseCharge).toBe(false);
  });

  it("REDUCED_7 has rate 0.07 and vatReportBox 86", () => {
    const red = DEFAULT_TAX_CODES.find((c) => c.category === TaxCategory.REDUCED_7);
    expect(red!.rate).toBe(0.07);
    expect(red!.vatReportBox).toBe("86");
  });

  it("REVERSE_CHARGE_13B has reverseCharge=true and box 46", () => {
    const rc = DEFAULT_TAX_CODES.find(
      (c) => c.category === TaxCategory.REVERSE_CHARGE_13B,
    );
    expect(rc!.reverseCharge).toBe(true);
    expect(rc!.vatReportBox).toBe("46");
  });

  it("IGE_INTRA_EU has reverseCharge=true and box 84", () => {
    const ige = DEFAULT_TAX_CODES.find((c) => c.category === TaxCategory.IGE_INTRA_EU);
    expect(ige!.reverseCharge).toBe(true);
    expect(ige!.vatReportBox).toBe("84");
  });

  it("IGL_INTRA_EU has rate 0 and box 41", () => {
    const igl = DEFAULT_TAX_CODES.find((c) => c.category === TaxCategory.IGL_INTRA_EU);
    expect(igl!.rate).toBe(0);
    expect(igl!.vatReportBox).toBe("41");
  });

  it("EXPORT and NOT_TAXABLE have no UStVA box", () => {
    expect(
      DEFAULT_TAX_CODES.find((c) => c.category === TaxCategory.EXPORT)!.vatReportBox,
    ).toBeNull();
    expect(
      DEFAULT_TAX_CODES.find((c) => c.category === TaxCategory.NOT_TAXABLE)!.vatReportBox,
    ).toBeNull();
  });
});

describe("getDefaultCodeForCategory", () => {
  it("returns the code for STANDARD_19", () => {
    expect(getDefaultCodeForCategory(TaxCategory.STANDARD_19)).toBe("9");
  });

  it("returns the code for EXEMPT", () => {
    expect(getDefaultCodeForCategory(TaxCategory.EXEMPT)).toBe("0");
  });

  it("returns the code for KLEINUNTERNEHMER_19 when defined", () => {
    // Kleinunternehmer ist nicht in DEFAULT_TAX_CODES — wirft.
    expect(() => getDefaultCodeForCategory(TaxCategory.KLEINUNTERNEHMER_19)).toThrow();
  });
});

describe("taxTypeToCategory", () => {
  it("maps STANDARD → STANDARD_19", () => {
    expect(taxTypeToCategory("STANDARD")).toBe(TaxCategory.STANDARD_19);
  });

  it("maps REDUCED → REDUCED_7", () => {
    expect(taxTypeToCategory("REDUCED")).toBe(TaxCategory.REDUCED_7);
  });

  it("maps EXEMPT → EXEMPT", () => {
    expect(taxTypeToCategory("EXEMPT")).toBe(TaxCategory.EXEMPT);
  });
});

describe("buildDefaultTaxCodeInput", () => {
  it("produces a Prisma create-many input with tenantId + isSystem=true", () => {
    const tpl = DEFAULT_TAX_CODES[0];
    const input = buildDefaultTaxCodeInput("tenant-xyz", tpl);
    expect(input.tenantId).toBe("tenant-xyz");
    expect(input.isSystem).toBe(true);
    expect(input.active).toBe(true);
    expect(input.code).toBe(tpl.code);
    expect(input.rate).toBe(tpl.rate);
    expect(input.vatReportBox).toBe(tpl.vatReportBox);
  });
});

describe("seedDefaultTaxCodes (idempotent createMany)", () => {
  it("calls createMany with all 8 codes + skipDuplicates", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 8 });
    const prisma = { taxCode: { createMany } };

    const created = await seedDefaultTaxCodes(prisma, "tenant-1");

    expect(created).toBe(8);
    expect(createMany).toHaveBeenCalledTimes(1);
    const arg = createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data.length).toBe(8);
    expect(arg.data.every((d: { tenantId: string }) => d.tenantId === "tenant-1")).toBe(true);
  });

  it("returns 0 if all codes already exist (skipDuplicates path)", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = { taxCode: { createMany } };
    expect(await seedDefaultTaxCodes(prisma, "t")).toBe(0);
  });
});
