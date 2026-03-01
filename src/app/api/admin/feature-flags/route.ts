import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

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
  "inbox.enabled",
] as const;

export interface ModuleFlags {
  "management-billing": boolean;
  "paperless": boolean;
  "communication": boolean;
  "crm": boolean;
  "inbox": boolean;
}

const DEFAULT_MODULE_FLAGS: ModuleFlags = {
  "management-billing": false,
  "paperless": false,
  "communication": false,
  "crm": false,
  "inbox": false,
};

// GET /api/admin/feature-flags - List all tenants with their feature flags (SUPERADMIN only)
export async function GET(request: NextRequest) {
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

    // Load SystemConfig module flags for all tenants + global in one query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaAny = prisma as any;
    let systemConfigs: Array<{ key: string; value: string; tenantId: string | null }> = [];
    if (prismaAny.systemConfig) {
      systemConfigs = await prismaAny.systemConfig.findMany({
        where: {
          key: { in: [...MODULE_FLAG_KEYS] },
        },
        select: { key: true, value: true, tenantId: true },
      });
    }

    // Build lookup: tenantId -> key -> value
    const globalModuleFlags: Record<string, string> = {};
    const tenantModuleFlags: Record<string, Record<string, string>> = {};

    for (const sc of systemConfigs) {
      if (sc.tenantId === null) {
        globalModuleFlags[sc.key] = sc.value;
      } else {
        if (!tenantModuleFlags[sc.tenantId]) tenantModuleFlags[sc.tenantId] = {};
        tenantModuleFlags[sc.tenantId][sc.key] = sc.value;
      }
    }

    const tenantsWithFlags = tenants.map((tenant) => {
      const settings = (tenant.settings as Record<string, unknown>) || {};
      const features = (settings.features as Partial<FeatureFlags>) || {};

      // Resolve module flags: tenant-specific > global > env > default(false)
      const tenantConfigs = tenantModuleFlags[tenant.id] || {};
      const modules: ModuleFlags = { ...DEFAULT_MODULE_FLAGS };
      for (const key of MODULE_FLAG_KEYS) {
        const moduleName = key.replace(".enabled", "") as keyof ModuleFlags;
        const tenantVal = tenantConfigs[key];
        const globalVal = globalModuleFlags[key];
        const resolved = tenantVal ?? globalVal;
        modules[moduleName] = resolved === "true";
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
      };
    });

    return NextResponse.json({ data: tenantsWithFlags });
  } catch (error) {
    logger.error({ err: error }, "Error fetching feature flags");
    return NextResponse.json(
      { error: "Fehler beim Laden der Feature-Flags" },
      { status: 500 }
    );
  }
}
