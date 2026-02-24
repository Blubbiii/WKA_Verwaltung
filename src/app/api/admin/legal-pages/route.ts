import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { createAuditLog } from "@/lib/audit";
import { apiLogger as logger } from "@/lib/logger";
import { legalPageSchema } from "@/lib/marketing/types";
import { DEFAULT_LEGAL_PAGES } from "@/lib/marketing/defaults";

// =============================================================================
// GET /api/admin/legal-pages
// Returns the legal pages (Impressum, Datenschutz) for the current tenant.
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
    return NextResponse.json(
      { error: "Fehler beim Laden der rechtlichen Seiten" },
      { status: 500 }
    );
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
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validate with Zod schema
    const parsed = legalPageSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        {
          error: firstError?.message || "Ungültige Eingabedaten",
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

    // Audit log
    // Note: We log that legal pages were updated but avoid storing full content
    // in audit (could be very large). Only log that the update happened.
    await createAuditLog({
      action: "UPDATE",
      entityType: "Tenant",
      entityId: check.tenantId,
      oldValues: oldLegalPages
        ? {
            impressumLength: (oldLegalPages as Record<string, string>).impressum?.length || 0,
            datenschutzLength: (oldLegalPages as Record<string, string>).datenschutz?.length || 0,
          }
        : null,
      newValues: {
        impressumLength: parsed.data.impressum.length,
        datenschutzLength: parsed.data.datenschutz.length,
      },
      description: "Rechtliche Seiten aktualisiert",
    });

    return NextResponse.json(parsed.data);
  } catch (error) {
    logger.error({ err: error }, "Error saving legal pages");
    return NextResponse.json(
      { error: "Fehler beim Speichern der rechtlichen Seiten" },
      { status: 500 }
    );
  }
}
