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

    const tenantsWithFlags = tenants.map((tenant) => {
      const settings = (tenant.settings as Record<string, unknown>) || {};
      const features = (settings.features as Partial<FeatureFlags>) || {};

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        features: {
          ...DEFAULT_FEATURE_FLAGS,
          ...features,
        },
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
