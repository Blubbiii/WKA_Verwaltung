import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { auth } from "@/lib/auth";
import {
  getConfig,
  setConfig,
} from "@/lib/config";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

export interface MaintenanceStatus {
  active: boolean;
  message: string;
}

const DEFAULT_MESSAGE =
  "Das System befindet sich im Wartungsmodus. Bitte versuchen Sie es später erneut.";

// GET /api/admin/maintenance - Get maintenance mode status
// Accessible to all authenticated users (needed for the banner)
export async function GET(request: NextRequest) {
  try {
const check = await requireSuperadmin();
    if (!check.authorized) return check.error!;

    const activeValue = await getConfig("general.maintenance.enabled");
    const messageValue = await getConfig("general.maintenance.message");

    const status: MaintenanceStatus = {
      active: activeValue === "true",
      message: messageValue || DEFAULT_MESSAGE,
    };

    return NextResponse.json(status);
  } catch (error) {
    logger.error({ err: error }, "Error fetching maintenance status");
    return NextResponse.json(
      { error: "Fehler beim Laden des Wartungsmodus-Status" },
      { status: 500 }
    );
  }
}

const maintenanceSchema = z.object({
  active: z.boolean(),
  message: z.string().max(500).optional(),
});

// PUT /api/admin/maintenance - Toggle maintenance mode (SUPERADMIN only)
export async function PUT(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = maintenanceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Daten", details: parsed.error.errors },
        { status: 400 }
      );
    }

    // Update maintenance mode status
    await setConfig("general.maintenance.enabled", String(parsed.data.active), {
      category: "general",
      label: "Wartungsmodus aktiviert",
    });

    // Update maintenance message if provided
    if (parsed.data.message !== undefined) {
      await setConfig("general.maintenance.message", parsed.data.message, {
        category: "general",
        label: "Wartungsmodus Nachricht",
      });
    }

    return NextResponse.json({
      message: parsed.data.active
        ? "Wartungsmodus aktiviert"
        : "Wartungsmodus deaktiviert",
      active: parsed.data.active,
    });
  } catch (error) {
    logger.error({ err: error }, "Error updating maintenance mode");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Wartungsmodus" },
      { status: 500 }
    );
  }
}
