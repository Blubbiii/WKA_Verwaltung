// ===========================================
// API: User Dashboard Configuration
// GET /api/user/dashboard-config - Get user's dashboard config
// PUT /api/user/dashboard-config - Update user's dashboard config
// ===========================================

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { handleApiError } from "@/lib/api-utils";
import { getUserHighestHierarchy } from "@/lib/auth/permissions";
import type { DashboardConfig, UserRole, UserSettings } from "@/types/dashboard";
import {
  getDefaultLayoutForRole,
  sanitizeDashboardConfig,
} from "@/lib/dashboard/default-layouts";
import { filterWidgetsByRole, validateWidgetIds } from "@/lib/dashboard/widget-registry";
import { apiLogger as logger } from "@/lib/logger";

// ===========================================
// Validation Schemas
// ===========================================

const dashboardWidgetSchema = z.object({
  id: z.string().min(1, "Widget-ID erforderlich"),
  x: z.number().int().min(0, "x muss >= 0 sein"),
  y: z.number().int().min(0, "y muss >= 0 sein"),
  w: z.number().int().min(1, "Breite muss >= 1 sein").max(12, "Breite max 12"),
  h: z.number().int().min(1, "Hoehe muss >= 1 sein").max(10, "Hoehe max 10"),
});

const updateDashboardConfigSchema = z.object({
  widgets: z.array(dashboardWidgetSchema).max(50, "Maximal 50 Widgets erlaubt"),
  showQuickStats: z.boolean().optional(),
  gridCols: z.number().int().min(1).max(24).optional(),
  rowHeight: z.number().int().min(50).max(200).optional(),
});

// ===========================================
// GET /api/user/dashboard-config
// ===========================================

export async function GET() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const { userId } = check;

    // Fetch user with settings
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        settings: true,
      },
    });

    if (!user) {
      return apiError("NOT_FOUND", 404, { message: "Benutzer nicht gefunden" });
    }

    const hierarchy = await getUserHighestHierarchy(userId!);
    const userRole: UserRole =
      hierarchy >= 100 ? "SUPERADMIN" :
      hierarchy >= 80  ? "ADMIN" :
      hierarchy >= 60  ? "MANAGER" :
      "VIEWER";
    const settings = (user.settings as UserSettings) || {};
    const savedConfig = settings.dashboard as DashboardConfig | undefined;

    // If user has a saved config, sanitize and return it
    if (savedConfig && savedConfig.widgets && savedConfig.widgets.length > 0) {
      const sanitizedConfig = sanitizeDashboardConfig(savedConfig, userRole);

      return NextResponse.json({
        config: sanitizedConfig,
        isDefault: false,
      });
    }

    // Return default layout for user's role
    const defaultConfig = getDefaultLayoutForRole(userRole);

    return NextResponse.json({
      config: defaultConfig,
      isDefault: true,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching dashboard config");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Dashboard-Konfiguration" });
  }
}

// ===========================================
// PUT /api/user/dashboard-config
// ===========================================

export async function PUT(request: NextRequest) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const { userId } = check;

    // Parse and validate request body
    const body = await request.json();
    const validationResult = updateDashboardConfigSchema.safeParse(body);

    if (!validationResult.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Validierungsfehler", details: validationResult.error.issues });
    }

    const { widgets, showQuickStats, gridCols, rowHeight } = validationResult.data;

    // Fetch user to get settings
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        settings: true,
      },
    });

    if (!user) {
      return apiError("NOT_FOUND", 404, { message: "Benutzer nicht gefunden" });
    }

    const hierarchy = await getUserHighestHierarchy(userId!);
    const userRole: UserRole =
      hierarchy >= 100 ? "SUPERADMIN" :
      hierarchy >= 80  ? "ADMIN" :
      hierarchy >= 60  ? "MANAGER" :
      "VIEWER";

    // Validate widget IDs exist in registry
    const widgetIds = widgets.map((w) => w.id);
    const invalidIds = validateWidgetIds(widgetIds);

    if (invalidIds.length > 0) {
      return apiError("BAD_REQUEST", 400, { message: "Unbekannte Widget-IDs", details: invalidIds });
    }

    // Filter widgets to only those available for user's role
    const allowedIds = new Set(filterWidgetsByRole(widgetIds, userRole));
    const filteredWidgets = widgets.filter((w) => allowedIds.has(w.id));

    // Check if any widgets were removed due to role restrictions
    const removedCount = widgets.length - filteredWidgets.length;
    if (removedCount > 0) {
      logger.warn(
        `Removed ${removedCount} widgets not available for role ${userRole}`
      );
    }

    // Create new dashboard config
    const newConfig: DashboardConfig = {
      widgets: filteredWidgets,
      showQuickStats: showQuickStats ?? true,
      gridCols: gridCols ?? 12,
      rowHeight: rowHeight ?? 60,
    };

    // Sanitize the config
    const sanitizedConfig = sanitizeDashboardConfig(newConfig, userRole);

    // Update user settings
    const existingSettings = (user.settings as UserSettings) || {};
    const updatedSettings: UserSettings = {
      ...existingSettings,
      dashboard: sanitizedConfig,
    };

    await prisma.user.update({
      where: { id: userId },
      data: {
        settings: updatedSettings as Record<string, unknown>,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      config: sanitizedConfig,
      isDefault: false,
      message: "Dashboard-Konfiguration gespeichert",
    });
  } catch (error) {
    return handleApiError(error, "Fehler beim Speichern der Dashboard-Konfiguration");
  }
}
