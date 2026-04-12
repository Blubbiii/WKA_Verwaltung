import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { createAuditLog } from "@/lib/audit";
import { apiLogger as logger } from "@/lib/logger";
import { legalPageSchema } from "@/lib/marketing/types";
import { DEFAULT_LEGAL_PAGES } from "@/lib/marketing/defaults";
import { apiError } from "@/lib/api-errors";

// =============================================================================
// GET /api/admin/legal-pages
// Returns the legal pages (Impressum, Datenschutz) for the current tenant.
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

    // Extract legal pages from tenant settings
    const allSettings = (tenant.settings as Record<string, unknown>) || {};
    const storedLegalPages = (allSettings.legalPages as Record<string, unknown>) || {};

    // Merge with defaults
    const merged = {
      ...DEFAULT_LEGAL_PAGES,
      ...storedLegalPages,
    };

    return NextResponse.json(merged);
  } catch (error) {
    logger.error({ err: error }, "Error fetching legal pages");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der rechtlichen Seiten" });
  }
}

// =============================================================================
// PUT /api/admin/legal-pages
// Validates and saves legal pages. Preserves other settings keys.
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
    const parsed = legalPageSchema.safeParse(body);
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
    const oldLegalPages = existingSettings.legalPages || null;

    // Merge: preserve other settings keys, only update 'legalPages'
    const updatedSettings = JSON.parse(
      JSON.stringify({
        ...existingSettings,
        legalPages: parsed.data,
      })
    );

    await prisma.tenant.update({
      where: { id: check.tenantId },
      data: {
        settings: updatedSettings,
      },
    });

    // Audit log (deferred: runs after response is sent)
    // Note: We log that legal pages were updated but avoid storing full content
    // in audit (could be very large). Only log that the update happened.
    const tenantId = check.tenantId;
    const oldLegalPagesSnapshot = oldLegalPages;
    const newImpressumLength = parsed.data.impressum.length;
    const newDatenschutzLength = parsed.data.datenschutz.length;
    after(async () => {
      await createAuditLog({
        action: "UPDATE",
        entityType: "Tenant",
        entityId: tenantId,
        oldValues: oldLegalPagesSnapshot
          ? {
              impressumLength: (oldLegalPagesSnapshot as Record<string, string>).impressum?.length || 0,
              datenschutzLength: (oldLegalPagesSnapshot as Record<string, string>).datenschutz?.length || 0,
            }
          : null,
        newValues: {
          impressumLength: newImpressumLength,
          datenschutzLength: newDatenschutzLength,
        },
        description: "Rechtliche Seiten aktualisiert",
      });
    });

    return NextResponse.json(parsed.data);
  } catch (error) {
    logger.error({ err: error }, "Error saving legal pages");
    return apiError("SAVE_FAILED", undefined, { message: "Fehler beim Speichern der rechtlichen Seiten" });
  }
}
