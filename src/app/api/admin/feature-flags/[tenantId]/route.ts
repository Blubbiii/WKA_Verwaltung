import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const featureFlagsSchema = z.object({
  votingEnabled: z.boolean(),
  portalEnabled: z.boolean(),
  weatherEnabled: z.boolean(),
  energyEnabled: z.boolean(),
  billingEnabled: z.boolean(),
  documentsEnabled: z.boolean(),
  reportsEnabled: z.boolean(),
});

// PUT /api/admin/feature-flags/[tenantId] - Update feature flags for a tenant
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
    const parsed = featureFlagsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungueltige Feature-Flag-Daten", details: parsed.error.errors },
        { status: 400 }
      );
    }

    // Get current settings and merge with new feature flags
    const currentSettings = (tenant.settings as Record<string, unknown>) || {};
    const updatedSettings = JSON.parse(
      JSON.stringify({
        ...currentSettings,
        features: parsed.data,
      })
    );

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: updatedSettings },
    });

    return NextResponse.json({
      message: "Feature-Flags aktualisiert",
      features: parsed.data,
    });
  } catch (error) {
    logger.error({ err: error }, "Error updating feature flags");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Feature-Flags" },
      { status: 500 }
    );
  }
}
