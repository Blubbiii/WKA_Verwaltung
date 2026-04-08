// ===========================================
// API: Widget Visibility Management
// GET  — Returns all widgets with current minRole (DB override or registry default)
// PUT  — Save/delete a single widget's minRole override
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { WIDGET_REGISTRY } from "@/lib/dashboard/widget-registry";
import type { UserRole } from "@/types/dashboard";
import { z } from "zod";

const VALID_ROLES: UserRole[] = ["VIEWER", "MANAGER", "ADMIN", "SUPERADMIN"];

const putWidgetVisibilitySchema = z.object({
  widgetId: z.string().min(1),
  minRole: z.enum(["VIEWER", "MANAGER", "ADMIN", "SUPERADMIN"]),
});

// ===========================================
// GET /api/admin/widget-visibility
// ===========================================

export async function GET() {
  try {
    const check = await requirePermission("system:config");
    if (!check.authorized) return check.error;

    const { tenantId } = check;

    // Fetch all widget.minRole.* overrides for this tenant
    const overrides = await prisma.systemConfig.findMany({
      where: {
        tenantId: tenantId ?? null,
        key: { startsWith: "widget.minRole." },
        category: "dashboard",
      },
    });

    // Build override map: widgetId → overridden minRole
    const overrideMap = new Map<string, string>();
    for (const o of overrides) {
      const widgetId = o.key.replace("widget.minRole.", "");
      overrideMap.set(widgetId, o.value);
    }

    // Merge registry with overrides
    const widgets = WIDGET_REGISTRY.map((w) => {
      const override = overrideMap.get(w.id);
      return {
        id: w.id,
        name: w.name,
        category: w.category,
        defaultMinRole: w.minRole,
        currentMinRole: override ?? w.minRole,
        hasOverride: !!override,
      };
    });

    return NextResponse.json({ widgets });
  } catch (error) {
    logger.error({ err: error }, "Error fetching widget visibility");
    return NextResponse.json(
      { error: "Fehler beim Laden der Widget-Sichtbarkeit" },
      { status: 500 }
    );
  }
}

// ===========================================
// PUT /api/admin/widget-visibility
// ===========================================

export async function PUT(request: NextRequest) {
  try {
    const check = await requirePermission("system:config");
    if (!check.authorized) return check.error;

    const { tenantId } = check;

    const body = await request.json();
    const parsed = putWidgetVisibilitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { widgetId, minRole } = parsed.data;

    // Verify widget exists in registry
    const widget = WIDGET_REGISTRY.find((w) => w.id === widgetId);
    if (!widget) {
      return NextResponse.json(
        { error: `Widget nicht gefunden: ${widgetId}` },
        { status: 404 }
      );
    }

    const configKey = `widget.minRole.${widgetId}`;
    const effectiveTenantId = tenantId ?? null;

    // If the chosen role equals the registry default, remove the override
    if (minRole === widget.minRole) {
      await prisma.systemConfig.deleteMany({
        where: {
          tenantId: effectiveTenantId,
          key: configKey,
        },
      });

      logger.info(
        { widgetId, minRole, tenantId: effectiveTenantId },
        "Widget visibility override removed (reverted to default)"
      );

      return NextResponse.json({
        widgetId,
        minRole: widget.minRole,
        hasOverride: false,
        message: "Auf Standard zurückgesetzt",
      });
    }

    // Upsert the override
    await prisma.systemConfig.upsert({
      where: {
        tenantId_key: {
          tenantId: effectiveTenantId ?? "",
          key: configKey,
        },
      },
      update: {
        value: minRole,
      },
      create: {
        tenantId: effectiveTenantId,
        key: configKey,
        value: minRole,
        category: "dashboard",
        encrypted: false,
      },
    });

    logger.info(
      { widgetId, minRole, defaultMinRole: widget.minRole, tenantId: effectiveTenantId },
      "Widget visibility override saved"
    );

    return NextResponse.json({
      widgetId,
      minRole,
      hasOverride: true,
      message: "Sichtbarkeit gespeichert",
    });
  } catch (error) {
    logger.error({ err: error }, "Error saving widget visibility");
    return NextResponse.json(
      { error: "Fehler beim Speichern der Widget-Sichtbarkeit" },
      { status: 500 }
    );
  }
}
