import { prisma } from "@/lib/prisma";
import type { TaxType } from "@prisma/client";

/**
 * Default position-to-tax-type mappings.
 * Used as fallback and for auto-seeding when no DB entries exist.
 */
export const DEFAULT_POSITION_TAX_MAPPINGS = [
  { category: "POOL_AREA", label: "Poolflaeche", taxType: "STANDARD" as TaxType, module: "lease" },
  { category: "TURBINE_SITE", label: "WEA-Standort", taxType: "EXEMPT" as TaxType, module: "lease" },
  { category: "SEALED_AREA", label: "Versiegelte Flaeche", taxType: "EXEMPT" as TaxType, module: "lease" },
  { category: "ROAD_USAGE", label: "Wegenutzung", taxType: "EXEMPT" as TaxType, module: "lease" },
  { category: "CABLE_ROUTE", label: "Kabeltrasse", taxType: "EXEMPT" as TaxType, module: "lease" },
  { category: "MGMT_FEE", label: "Betriebsfuehrungsverguetung", taxType: "STANDARD" as TaxType, module: "management" },
];

/**
 * Ensures default position tax mappings exist for a tenant.
 * Creates missing entries without overwriting existing ones.
 */
async function ensureDefaults(tenantId: string): Promise<void> {
  const count = await prisma.positionTaxMapping.count({ where: { tenantId } });
  if (count > 0) return;

  await prisma.positionTaxMapping.createMany({
    data: DEFAULT_POSITION_TAX_MAPPINGS.map((m) => ({
      category: m.category,
      label: m.label,
      taxType: m.taxType,
      module: m.module,
      tenantId,
    })),
    skipDuplicates: true,
  });
}

/**
 * Returns the tax type for a specific position category.
 * Auto-seeds defaults if no mappings exist for the tenant.
 */
export async function getPositionTaxType(
  tenantId: string,
  category: string
): Promise<TaxType> {
  await ensureDefaults(tenantId);

  const mapping = await prisma.positionTaxMapping.findUnique({
    where: { tenantId_category: { tenantId, category } },
    select: { taxType: true },
  });

  if (mapping) return mapping.taxType;

  // Fallback to hardcoded default
  const defaultMapping = DEFAULT_POSITION_TAX_MAPPINGS.find((m) => m.category === category);
  return defaultMapping?.taxType ?? ("STANDARD" as TaxType);
}

/**
 * Returns all position tax mappings for a tenant as a lookup map.
 * Key: category string, Value: TaxType
 */
export async function getPositionTaxMap(
  tenantId: string
): Promise<Record<string, TaxType>> {
  await ensureDefaults(tenantId);

  const mappings = await prisma.positionTaxMapping.findMany({
    where: { tenantId },
    select: { category: true, taxType: true },
  });

  const map: Record<string, TaxType> = {};
  for (const m of mappings) {
    map[m.category] = m.taxType;
  }

  // Fill in any missing categories from defaults
  for (const def of DEFAULT_POSITION_TAX_MAPPINGS) {
    if (!(def.category in map)) {
      map[def.category] = def.taxType;
    }
  }

  return map;
}

/**
 * Returns all position tax mappings for a tenant (full objects).
 * Used by the admin API.
 */
export async function getAllPositionTaxMappings(tenantId: string) {
  await ensureDefaults(tenantId);

  return prisma.positionTaxMapping.findMany({
    where: { tenantId },
    orderBy: [{ module: "asc" }, { category: "asc" }],
  });
}
