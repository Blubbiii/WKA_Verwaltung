// ===========================================
// API: Reset Dashboard Configuration to Default
// POST /api/user/dashboard-config/reset
// ===========================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { UserRole } from "@prisma/client";
import type { UserSettings } from "@/types/dashboard";
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

    // Fetch user to get role and current settings
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        settings: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden" },
        { status: 404 }
      );
    }

    const userRole = user.role as UserRole;

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
      message: "Dashboard auf Standardlayout zurueckgesetzt",
    });
  } catch (error) {
    logger.error({ err: error }, "Error resetting dashboard config");
    return NextResponse.json(
      { error: "Fehler beim Zuruecksetzen der Dashboard-Konfiguration" },
      { status: 500 }
    );
  }
}
