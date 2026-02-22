import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// Default settings
const DEFAULT_SETTINGS = {
  // Application Settings
  applicationName: "Windpark Manager",
  defaultTimezone: "Europe/Berlin",
  defaultLanguage: "de",
  dateFormat: "DD.MM.YYYY",
  currency: "EUR",

  // Maintenance Mode
  maintenanceModeEnabled: false,
  maintenanceMessage: "Das System wird gewartet. Bitte versuchen Sie es spaeter erneut.",
  scheduledMaintenanceTime: null,

  // Security Settings
  sessionTimeoutMinutes: 30,
  maxLoginAttempts: 5,
  minPasswordLength: 8,
  passwordRequiresSpecialChar: true,
  passwordRequiresNumber: true,

  // Notifications
  emailNotificationsEnabled: true,
  adminEmail: "",
};

export interface GeneralSettings {
  // Application Settings
  applicationName: string;
  defaultTimezone: string;
  defaultLanguage: string;
  dateFormat: string;
  currency: string;

  // Maintenance Mode
  maintenanceModeEnabled: boolean;
  maintenanceMessage: string;
  scheduledMaintenanceTime: string | null;

  // Security Settings
  sessionTimeoutMinutes: number;
  maxLoginAttempts: number;
  minPasswordLength: number;
  passwordRequiresSpecialChar: boolean;
  passwordRequiresNumber: boolean;

  // Notifications
  emailNotificationsEnabled: boolean;
  adminEmail: string;
}

// GET /api/admin/settings - Get general settings
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    // Try to get tenant settings from database
    if (check.tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: check.tenantId },
        select: { settings: true },
      });

      if (tenant?.settings && typeof tenant.settings === "object") {
        // Merge with defaults to ensure all keys exist
        const tenantSettings = tenant.settings as Record<string, unknown>;
        const generalSettings = tenantSettings.general as Record<string, unknown> | undefined;

        if (generalSettings) {
          return NextResponse.json({
            ...DEFAULT_SETTINGS,
            ...generalSettings,
          });
        }
      }
    }

    // Return defaults if no tenant settings exist
    return NextResponse.json(DEFAULT_SETTINGS);
  } catch (error) {
    logger.error({ err: error }, "Error fetching general settings");
    return NextResponse.json(
      { error: "Fehler beim Laden der Einstellungen" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/settings - Update general settings
export async function PUT(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const body = await request.json();

    // Validate required fields
    if (!body.applicationName || typeof body.applicationName !== "string" || !body.applicationName.trim()) {
      return NextResponse.json(
        { error: "Anwendungsname ist erforderlich" },
        { status: 400 }
      );
    }

    // Validate numeric ranges
    if (body.sessionTimeoutMinutes < 5 || body.sessionTimeoutMinutes > 1440) {
      return NextResponse.json(
        { error: "Session-Timeout muss zwischen 5 und 1440 Minuten liegen" },
        { status: 400 }
      );
    }

    if (body.maxLoginAttempts < 1 || body.maxLoginAttempts > 10) {
      return NextResponse.json(
        { error: "Maximale Login-Versuche muss zwischen 1 und 10 liegen" },
        { status: 400 }
      );
    }

    if (body.minPasswordLength < 6 || body.minPasswordLength > 32) {
      return NextResponse.json(
        { error: "Passwort-Mindestlaenge muss zwischen 6 und 32 liegen" },
        { status: 400 }
      );
    }

    // Validate email if notifications are enabled
    if (body.emailNotificationsEnabled && body.adminEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.adminEmail)) {
        return NextResponse.json(
          { error: "Ungueltige E-Mail-Adresse" },
          { status: 400 }
        );
      }
    }

    // Build the settings object with only known fields
    const generalSettings: GeneralSettings = {
      applicationName: body.applicationName.trim(),
      defaultTimezone: body.defaultTimezone || "Europe/Berlin",
      defaultLanguage: body.defaultLanguage || "de",
      dateFormat: body.dateFormat || "DD.MM.YYYY",
      currency: body.currency || "EUR",
      maintenanceModeEnabled: Boolean(body.maintenanceModeEnabled),
      maintenanceMessage: body.maintenanceMessage || "",
      scheduledMaintenanceTime: body.scheduledMaintenanceTime || null,
      sessionTimeoutMinutes: Number(body.sessionTimeoutMinutes) || 30,
      maxLoginAttempts: Number(body.maxLoginAttempts) || 5,
      minPasswordLength: Number(body.minPasswordLength) || 8,
      passwordRequiresSpecialChar: Boolean(body.passwordRequiresSpecialChar),
      passwordRequiresNumber: Boolean(body.passwordRequiresNumber),
      emailNotificationsEnabled: Boolean(body.emailNotificationsEnabled),
      adminEmail: body.adminEmail || "",
    };

    // Save to tenant settings
    if (check.tenantId) {
      // Get current tenant settings
      const tenant = await prisma.tenant.findUnique({
        where: { id: check.tenantId },
        select: { settings: true },
      });

      const currentSettings = (tenant?.settings as Record<string, unknown>) || {};

      // Update with new general settings - use JSON.parse/stringify for clean JSON type
      const updatedSettings = JSON.parse(JSON.stringify({
        ...currentSettings,
        general: generalSettings,
      }));

      await prisma.tenant.update({
        where: { id: check.tenantId },
        data: {
          settings: updatedSettings,
        },
      });

      return NextResponse.json(generalSettings);
    }

    // If no tenant ID (should not happen with proper auth)
    return NextResponse.json(
      { error: "Mandant nicht gefunden" },
      { status: 400 }
    );
  } catch (error) {
    logger.error({ err: error }, "Error saving general settings");
    return NextResponse.json(
      { error: "Fehler beim Speichern der Einstellungen" },
      { status: 500 }
    );
  }
}
