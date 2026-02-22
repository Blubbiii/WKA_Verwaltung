import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { createAuditLog } from "@/lib/audit";
import { apiLogger as logger } from "@/lib/logger";
import { marketingConfigSchema } from "@/lib/marketing/types";
import { DEFAULT_MARKETING_CONFIG } from "@/lib/marketing/defaults";

// =============================================================================
// GET /api/admin/marketing-config
// Returns the marketing configuration for the current tenant, merged with defaults.
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 400 }
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId },
      select: { settings: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 404 }
      );
    }

    // Extract marketing config from tenant settings
    const allSettings = (tenant.settings as Record<string, unknown>) || {};
    const storedMarketing = (allSettings.marketing as Record<string, unknown>) || {};

    // Deep-merge stored config over defaults
    const merged = {
      hero: {
        ...DEFAULT_MARKETING_CONFIG.hero,
        ...(storedMarketing.hero as Record<string, unknown> || {}),
      },
      features: storedMarketing.features || DEFAULT_MARKETING_CONFIG.features,
      pricing: {
        ...DEFAULT_MARKETING_CONFIG.pricing,
        ...(storedMarketing.pricing as Record<string, unknown> || {}),
      },
      cta: {
        ...DEFAULT_MARKETING_CONFIG.cta,
        ...(storedMarketing.cta as Record<string, unknown> || {}),
      },
    };

    return NextResponse.json(merged);
  } catch (error) {
    logger.error({ err: error }, "Error fetching marketing config");
    return NextResponse.json(
      { error: "Fehler beim Laden der Marketing-Konfiguration" },
      { status: 500 }
    );
  }
}

// =============================================================================
// PUT /api/admin/marketing-config
// Validates and saves the marketing configuration. Preserves other settings keys.
// =============================================================================

export async function PUT(request: NextRequest) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validate with Zod schema
    const parsed = marketingConfigSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        {
          error: firstError?.message || "Ungueltige Eingabedaten",
          details: parsed.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    // Get current tenant settings to preserve other keys
    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId },
      select: { settings: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 404 }
      );
    }

    const existingSettings = (tenant.settings as Record<string, unknown>) || {};
    const oldMarketing = existingSettings.marketing || null;

    // Merge: preserve other settings keys, only update 'marketing'
    const updatedSettings = JSON.parse(
      JSON.stringify({
        ...existingSettings,
        marketing: parsed.data,
      })
    );

    await prisma.tenant.update({
      where: { id: check.tenantId },
      data: {
        settings: updatedSettings,
      },
    });

    // Audit log
    await createAuditLog({
      action: "UPDATE",
      entityType: "Tenant",
      entityId: check.tenantId,
      oldValues: oldMarketing ? { marketing: oldMarketing } : null,
      newValues: { marketing: parsed.data },
      description: "Marketing-Konfiguration aktualisiert",
    });

    return NextResponse.json(parsed.data);
  } catch (error) {
    logger.error({ err: error }, "Error saving marketing config");
    return NextResponse.json(
      { error: "Fehler beim Speichern der Marketing-Konfiguration" },
      { status: 500 }
    );
  }
}
