import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const tenantLimitsSchema = z.object({
  maxUsers: z.number().int().min(1).max(10000),
  maxStorageMb: z.number().int().min(100).max(1000000),
  maxParks: z.number().int().min(1).max(1000),
});

// PUT /api/admin/tenant-limits/[tenantId] - Update limits for a tenant
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const { tenantId } = await params;

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, settings: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = tenantLimitsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Limit-Daten", details: parsed.error.errors },
        { status: 400 }
      );
    }

    // Get current settings and merge with new limits
    const currentSettings = (tenant.settings as Record<string, unknown>) || {};
    const updatedSettings = JSON.parse(
      JSON.stringify({
        ...currentSettings,
        limits: parsed.data,
      })
    );

    // Sync storageLimit column with maxStorageMb setting
    const storageLimitBytes = BigInt(parsed.data.maxStorageMb) * BigInt(1024 * 1024);

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: updatedSettings,
        storageLimit: storageLimitBytes,
      },
    });

    return NextResponse.json({
      message: "Mandanten-Limits aktualisiert",
      limits: parsed.data,
    });
  } catch (error) {
    logger.error({ err: error }, "Error updating tenant limits");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Mandanten-Limits" },
      { status: 500 }
    );
  }
}
