/**
 * GET  /api/superadmin/system-settings              — Liste aller Settings
 * PATCH /api/superadmin/system-settings/[key]       — Wert ändern
 *
 * Globale Settings für gesetzlich vorgegebene Werte. Bei leerer Tabelle
 * wird automatisch geseedet (alle Defaults aus SYSTEM_SETTING_DEFAULTS).
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  SYSTEM_SETTING_DEFAULTS,
  seedSystemSettings,
} from "@/lib/system-settings";
import { serializePrisma } from "@/lib/serialize";

export async function GET(_request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    // Auto-Seed bei erstem Aufruf.
    const count = await prisma.systemSetting.count();
    if (count === 0) {
      const seeded = await seedSystemSettings(check.userId!);
      logger.info({ seeded }, "System settings auto-seeded");
    }

    const rows = await prisma.systemSetting.findMany({
      orderBy: [{ category: "asc" }, { key: "asc" }],
    });

    return NextResponse.json({
      data: serializePrisma(rows),
      defaults: SYSTEM_SETTING_DEFAULTS,
    });
  } catch (error) {
    logger.error({ err: error }, "Error loading system settings");
    return apiError("FETCH_FAILED", 500, {
      message: "Fehler beim Laden der System-Einstellungen",
    });
  }
}
