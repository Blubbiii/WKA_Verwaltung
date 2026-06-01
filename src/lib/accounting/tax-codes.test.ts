/**
 * Unit-Tests für die Zwei-Schichten-Steuermodell (P10).
 *
 * Schicht 1: TaxCategoryTemplate Defaults
 * Schicht 2: TaxCode + resolveTaxCode (Override-Auflösung)
 * Hilfs-Funktionen: taxTypeToCategory, getDefaultDatevCode
 * Materialize-Idempotenz: seedTaxCategoryTemplates, materializeTenantTaxCodes
 */

import { describe, it, expect, vi } from "vitest";
import { TaxCategory } from "@prisma/client";
import {
  DEFAULT_TAX_CATEGORY_TEMPLATES,
  buildTemplateInput,
  getDefaultDatevCode,
  materializeTenantTaxCodes,
  resolveTaxCode,
  seedTaxCategoryTemplates,
  taxTypeToCategory,
} from "./tax-codes";

// =============================================================================
// DEFAULT_TAX_CATEGORY_TEMPLATES
// =============================================================================

describe("DEFAULT_TAX_CATEGORY_TEMPLATES", () => {
  it("covers all 9 TaxCategory values exactly once", () => {
    const allCategories = Object.values(TaxCategory);
    const inDefaults = DEFAULT_TAX_CATEGORY_TEMPLATES.map((t) => t.category);
    expect(new Set(inDefaults).size).toBe(allCategories.length);
    expect(DEFAULT_TAX_CATEGORY_TEMPLATES.length).toBe(allCategories.length);
  });

  it("uses unique keys", () => {
    const keys = DEFAULT_TAX_CATEGORY_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("STANDARD_19 → 0.19 + box 81 + reverseCharge=false", () => {
    const std = DEFAULT_TAX_CATEGORY_TEMPLATES.find(
      (t) => t.category === TaxCategory.STANDARD_19,
    )!;
    expect(std.defaultRate).toBe(0.19);
    expect(std.defaultVatReportBox).toBe("81");
    expect(std.reverseCharge).toBe(false);
  });

  it("REVERSE_CHARGE_13B → reverseCharge=true + box 46", () => {
    const rc = DEFAULT_TAX_CATEGORY_TEMPLATES.find(
      (t) => t.category === TaxCategory.REVERSE_CHARGE_13B,
    )!;
    expect(rc.reverseCharge).toBe(true);
    expect(rc.defaultVatReportBox).toBe("46");
  });

  it("IGE_INTRA_EU → reverseCharge=true + box 84", () => {
    const ige = DEFAULT_TAX_CATEGORY_TEMPLATES.find(
      (t) => t.category === TaxCategory.IGE_INTRA_EU,
    )!;
    expect(ige.reverseCharge).toBe(true);
    expect(ige.defaultVatReportBox).toBe("84");
  });

  it("EXPORT and NOT_TAXABLE have no UStVA box", () => {
    expect(
      DEFAULT_TAX_CATEGORY_TEMPLATES.find((t) => t.category === TaxCategory.EXPORT)!
        .defaultVatReportBox,
    ).toBeNull();
    expect(
      DEFAULT_TAX_CATEGORY_TEMPLATES.find((t) => t.category === TaxCategory.NOT_TAXABLE)!
        .defaultVatReportBox,
    ).toBeNull();
  });

  it("sortOrder values are strictly increasing", () => {
    const orders = DEFAULT_TAX_CATEGORY_TEMPLATES.map((t) => t.sortOrder);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]).toBeGreaterThan(orders[i - 1]);
    }
  });
});

// =============================================================================
// taxTypeToCategory
// =============================================================================

describe("taxTypeToCategory (backwards-compat)", () => {
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

// =============================================================================
// getDefaultDatevCode
// =============================================================================

describe("getDefaultDatevCode", () => {
  it("returns DATEV-Schlüssel '9' for STANDARD_19", () => {
    expect(getDefaultDatevCode(TaxCategory.STANDARD_19)).toBe("9");
  });
  it("returns '0' for EXEMPT", () => {
    expect(getDefaultDatevCode(TaxCategory.EXEMPT)).toBe("0");
  });
  it("returns unique codes for all categories", () => {
    const codes = Object.values(TaxCategory).map((c) => getDefaultDatevCode(c));
    expect(new Set(codes).size).toBe(codes.length);
  });
});

// =============================================================================
// resolveTaxCode (Override-Auflösung)
// =============================================================================

describe("resolveTaxCode", () => {
  it("uses template defaults when no overrides present", () => {
    const resolved = resolveTaxCode({
      id: "code-1",
      tenantId: "t-1",
      code: "9",
      nameOverride: null,
      rateOverride: null,
      vatReportBoxOverride: null,
      taxAccountId: "acc-1",
      template: {
        category: TaxCategory.STANDARD_19,
        name: "USt 19% Template-Default",
        defaultRate: 0.19,
        defaultVatReportBox: "81",
        reverseCharge: false,
      },
    });
    expect(resolved.name).toBe("USt 19% Template-Default");
    expect(resolved.rate).toBe(0.19);
    expect(resolved.vatReportBox).toBe("81");
    expect(resolved.reverseCharge).toBe(false);
    expect(resolved.taxAccountId).toBe("acc-1");
  });

  it("name override beats template name", () => {
    const resolved = resolveTaxCode({
      id: "code-1",
      tenantId: "t-1",
      code: "9",
      nameOverride: "Custom Name",
      rateOverride: null,
      vatReportBoxOverride: null,
      taxAccountId: null,
      template: {
        category: TaxCategory.STANDARD_19,
        name: "Default",
        defaultRate: 0.19,
        defaultVatReportBox: "81",
        reverseCharge: false,
      },
    });
    expect(resolved.name).toBe("Custom Name");
  });

  it("rate override beats template defaultRate", () => {
    const resolved = resolveTaxCode({
      id: "code-1",
      tenantId: "t-1",
      code: "9",
      nameOverride: null,
      rateOverride: 0.165, // historischer Übergangs-Satz
      vatReportBoxOverride: null,
      taxAccountId: null,
      template: {
        category: TaxCategory.STANDARD_19,
        name: "Default",
        defaultRate: 0.19,
        defaultVatReportBox: "81",
        reverseCharge: false,
      },
    });
    expect(resolved.rate).toBe(0.165);
  });

  it("vatReportBox override beats template defaultVatReportBox", () => {
    const resolved = resolveTaxCode({
      id: "code-1",
      tenantId: "t-1",
      code: "9",
      nameOverride: null,
      rateOverride: null,
      vatReportBoxOverride: "82",
      taxAccountId: null,
      template: {
        category: TaxCategory.STANDARD_19,
        name: "Default",
        defaultRate: 0.19,
        defaultVatReportBox: "81",
        reverseCharge: false,
      },
    });
    expect(resolved.vatReportBox).toBe("82");
  });

  it("reverseCharge is always template-driven (no override allowed)", () => {
    const resolved = resolveTaxCode({
      id: "code-1",
      tenantId: "t-1",
      code: "94",
      nameOverride: null,
      rateOverride: null,
      vatReportBoxOverride: null,
      taxAccountId: null,
      template: {
        category: TaxCategory.REVERSE_CHARGE_13B,
        name: "RC 13B",
        defaultRate: 0.19,
        defaultVatReportBox: "46",
        reverseCharge: true,
      },
    });
    expect(resolved.reverseCharge).toBe(true);
  });
});

// =============================================================================
// buildTemplateInput
// =============================================================================

describe("buildTemplateInput", () => {
  it("produces a Prisma createMany input", () => {
    const tpl = DEFAULT_TAX_CATEGORY_TEMPLATES[0];
    const input = buildTemplateInput(tpl);
    expect(input.key).toBe(tpl.key);
    expect(input.category).toBe(tpl.category);
    expect(input.defaultRate).toBe(tpl.defaultRate);
    expect(input.active).toBe(true);
  });
});

// =============================================================================
// seedTaxCategoryTemplates
// =============================================================================

describe("seedTaxCategoryTemplates (idempotent createMany)", () => {
  it("calls createMany with all 9 templates + skipDuplicates", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 9 });
    const prisma = { taxCategoryTemplate: { createMany } };

    const count = await seedTaxCategoryTemplates(prisma);
    expect(count).toBe(9);
    expect(createMany).toHaveBeenCalledTimes(1);

    const arg = createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data.length).toBe(9);
  });
});

// =============================================================================
// materializeTenantTaxCodes
// =============================================================================

describe("materializeTenantTaxCodes", () => {
  it("returns 0 when no active templates exist", async () => {
    const taxCategoryTemplate = { findMany: vi.fn().mockResolvedValue([]) };
    const taxCode = { createMany: vi.fn() };
    const prisma = { taxCategoryTemplate, taxCode };

    const count = await materializeTenantTaxCodes(prisma, "tenant-1");
    expect(count).toBe(0);
    expect(taxCode.createMany).not.toHaveBeenCalled();
  });

  it("creates one TaxCode per active template with default DATEV code", async () => {
    const templates = [
      { id: "tpl-1", category: TaxCategory.STANDARD_19 },
      { id: "tpl-2", category: TaxCategory.REDUCED_7 },
    ];
    const taxCategoryTemplate = { findMany: vi.fn().mockResolvedValue(templates) };
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const taxCode = { createMany };
    const prisma = { taxCategoryTemplate, taxCode };

    const count = await materializeTenantTaxCodes(prisma, "tenant-1");
    expect(count).toBe(2);

    const data = createMany.mock.calls[0][0].data;
    expect(data).toEqual([
      { tenantId: "tenant-1", templateId: "tpl-1", code: "9", active: true },
      { tenantId: "tenant-1", templateId: "tpl-2", code: "8", active: true },
    ]);
    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });
});
