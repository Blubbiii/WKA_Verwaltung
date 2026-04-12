// ===========================================
// API: Reset Dashboard Configuration to Default
// POST /api/user/dashboard-config/reset
// ===========================================

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { getUserHighestHierarchy } from "@/lib/auth/permissions";
import type { UserRole, UserSettings } from "@/types/dashboard";
import { getDefaultLayoutForRole } from "@/lib/dashboard/default-layouts";
import { apiLogger as logger } from "@/lib/logger";

// ===========================================
// POST /api/user/dashboard-config/reset
// ===========================================

export async function POST() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;

    const { userId } = check;

    // Fetch user current settings
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

    // Derive role from hierarchy for default layout selection
    const hierarchy = await getUserHighestHierarchy(userId!);
    const userRole: UserRole =
      hierarchy >= 100 ? "SUPERADMIN" :
      hierarchy >= 80  ? "ADMIN" :
      hierarchy >= 60  ? "MANAGER" :
      "VIEWER";

    // Get the default layout for the user's role
    const defaultConfig = getDefaultLayoutForRole(userRole);

    // Update user settings - remove custom dashboard config
    const existingSettings = (user.settings as UserSettings) || {};
    const updatedSettings: UserSettings = {
      ...existingSettings,
      dashboard: defaultConfig,
    };

    await prisma.user.update({
      where: { id: userId },
      data: {
        settings: updatedSettings as Record<string, unknown>,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      config: defaultConfig,
      isDefault: true,
      message: "Dashboard auf Standardlayout zurückgesetzt",
    });
  } catch (error) {
    logger.error({ err: error }, "Error resetting dashboard config");
    return apiError("INTERNAL_ERROR", 500, { message: "Fehler beim Zurücksetzen der Dashboard-Konfiguration" });
  }
}
