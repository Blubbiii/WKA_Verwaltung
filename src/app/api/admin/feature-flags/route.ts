import { NextRequest, NextResponse } from "next/server";
import { prisma, hasPrismaModel, getPrismaModel } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// Default feature flags for tenants that have no flags set
const DEFAULT_FEATURE_FLAGS = {
  votingEnabled: true,
  portalEnabled: true,
  weatherEnabled: true,
  energyEnabled: true,
  billingEnabled: true,
  documentsEnabled: true,
  reportsEnabled: true,
};

export interface FeatureFlags {
  votingEnabled: boolean;
  portalEnabled: boolean;
  weatherEnabled: boolean;
  energyEnabled: boolean;
  billingEnabled: boolean;
  documentsEnabled: boolean;
  reportsEnabled: boolean;
}

// Module flags stored in SystemConfig table
const MODULE_FLAG_KEYS = [
  "management-billing.enabled",
  "paperless.enabled",
  "communication.enabled",
  "crm.enabled",
  "gis.enabled",
  "inbox.enabled",
  "wirtschaftsplan.enabled",
  "accounting.enabled",
  "document-routing.enabled",
  "marketData.enabled",
] as const;

// Accounting sub-module flags
const ACCOUNTING_SUB_FLAG_KEYS = [
  "accounting.reports.enabled",
  "accounting.bank.enabled",
  "accounting.dunning.enabled",
  "accounting.sepa.enabled",
  "accounting.ustva.enabled",
  "accounting.assets.enabled",
  "accounting.cashbook.enabled",
  "accounting.datev.enabled",
  "accounting.yearend.enabled",
  "accounting.costcenter.enabled",
  "accounting.budget.enabled",
  "accounting.quotes.enabled",
  "accounting.liquidity.enabled",
  "accounting.ocr.enabled",
  "accounting.multibanking.enabled",
  "accounting.zm.enabled",
] as const;

// Default values for accounting sub-flags (most default to true)
const ACCOUNTING_SUB_DEFAULTS: Record<string, boolean> = {
  "accounting.reports": true,
  "accounting.bank": true,
  "accounting.dunning": true,
  "accounting.sepa": true,
  "accounting.ustva": true,
  "accounting.assets": true,
  "accounting.cashbook": true,
  "accounting.datev": true,
  "accounting.yearend": true,
  "accounting.costcenter": true,
  "accounting.budget": true,
  "accounting.quotes": true,
  "accounting.liquidity": true,
  "accounting.ocr": false,
  "accounting.multibanking": false,
  "accounting.zm": false,
};

export interface ModuleFlags {
  "management-billing": boolean;
  "paperless": boolean;
  "communication": boolean;
  "crm": boolean;
  "gis": boolean;
  "inbox": boolean;
  "wirtschaftsplan": boolean;
  "accounting": boolean;
  "document-routing": boolean;
}

const DEFAULT_MODULE_FLAGS: ModuleFlags = {
  "management-billing": false,
  "paperless": false,
  "communication": false,
  "crm": false,
  "gis": false,
  "inbox": false,
  "wirtschaftsplan": false,
  "accounting": false,
  "document-routing": false,
};

// GET /api/admin/feature-flags - List all tenants with their feature flags (SUPERADMIN only)
export async function GET(_request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const tenants = await prisma.tenant.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        slug: true,
        settings: true,
        status: true,
      },
      orderBy: { name: "asc" },
    });

    // Load all SystemConfig flags in one query (modules + accounting sub-flags)
    let systemConfigs: Array<{ key: string; value: string; tenantId: string | null }> = [];
    if (hasPrismaModel("systemConfig")) {
      const systemConfig = getPrismaModel("systemConfig");
      systemConfigs = await systemConfig.findMany({
        where: {
          key: { in: [...MODULE_FLAG_KEYS, ...ACCOUNTING_SUB_FLAG_KEYS] },
        },
        select: { key: true, value: true, tenantId: true },
      }) as Array<{ key: string; value: string; tenantId: string | null }>;
    }

    // Build lookup: tenantId -> key -> value
    const globalFlags: Record<string, string> = {};
    const tenantFlags: Record<string, Record<string, string>> = {};

    for (const sc of systemConfigs) {
      if (sc.tenantId === null) {
        globalFlags[sc.key] = sc.value;
      } else {
        if (!tenantFlags[sc.tenantId]) tenantFlags[sc.tenantId] = {};
        tenantFlags[sc.tenantId][sc.key] = sc.value;
      }
    }

    const tenantsWithFlags = tenants.map((tenant) => {
      const settings = (tenant.settings as Record<string, unknown>) || {};
      const features = (settings.features as Partial<FeatureFlags>) || {};

      // Resolve module flags: tenant-specific > global > default(false)
      const tenantConfigs = tenantFlags[tenant.id] || {};
      const modules: ModuleFlags = { ...DEFAULT_MODULE_FLAGS };
      for (const key of MODULE_FLAG_KEYS) {
        const moduleName = key.replace(".enabled", "") as keyof ModuleFlags;
        const tenantVal = tenantConfigs[key];
        const globalVal = globalFlags[key];
        const resolved = tenantVal ?? globalVal;
        modules[moduleName] = resolved === "true";
      }

      // Resolve accounting sub-flags
      const accountingSub: Record<string, boolean> = {};
      for (const key of ACCOUNTING_SUB_FLAG_KEYS) {
        // "accounting.reports.enabled" → "accounting.reports"
        const subName = key.replace(".enabled", "");
        const tenantVal = tenantConfigs[key];
        const globalVal = globalFlags[key];
        const resolved = tenantVal ?? globalVal;
        accountingSub[subName] = resolved !== undefined
          ? resolved === "true"
          : (ACCOUNTING_SUB_DEFAULTS[subName] ?? true);
      }

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        features: {
          ...DEFAULT_FEATURE_FLAGS,
          ...features,
        },
        modules,
        accountingSub,
      };
    });

    return NextResponse.json({ data: tenantsWithFlags });
  } catch (error) {
    logger.error({ err: error }, "Error fetching feature flags");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Feature-Flags" });
  }
}
