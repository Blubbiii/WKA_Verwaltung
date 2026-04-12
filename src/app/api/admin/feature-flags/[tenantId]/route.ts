import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

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
      return apiError("NOT_FOUND", undefined, { message: "Mandant nicht gefunden" });
    }

    const body = await request.json();
    const parsed = featureFlagsSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Feature-Flag-Daten", details: parsed.error.issues });
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
    return apiError("UPDATE_FAILED", undefined, { message: "Fehler beim Aktualisieren der Feature-Flags" });
  }
}
