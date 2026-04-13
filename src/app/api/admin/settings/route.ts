import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { EMAIL_REGEX } from "@/lib/validation/patterns";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";

const putSettingsSchema = z.object({
  applicationName: z.string().min(1, "Anwendungsname ist erforderlich"),
  defaultTimezone: z.string().optional().default("Europe/Berlin"),
  defaultLanguage: z.string().optional().default("de"),
  dateFormat: z.string().optional().default("DD.MM.YYYY"),
  currency: z.string().optional().default("EUR"),
  maintenanceModeEnabled: z.boolean().optional().default(false),
  maintenanceMessage: z.string().optional().default(""),
  scheduledMaintenanceTime: z.string().nullable().optional().default(null),
  sessionTimeoutMinutes: z.number().min(5).max(1440).optional().default(30),
  maxLoginAttempts: z.number().min(1).max(10).optional().default(5),
  minPasswordLength: z.number().min(6).max(32).optional().default(8),
  passwordRequiresSpecialChar: z.boolean().optional().default(true),
  passwordRequiresNumber: z.boolean().optional().default(true),
  emailNotificationsEnabled: z.boolean().optional().default(true),
  adminEmail: z.string().optional().default(""),
});

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
  maintenanceMessage: "Das System wird gewartet. Bitte versuchen Sie es später erneut.",
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
export async function GET(_request: NextRequest) {
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
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Einstellungen" });
  }
}

// PUT /api/admin/settings - Update general settings
export async function PUT(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = putSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const data = parsed.data;

    // Validate email if notifications are enabled
    if (data.emailNotificationsEnabled && data.adminEmail) {
      if (!EMAIL_REGEX.test(data.adminEmail)) {
        return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige E-Mail-Adresse" });
      }
    }

    // Build the settings object with only known fields
    const generalSettings: GeneralSettings = {
      applicationName: data.applicationName.trim(),
      defaultTimezone: data.defaultTimezone,
      defaultLanguage: data.defaultLanguage,
      dateFormat: data.dateFormat,
      currency: data.currency,
      maintenanceModeEnabled: data.maintenanceModeEnabled,
      maintenanceMessage: data.maintenanceMessage,
      scheduledMaintenanceTime: data.scheduledMaintenanceTime ?? null,
      sessionTimeoutMinutes: data.sessionTimeoutMinutes,
      maxLoginAttempts: data.maxLoginAttempts,
      minPasswordLength: data.minPasswordLength,
      passwordRequiresSpecialChar: data.passwordRequiresSpecialChar,
      passwordRequiresNumber: data.passwordRequiresNumber,
      emailNotificationsEnabled: data.emailNotificationsEnabled,
      adminEmail: data.adminEmail,
    };

    // Save to tenant settings
    if (check.tenantId) {
      // Get current tenant settings
      const tenant = await prisma.tenant.findUnique({
        where: { id: check.tenantId },
        select: { settings: true },
      });

      const currentSettings = (tenant?.settings as Record<string, unknown>) || {};

      // Update with new general settings — structuredClone is faster than JSON.parse(JSON.stringify(...))
      const updatedSettings = structuredClone({
        ...currentSettings,
        general: generalSettings,
      });

      await prisma.tenant.update({
        where: { id: check.tenantId },
        data: {
          settings: updatedSettings,
        },
      });

      return NextResponse.json(generalSettings);
    }

    // If no tenant ID (should not happen with proper auth)
    return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
  } catch (error) {
    logger.error({ err: error }, "Error saving general settings");
    return apiError("SAVE_FAILED", undefined, { message: "Fehler beim Speichern der Einstellungen" });
  }
}
