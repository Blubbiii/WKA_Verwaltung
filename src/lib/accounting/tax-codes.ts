/**
 * Zwei-Schichten-Steuermodell (P10).
 *
 * Schicht 1: TaxCategoryTemplate — global, vom Super-Admin gepflegt.
 *   Definiert die gesetzlichen Steuer-Kategorien (§12 UStG, §13b, §4, IGE/IGL,
 *   etc.) mit Default-Satz und UStVA-Kennzahl. Read-only für Tenants.
 *
 * Schicht 2: TaxCode — pro Tenant, hält DATEV-Schlüssel + USt-Konto-Verweis
 *   und optional abweichende Overrides für Name/Satz/UStVA-Box.
 *
 * Beim Tenant-Onboarding (oder via Backfill) werden alle aktiven Templates
 * als TaxCodes für den Tenant materialisiert (idempotent via UNIQUE).
 *
 * UStVA-Kennzahlen (Stand 2026, Formular USt 1 A):
 *   81 — Umsätze 19% (Box A.1)
 *   86 — Umsätze 7% (Box A.2)
 *   89 — Steuerfreie Umsätze §4 (Box A.5)
 *   41 — Innergemeinschaftliche Lieferungen §4 Nr 1b (Box B.1)
 *   46 — Leistungsempfänger §13b (Box D — Steuerschuldner)
 *   84 — Innergemeinschaftliche Erwerbe 19% (Box D — IGE)
 *   (47, 85, 93 etc. kommen in P12 dazu)
 */

import { TaxCategory } from "@prisma/client";
import type { Prisma } from "@prisma/client";

/**
 * Bootstrap-Defaults für TaxCategoryTemplate (global). Werden via
 * scripts/seed-tax-category-templates.ts ins System gebracht. Power-Super-
 * Admins können danach Templates editieren / neue anlegen.
 */
export interface TaxCategoryTemplateDefault {
  key: string;
  category: TaxCategory;
  name: string;
  description: string;
  defaultRate: number;
  defaultVatReportBox: string | null;
  reverseCharge: boolean;
  sortOrder: number;
}

export const DEFAULT_TAX_CATEGORY_TEMPLATES: ReadonlyArray<TaxCategoryTemplateDefault> = [
  {
    key: "STANDARD_19",
    category: TaxCategory.STANDARD_19,
    name: "USt 19% (Regelsteuersatz)",
    description: "§12 Abs. 1 UStG — Regelsteuersatz für alle Umsätze, die nicht ermäßigt oder steuerfrei sind.",
    defaultRate: 0.19,
    defaultVatReportBox: "81",
    reverseCharge: false,
    sortOrder: 10,
  },
  {
    key: "REDUCED_7",
    category: TaxCategory.REDUCED_7,
    name: "USt 7% (ermäßigt)",
    description: "§12 Abs. 2 UStG — Ermäßigter Steuersatz (Lebensmittel, Bücher, Beherbergung etc.).",
    defaultRate: 0.07,
    defaultVatReportBox: "86",
    reverseCharge: false,
    sortOrder: 20,
  },
  {
    key: "EXEMPT",
    category: TaxCategory.EXEMPT,
    name: "Steuerfrei §4 UStG",
    description: "§4 UStG — Generell steuerbefreite Umsätze (z.B. §4 Nr. 8/9 Vermietung, Bank/Versicherung).",
    defaultRate: 0.0,
    defaultVatReportBox: "89",
    reverseCharge: false,
    sortOrder: 30,
  },
  {
    key: "REVERSE_CHARGE_13B",
    category: TaxCategory.REVERSE_CHARGE_13B,
    name: "Reverse Charge §13b 19%",
    description: "§13b UStG — Steuerschuldnerschaft des Leistungsempfängers (z.B. Bauleistungen, EU-Dienstleistungen).",
    defaultRate: 0.19,
    defaultVatReportBox: "46",
    reverseCharge: true,
    sortOrder: 40,
  },
  {
    key: "IGE_INTRA_EU",
    category: TaxCategory.IGE_INTRA_EU,
    name: "Innergemeinschaftlicher Erwerb 19%",
    description: "§1a UStG — Erwerb von Waren aus dem EU-Ausland. Leistungsempfänger schuldet USt + zieht Vorsteuer.",
    defaultRate: 0.19,
    defaultVatReportBox: "84",
    reverseCharge: true,
    sortOrder: 50,
  },
  {
    key: "IGL_INTRA_EU",
    category: TaxCategory.IGL_INTRA_EU,
    name: "Innergemeinschaftliche Lieferung",
    description: "§6a UStG — Steuerfreie Lieferung an Unternehmer im EU-Ausland.",
    defaultRate: 0.0,
    defaultVatReportBox: "41",
    reverseCharge: false,
    sortOrder: 60,
  },
  {
    key: "EXPORT",
    category: TaxCategory.EXPORT,
    name: "Ausfuhrlieferung Drittland",
    description: "§4 Nr. 1a + §6 UStG — Steuerfreie Lieferung an Drittlandsabnehmer.",
    defaultRate: 0.0,
    defaultVatReportBox: null,
    reverseCharge: false,
    sortOrder: 70,
  },
  {
    key: "KLEINUNTERNEHMER_19",
    category: TaxCategory.KLEINUNTERNEHMER_19,
    name: "§19 Kleinunternehmer",
    description: "§19 UStG — Kein USt-Ausweis, kein Vorsteuerabzug.",
    defaultRate: 0.0,
    defaultVatReportBox: null,
    reverseCharge: false,
    sortOrder: 80,
  },
  {
    key: "NOT_TAXABLE",
    category: TaxCategory.NOT_TAXABLE,
    name: "Nicht steuerbar",
    description: "Außerhalb USt-Bereich — Schadensersatz, Innenumsätze, durchlaufende Posten.",
    defaultRate: 0.0,
    defaultVatReportBox: null,
    reverseCharge: false,
    sortOrder: 90,
  },
];

/**
 * Default DATEV-Steuerschlüssel pro Kategorie für die Tenant-Materialisierung.
 * Werden beim Auto-Seed pro Tenant verwendet. Tenants können sie nachträglich
 * über die Tax-Codes API anpassen (z.B. wenn sie eigene Konventionen haben).
 */
const DEFAULT_DATEV_CODE_PER_CATEGORY: Record<TaxCategory, string> = {
  STANDARD_19: "9",
  REDUCED_7: "8",
  EXEMPT: "0",
  REVERSE_CHARGE_13B: "94",
  IGE_INTRA_EU: "95",
  IGL_INTRA_EU: "96",
  EXPORT: "97",
  KLEINUNTERNEHMER_19: "98",
  NOT_TAXABLE: "99",
};

export function getDefaultDatevCode(category: TaxCategory): string {
  return DEFAULT_DATEV_CODE_PER_CATEGORY[category];
}

/**
 * Map old TaxType → TaxCategory (Backwards-Compat-Layer).
 * Wird benötigt solange die alten Invoice/IncomingInvoice-Felder taxType
 * statt taxCodeId verwenden. P11 ersetzt das.
 */
export function taxTypeToCategory(
  taxType: "STANDARD" | "REDUCED" | "EXEMPT",
): TaxCategory {
  switch (taxType) {
    case "STANDARD":
      return TaxCategory.STANDARD_19;
    case "REDUCED":
      return TaxCategory.REDUCED_7;
    case "EXEMPT":
      return TaxCategory.EXEMPT;
  }
}

/**
 * Effektiver Wert eines TaxCodes (mit Override-Auflösung).
 * Wird in P11 (Auto-Posting) und P12 (UStVA) verwendet.
 */
export interface ResolvedTaxCode {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  category: TaxCategory;
  rate: number;
  vatReportBox: string | null;
  reverseCharge: boolean;
  taxAccountId: string | null;
}

interface TaxCodeWithTemplate {
  id: string;
  tenantId: string;
  code: string;
  nameOverride: string | null;
  rateOverride: { toNumber: () => number } | number | null;
  vatReportBoxOverride: string | null;
  taxAccountId: string | null;
  template: {
    category: TaxCategory;
    name: string;
    defaultRate: { toNumber: () => number } | number;
    defaultVatReportBox: string | null;
    reverseCharge: boolean;
  };
}

function asNumber(v: { toNumber: () => number } | number): number {
  return typeof v === "number" ? v : v.toNumber();
}

/**
 * Löst die Overrides auf und liefert den effektiv geltenden TaxCode.
 * Caller MUSS den TaxCode mit `include: { template: true }` laden.
 */
export function resolveTaxCode(tc: TaxCodeWithTemplate): ResolvedTaxCode {
  return {
    id: tc.id,
    tenantId: tc.tenantId,
    code: tc.code,
    name: tc.nameOverride ?? tc.template.name,
    category: tc.template.category,
    rate: tc.rateOverride !== null ? asNumber(tc.rateOverride) : asNumber(tc.template.defaultRate),
    vatReportBox: tc.vatReportBoxOverride ?? tc.template.defaultVatReportBox,
    reverseCharge: tc.template.reverseCharge,
    taxAccountId: tc.taxAccountId,
  };
}

/**
 * Build globalen Template-Seed-Input (für Super-Admin Setup).
 */
export function buildTemplateInput(
  tpl: TaxCategoryTemplateDefault,
): Prisma.TaxCategoryTemplateCreateManyInput {
  return {
    key: tpl.key,
    category: tpl.category,
    name: tpl.name,
    description: tpl.description,
    defaultRate: tpl.defaultRate,
    defaultVatReportBox: tpl.defaultVatReportBox,
    reverseCharge: tpl.reverseCharge,
    sortOrder: tpl.sortOrder,
    active: true,
  };
}

/**
 * Idempotent: legt die 9 Default-Templates an, falls noch nicht vorhanden.
 * Wird vom Super-Admin-Setup-Script und beim System-Bootstrap aufgerufen.
 */
export async function seedTaxCategoryTemplates(
  prisma: {
    taxCategoryTemplate: {
      createMany: (args: {
        data: Prisma.TaxCategoryTemplateCreateManyInput[];
        skipDuplicates?: boolean;
      }) => Promise<{ count: number }>;
    };
  },
): Promise<number> {
  const result = await prisma.taxCategoryTemplate.createMany({
    data: DEFAULT_TAX_CATEGORY_TEMPLATES.map(buildTemplateInput),
    skipDuplicates: true,
  });
  return result.count;
}

/**
 * Materialisiert alle aktiven Templates als TaxCodes für einen Tenant.
 * Idempotent via UNIQUE(tenantId, templateId) + skipDuplicates.
 *
 * Wird beim Tenant-Onboarding und vom Backfill-Script aufgerufen.
 *
 * @returns Anzahl neu materialisierter Codes.
 */
export async function materializeTenantTaxCodes(
  prisma: {
    taxCategoryTemplate: {
      findMany: (args: {
        where: { active: boolean };
        select: { id: true; category: true };
      }) => Promise<Array<{ id: string; category: TaxCategory }>>;
    };
    taxCode: {
      createMany: (args: {
        data: Prisma.TaxCodeCreateManyInput[];
        skipDuplicates?: boolean;
      }) => Promise<{ count: number }>;
    };
  },
  tenantId: string,
): Promise<number> {
  const templates = await prisma.taxCategoryTemplate.findMany({
    where: { active: true },
    select: { id: true, category: true },
  });

  if (templates.length === 0) {
    return 0;
  }

  const result = await prisma.taxCode.createMany({
    data: templates.map((t) => ({
      tenantId,
      templateId: t.id,
      code: getDefaultDatevCode(t.category),
      active: true,
    })),
    skipDuplicates: true,
  });
  return result.count;
}
