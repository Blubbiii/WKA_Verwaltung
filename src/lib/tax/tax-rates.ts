import { prisma } from "@/lib/prisma";
import type { TaxType } from "@prisma/client";

/**
 * Default tax rates used as fallback when no DB config exists.
 */
const DEFAULT_TAX_RATES: Record<string, number> = {
  STANDARD: 19,
  REDUCED: 7,
  EXEMPT: 0,
};

/**
 * Resolves the tax rate for a given type and date from the database.
 * Falls back to hardcoded defaults if no matching config is found.
 *
 * @param tenantId - Tenant ID
 * @param taxType - STANDARD, REDUCED, or EXEMPT
 * @param referenceDate - Date for which to look up the rate (e.g., invoice date)
 */
export async function getTaxRate(
  tenantId: string,
  taxType: TaxType,
  referenceDate: Date = new Date()
): Promise<number> {
  const config = await prisma.taxRateConfig.findFirst({
    where: {
      tenantId,
      taxType,
      validFrom: { lte: referenceDate },
      OR: [
        { validTo: null },
        { validTo: { gte: referenceDate } },
      ],
    },
    orderBy: { validFrom: "desc" },
    select: { rate: true },
  });

  if (config) {
    return Number(config.rate);
  }

  return DEFAULT_TAX_RATES[taxType] ?? 19;
}

/**
 * Resolves all three tax rates (STANDARD, REDUCED, EXEMPT) for a given date.
 * Useful when multiple rates are needed in a single operation.
 */
export async function getAllTaxRates(
  tenantId: string,
  referenceDate: Date = new Date()
): Promise<Record<TaxType, number>> {
  const configs = await prisma.taxRateConfig.findMany({
    where: {
      tenantId,
      validFrom: { lte: referenceDate },
      OR: [
        { validTo: null },
        { validTo: { gte: referenceDate } },
      ],
    },
    orderBy: { validFrom: "desc" },
    select: { taxType: true, rate: true },
  });

  // Build result with latest entry per type
  const result: Record<string, number> = {
    STANDARD: DEFAULT_TAX_RATES.STANDARD,
    REDUCED: DEFAULT_TAX_RATES.REDUCED,
    EXEMPT: DEFAULT_TAX_RATES.EXEMPT,
  };

  const seen = new Set<string>();
  for (const config of configs) {
    if (!seen.has(config.taxType)) {
      result[config.taxType] = Number(config.rate);
      seen.add(config.taxType);
    }
  }

  return result as Record<TaxType, number>;
}

/**
 * Returns the tax rate number for a TaxType string.
 * Async version of the old hardcoded getTaxRateByType().
 */
export async function getTaxRateByType(
  tenantId: string,
  taxType: "STANDARD" | "REDUCED" | "EXEMPT",
  referenceDate: Date = new Date()
): Promise<number> {
  return getTaxRate(tenantId, taxType as TaxType, referenceDate);
}
