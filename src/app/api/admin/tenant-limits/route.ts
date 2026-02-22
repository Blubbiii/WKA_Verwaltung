import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// Default tenant limits
const DEFAULT_LIMITS = {
  maxUsers: 50,
  maxStorageMb: 5000, // 5 GB
  maxParks: 20,
};

export interface TenantLimits {
  maxUsers: number;
  maxStorageMb: number;
  maxParks: number;
}

// GET /api/admin/tenant-limits - List all tenants with limits and current usage
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
        storageUsedBytes: true,
        storageLimit: true,
        _count: {
          select: {
            users: true,
            parks: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Use the tracked storageUsedBytes column instead of recalculating
    const tenantsWithLimits = tenants.map((tenant) => {
      const settings = (tenant.settings as Record<string, unknown>) || {};
      const limits = (settings.limits as Partial<TenantLimits>) || {};

      const storageBytesUsed = Number(tenant.storageUsedBytes);
      const storageMbUsed = Math.round((storageBytesUsed / (1024 * 1024)) * 100) / 100;
      const storageLimitMb = Math.round(Number(tenant.storageLimit) / (1024 * 1024));

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        limits: {
          ...DEFAULT_LIMITS,
          ...limits,
          maxStorageMb: limits.maxStorageMb || storageLimitMb || DEFAULT_LIMITS.maxStorageMb,
        },
        usage: {
          currentUsers: tenant._count.users,
          currentParks: tenant._count.parks,
          currentStorageMb: storageMbUsed,
        },
      };
    });

    return NextResponse.json({ data: tenantsWithLimits });
  } catch (error) {
    logger.error({ err: error }, "Error fetching tenant limits");
    return NextResponse.json(
      { error: "Fehler beim Laden der Mandanten-Limits" },
      { status: 500 }
    );
  }
}
