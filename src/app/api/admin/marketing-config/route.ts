import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { createAuditLog } from "@/lib/audit";
import { apiLogger as logger } from "@/lib/logger";
import { marketingConfigSchema } from "@/lib/marketing/types";
import { DEFAULT_MARKETING_CONFIG } from "@/lib/marketing/defaults";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// GET /api/admin/marketing-config
// Returns the marketing configuration for the current tenant, merged with defaults.
// =============================================================================

export async function GET(_request: NextRequest) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId },
      select: { settings: true },
    });

    if (!tenant) {
      return apiError("NOT_FOUND", undefined, { message: "Mandant nicht gefunden" });
    }

    // Extract marketing config from tenant settings
    const allSettings = (tenant.settings as Record<string, unknown>) || {};
    const stored = (allSettings.marketing as Record<string, unknown>) || {};

    // Deep-merge stored config over defaults for all sections
    const merged = {
      sections: stored.sections || DEFAULT_MARKETING_CONFIG.sections,
      hero: {
        ...DEFAULT_MARKETING_CONFIG.hero,
        ...(stored.hero as Record<string, unknown> || {}),
      },
      trustBar: {
        ...DEFAULT_MARKETING_CONFIG.trustBar,
        ...(stored.trustBar as Record<string, unknown> || {}),
      },
      features: stored.features || DEFAULT_MARKETING_CONFIG.features,
      showcase: {
        ...DEFAULT_MARKETING_CONFIG.showcase,
        ...(stored.showcase as Record<string, unknown> || {}),
      },
      stats: {
        ...DEFAULT_MARKETING_CONFIG.stats,
        ...(stored.stats as Record<string, unknown> || {}),
      },
      workflow: {
        ...DEFAULT_MARKETING_CONFIG.workflow,
        ...(stored.workflow as Record<string, unknown> || {}),
      },
      modules: {
        ...DEFAULT_MARKETING_CONFIG.modules,
        ...(stored.modules as Record<string, unknown> || {}),
      },
      pricing: {
        ...DEFAULT_MARKETING_CONFIG.pricing,
        ...(stored.pricing as Record<string, unknown> || {}),
      },
      testimonials: {
        ...DEFAULT_MARKETING_CONFIG.testimonials,
        ...(stored.testimonials as Record<string, unknown> || {}),
      },
      cta: {
        ...DEFAULT_MARKETING_CONFIG.cta,
        ...(stored.cta as Record<string, unknown> || {}),
      },
    };

    return NextResponse.json(merged);
  } catch (error) {
    logger.error({ err: error }, "Error fetching marketing config");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Marketing-Konfiguration" });
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
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const body = await request.json();

    // Validate with Zod schema
    const parsed = marketingConfigSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return apiError("BAD_REQUEST", undefined, { message: firstError?.message || "Ungültige Eingabedaten", details: parsed.error.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })) });
    }

    // Get current tenant settings to preserve other keys
    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId },
      select: { settings: true },
    });

    if (!tenant) {
      return apiError("NOT_FOUND", undefined, { message: "Mandant nicht gefunden" });
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

    // Audit log (deferred: runs after response is sent)
    const tenantId = check.tenantId;
    const oldMarketingSnapshot = oldMarketing;
    const newMarketing = parsed.data;
    after(async () => {
      await createAuditLog({
        action: "UPDATE",
        entityType: "Tenant",
        entityId: tenantId,
        oldValues: oldMarketingSnapshot ? { marketing: oldMarketingSnapshot } : null,
        newValues: { marketing: newMarketing },
        description: "Marketing-Konfiguration aktualisiert",
      });
    });

    return NextResponse.json(parsed.data);
  } catch (error) {
    logger.error({ err: error }, "Error saving marketing config");
    return apiError("SAVE_FAILED", undefined, { message: "Fehler beim Speichern der Marketing-Konfiguration" });
  }
}
