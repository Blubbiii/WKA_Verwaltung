/**
 * Tax-Code Defaults und Helpers (P10).
 *
 * Stellt die 8 Standard-TaxCodes bereit, die jeder Tenant beim Seed bekommt,
 * sowie Lookup-Funktionen für Auto-Posting (P11) und UStVA (P12).
 *
 * UStVA-Kennzahlen (Stand 2026, Formular USt 1 A):
 *   81 — Umsätze 19% (Box A.1)
 *   86 — Umsätze 7% (Box A.2)
 *   89 — Steuerfreie Umsätze §4 (Box A.5)
 *   41 — Innergemeinschaftliche Lieferungen §4 Nr 1b (Box B.1)
 *   43 — Innergemeinschaftliche Lieferungen ohne USt-ID (Box B.2)
 *   46 — Leistungsempfänger §13b (Box D — Steuerschuldner)
 *   47 — Steuer §13b 19% (Box D — Steuer)
 *   48 — Steuer §13b 7%
 *   84 — Innergemeinschaftliche Erwerbe 19% (Box D — IGE)
 *   85 — Innergemeinschaftliche Erwerbe 7%
 *   93 — Vorsteuer aus innergemeinschaftlichen Erwerben
 *
 * Diese sind im Default-Seed nur teilweise gesetzt (siehe DEFAULT_TAX_CODES);
 * Power-User können fehlende über die API anlegen.
 */

import { TaxCategory } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export interface DefaultTaxCode {
  code: string;
  name: string;
  category: TaxCategory;
  /** Effektiver Satz (0.000 - 1.000). 19% = 0.19. */
  rate: number;
  vatReportBox: string | null;
  reverseCharge: boolean;
}

/**
 * 8 Standard-TaxCodes pro Tenant. Codes orientieren sich am DATEV-Standard
 * (Schlüssel 0/3/8/9 = Standard). Reverse-Charge / IGE / IGL bekommen
 * eigene Codes außerhalb des DATEV-Standardbereichs (90+), damit sie
 * nicht mit Bestands-Stammdaten kollidieren.
 */
export const DEFAULT_TAX_CODES: ReadonlyArray<DefaultTaxCode> = [
  {
    code: "9",
    name: "USt 19% (Regelsteuersatz §12 Abs. 1 UStG)",
    category: TaxCategory.STANDARD_19,
    rate: 0.19,
    vatReportBox: "81",
    reverseCharge: false,
  },
  {
    code: "8",
    name: "USt 7% (ermäßigt §12 Abs. 2 UStG)",
    category: TaxCategory.REDUCED_7,
    rate: 0.07,
    vatReportBox: "86",
    reverseCharge: false,
  },
  {
    code: "0",
    name: "Steuerfrei §4 UStG",
    category: TaxCategory.EXEMPT,
    rate: 0.0,
    vatReportBox: "89",
    reverseCharge: false,
  },
  {
    code: "94",
    name: "Reverse Charge §13b 19% (Leistungsempfänger schuldet USt)",
    category: TaxCategory.REVERSE_CHARGE_13B,
    rate: 0.19,
    vatReportBox: "46",
    reverseCharge: true,
  },
  {
    code: "95",
    name: "Innergemeinschaftlicher Erwerb 19% (§1a UStG)",
    category: TaxCategory.IGE_INTRA_EU,
    rate: 0.19,
    vatReportBox: "84",
    reverseCharge: true,
  },
  {
    code: "96",
    name: "Innergemeinschaftliche Lieferung (§6a UStG)",
    category: TaxCategory.IGL_INTRA_EU,
    rate: 0.0,
    vatReportBox: "41",
    reverseCharge: false,
  },
  {
    code: "97",
    name: "Ausfuhrlieferung Drittland §6 UStG",
    category: TaxCategory.EXPORT,
    rate: 0.0,
    vatReportBox: null,
    reverseCharge: false,
  },
  {
    code: "99",
    name: "Nicht steuerbar (z.B. Schadensersatz, Innenumsätze)",
    category: TaxCategory.NOT_TAXABLE,
    rate: 0.0,
    vatReportBox: null,
    reverseCharge: false,
  },
];

/**
 * Mapping Kategorie → Default-Code (für TaxCode-Lookup in Auto-Posting).
 * Wird in P11 verwendet wenn z.B. eine Invoice ohne expliziten TaxCode
 * aber mit TaxType=STANDARD gesendet wird → wir nehmen den Code mit
 * Kategorie STANDARD_19.
 */
export function getDefaultCodeForCategory(category: TaxCategory): string {
  const found = DEFAULT_TAX_CODES.find((c) => c.category === category);
  if (!found) {
    throw new Error(`No default tax code defined for category ${category}`);
  }
  return found.code;
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
 * Build the Prisma create-input for a default tax code (for seeds).
 */
export function buildDefaultTaxCodeInput(
  tenantId: string,
  tpl: DefaultTaxCode,
): Prisma.TaxCodeCreateManyInput {
  return {
    tenantId,
    code: tpl.code,
    name: tpl.name,
    category: tpl.category,
    rate: tpl.rate,
    vatReportBox: tpl.vatReportBox,
    reverseCharge: tpl.reverseCharge,
    active: true,
    isSystem: true,
  };
}

/**
 * Idempotent: legt die 8 Default-TaxCodes für einen Tenant an, sofern
 * sie noch nicht existieren. Wird beim Tenant-Onboarding aufgerufen
 * und vom Backfill-Script für Bestands-Tenants verwendet.
 *
 * Nutzt skipDuplicates damit erneute Aufrufe sicher sind (z.B. wenn
 * ein Tenant manuell schon ein paar Codes angelegt hat).
 *
 * @returns Anzahl neu angelegter Codes (0-8).
 */
export async function seedDefaultTaxCodes(
  prisma: { taxCode: { createMany: (args: { data: Prisma.TaxCodeCreateManyInput[]; skipDuplicates?: boolean }) => Promise<{ count: number }> } },
  tenantId: string,
): Promise<number> {
  const result = await prisma.taxCode.createMany({
    data: DEFAULT_TAX_CODES.map((tpl) => buildDefaultTaxCodeInput(tenantId, tpl)),
    skipDuplicates: true,
  });
  return result.count;
}
