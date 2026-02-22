import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSuperadmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import {
  encryptConfig,
  decryptConfig,
  isEncrypted,
  maskSensitive,
  clearProviderCache,
  type EmailProviderType,
} from "@/lib/email";

// =============================================================================
// EMAIL CONFIGURATION API
// =============================================================================

// Types for email configuration stored in Tenant.settings JSON (legacy)
interface SmtpConfig {
  host: string;
  port: number;
  encryption: "NONE" | "SSL" | "TLS";
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
}

interface NotificationSettings {
  systemEmailsEnabled: boolean;
  welcomeEmail: boolean;
  passwordReset: boolean;
  newVote: boolean;
  voteReminder: boolean;
  newCredit: boolean;
  contractWarning: boolean;
}

interface EmailTemplate {
  id: string;
  name: string;
  key: string;
  subject: string;
  active: boolean;
}

interface EmailSettings {
  smtp?: SmtpConfig;
  notifications?: NotificationSettings;
  templates?: EmailTemplate[];
}

// =============================================================================
// Validation Schemas (for new provider-based config)
// =============================================================================

const smtpProviderConfigSchema = z.object({
  host: z.string().min(1, "SMTP Host erforderlich"),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().min(1, "SMTP Benutzer erforderlich"),
  password: z.string().min(1, "SMTP Passwort erforderlich"),
});

const sendgridConfigSchema = z.object({
  apiKey: z.string().min(1, "SendGrid API Key erforderlich"),
});

const sesConfigSchema = z.object({
  accessKeyId: z.string().min(1, "AWS Access Key ID erforderlich"),
  secretAccessKey: z.string().min(1, "AWS Secret Access Key erforderlich"),
  region: z.string().min(1, "AWS Region erforderlich"),
});

const updateProviderSettingsSchema = z.object({
  provider: z.enum(["smtp", "sendgrid", "ses"]).nullable().optional(),
  config: z
    .union([smtpProviderConfigSchema, sendgridConfigSchema, sesConfigSchema])
    .nullable()
    .optional(),
  fromAddress: z.string().email("Ungueltige E-Mail-Adresse").nullable().optional(),
  fromName: z.string().max(100).nullable().optional(),
});

// Default email templates
const defaultTemplates: EmailTemplate[] = [
  { id: "1", name: "Willkommens-E-Mail", key: "welcome", subject: "Willkommen bei WindparkManager", active: true },
  { id: "2", name: "Passwort-Reset", key: "password-reset", subject: "Passwort zuruecksetzen", active: true },
  { id: "3", name: "Neue Abstimmung", key: "new-vote", subject: "Neue Abstimmung verfuegbar", active: true },
  { id: "4", name: "Abstimmungs-Erinnerung", key: "vote-reminder", subject: "Erinnerung: Abstimmung endet bald", active: true },
  { id: "5", name: "Neue Gutschrift", key: "new-credit", subject: "Neue Gutschrift verfuegbar", active: false },
  { id: "6", name: "Vertragsfrist-Warnung", key: "contract-warning", subject: "Vertragsfrist laeuft ab", active: true },
];

// Default notification settings
const defaultNotifications: NotificationSettings = {
  systemEmailsEnabled: true,
  welcomeEmail: true,
  passwordReset: true,
  newVote: true,
  voteReminder: true,
  newCredit: true,
  contractWarning: true,
};

// =============================================================================
// GET /api/admin/email - Get email configuration
// =============================================================================
// Type for tenant with new email fields (will be properly typed after prisma generate)
interface TenantWithEmailFields {
  settings: unknown;
  emailProvider?: string | null;
  emailConfig?: unknown;
  emailFromAddress?: string | null;
  emailFromName?: string | null;
}

export async function GET() {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    // Note: emailProvider, emailConfig, emailFromAddress, emailFromName are new fields
    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId! },
    }) as TenantWithEmailFields | null;

    if (!tenant) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 404 }
      );
    }

    const settings = (tenant.settings as Record<string, unknown>) || {};
    const emailSettings = (settings.email as EmailSettings) || {};

    // Decrypt and mask provider config for display
    let maskedProviderConfig: Record<string, unknown> | null = null;
    if (tenant.emailConfig) {
      try {
        const configStr =
          typeof tenant.emailConfig === "string"
            ? tenant.emailConfig
            : JSON.stringify(tenant.emailConfig);

        const decrypted = isEncrypted(configStr)
          ? decryptConfig<Record<string, unknown>>(configStr)
          : (JSON.parse(configStr) as Record<string, unknown>);

        // Mask sensitive values
        maskedProviderConfig = {};
        for (const [key, value] of Object.entries(decrypted)) {
          if (
            typeof value === "string" &&
            (key.toLowerCase().includes("password") ||
              key.toLowerCase().includes("key") ||
              key.toLowerCase().includes("secret"))
          ) {
            maskedProviderConfig[key] = maskSensitive(value);
          } else {
            maskedProviderConfig[key] = value;
          }
        }
      } catch (error) {
        logger.error({ err: error }, "[Admin Email API] Failed to decrypt config");
        maskedProviderConfig = null;
      }
    }

    // Check environment variables as fallback
    const hasEnvConfig = !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
    );

    // Return config with defaults merged
    return NextResponse.json({
      // Legacy settings (from Tenant.settings JSON)
      smtp: emailSettings.smtp || {
        host: process.env.SMTP_HOST || "",
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        encryption: "TLS",
        username: process.env.SMTP_USER || "",
        password: "", // Never return actual password
        fromEmail: process.env.SMTP_FROM_EMAIL || "",
        fromName: process.env.SMTP_FROM_NAME || "WindparkManager",
      },
      notifications: emailSettings.notifications || defaultNotifications,
      templates: emailSettings.templates || defaultTemplates,

      // New provider-based settings
      providerSettings: {
        provider: tenant.emailProvider,
        config: maskedProviderConfig,
        fromAddress: tenant.emailFromAddress,
        fromName: tenant.emailFromName,
      },

      // Environment fallback info
      fallback: {
        available: hasEnvConfig,
        provider: hasEnvConfig ? "smtp" : null,
        fromAddress: process.env.EMAIL_FROM_ADDRESS || null,
        fromName: process.env.EMAIL_FROM_NAME || null,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching email config");
    return NextResponse.json(
      { error: "Fehler beim Laden der E-Mail-Konfiguration" },
      { status: 500 }
    );
  }
}

// =============================================================================
// PUT /api/admin/email - Save email configuration (legacy settings in Tenant.settings)
// =============================================================================
export async function PUT(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const { smtp, notifications } = body;

    // Get current settings
    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId! },
      select: { settings: true },
    });

    if (!tenant) {
      return NextResponse.json(
        { error: "Mandant nicht gefunden" },
        { status: 404 }
      );
    }

    const currentSettings = (tenant.settings as Record<string, unknown>) || {};
    const currentEmailSettings = (currentSettings.email as EmailSettings) || {};

    // Merge SMTP settings (keep existing password if not provided)
    let updatedSmtp: SmtpConfig | undefined;
    if (smtp) {
      const existingSmtp = currentEmailSettings.smtp;
      updatedSmtp = {
        host: smtp.host || "",
        port: parseInt(smtp.port, 10) || 587,
        encryption: smtp.encryption || "TLS",
        username: smtp.username || "",
        // Keep existing password if new one is empty
        password: smtp.password || existingSmtp?.password || "",
        fromEmail: smtp.fromEmail || "",
        fromName: smtp.fromName || "",
      };
    }

    // Update email settings in tenant.settings JSON
    const updatedSettings = {
      ...currentSettings,
      email: {
        ...currentEmailSettings,
        ...(updatedSmtp && { smtp: updatedSmtp }),
        ...(notifications && { notifications }),
      },
    };

    await prisma.tenant.update({
      where: { id: check.tenantId! },
      data: { settings: updatedSettings },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error saving email config");
    return NextResponse.json(
      { error: "Fehler beim Speichern der E-Mail-Konfiguration" },
      { status: 500 }
    );
  }
}

// =============================================================================
// PATCH /api/admin/email - Update provider-based email settings (new schema)
// =============================================================================
export async function PATCH(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = updateProviderSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { provider, config, fromAddress, fromName } = parsed.data;

    // Validate that config matches provider
    if (provider && config) {
      const configValid = validateConfigForProvider(provider as EmailProviderType, config);
      if (!configValid.valid) {
        return NextResponse.json(
          { error: configValid.error },
          { status: 400 }
        );
      }
    }

    // Prepare update data
    const updateData: {
      emailProvider?: string | null;
      emailConfig?: string | null;
      emailFromAddress?: string | null;
      emailFromName?: string | null;
    } = {};

    // Handle provider update
    if (provider !== undefined) {
      updateData.emailProvider = provider;
    }

    // Handle config update (encrypt sensitive data)
    if (config !== undefined) {
      if (config === null) {
        updateData.emailConfig = null;
      } else {
        // Check if any values are masked (unchanged)
        // If so, merge with existing config
        const finalConfig = await mergeWithExistingConfig(
          check.tenantId!,
          config as Record<string, unknown>
        );
        updateData.emailConfig = encryptConfig(finalConfig);
      }
    }

    // Handle from address update
    if (fromAddress !== undefined) {
      updateData.emailFromAddress = fromAddress;
    }

    // Handle from name update
    if (fromName !== undefined) {
      updateData.emailFromName = fromName;
    }

    // Update tenant
    // Note: Using as Record<string, unknown> to allow new fields before prisma generate
    await prisma.tenant.update({
      where: { id: check.tenantId! },
      data: updateData as Record<string, unknown>,
    });

    // Clear provider cache to force reload
    clearProviderCache(check.tenantId!);

    return NextResponse.json({
      success: true,
      settings: {
        provider: updateData.emailProvider,
        fromAddress: updateData.emailFromAddress,
        fromName: updateData.emailFromName,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Admin Email API] PATCH error");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Validate that config matches the provider type
 */
function validateConfigForProvider(
  provider: EmailProviderType,
  config: unknown
): { valid: boolean; error?: string } {
  try {
    switch (provider) {
      case "smtp":
        smtpProviderConfigSchema.parse(config);
        break;
      case "sendgrid":
        sendgridConfigSchema.parse(config);
        break;
      case "ses":
        sesConfigSchema.parse(config);
        break;
      default:
        return { valid: false, error: `Unbekannter Provider: ${provider}` };
    }
    return { valid: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        valid: false,
        error: error.errors.map((e) => e.message).join(", "),
      };
    }
    return { valid: false, error: "Ungueltige Konfiguration" };
  }
}

/**
 * Merge new config with existing, keeping encrypted values for masked fields
 */
async function mergeWithExistingConfig(
  tenantId: string,
  newConfig: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // Check if any values appear to be masked (contain "...")
  const hasMaskedValues = Object.values(newConfig).some(
    (v) => typeof v === "string" && v.includes("...")
  );

  if (!hasMaskedValues) {
    return newConfig;
  }

  // Fetch existing config
  // Note: emailConfig is a new field
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  }) as { emailConfig?: unknown } | null;

  if (!tenant?.emailConfig) {
    return newConfig;
  }

  try {
    const configStr =
      typeof tenant.emailConfig === "string"
        ? tenant.emailConfig
        : JSON.stringify(tenant.emailConfig);

    const existingConfig = isEncrypted(configStr)
      ? decryptConfig<Record<string, unknown>>(configStr)
      : (JSON.parse(configStr) as Record<string, unknown>);

    // Merge, keeping existing values for masked fields
    const merged: Record<string, unknown> = { ...newConfig };

    for (const [key, value] of Object.entries(newConfig)) {
      if (typeof value === "string" && value.includes("...")) {
        // Keep existing value
        merged[key] = existingConfig[key];
      }
    }

    return merged;
  } catch (error) {
    logger.error({ err: error }, "[Admin Email API] Failed to merge config");
    return newConfig;
  }
}

// =============================================================================
// POST /api/admin/email - Send test email (now with real sending!)
// =============================================================================
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const { action, recipient } = body;

    if (action !== "test") {
      return NextResponse.json(
        { error: "Unbekannte Aktion" },
        { status: 400 }
      );
    }

    if (!recipient) {
      return NextResponse.json(
        { error: "Empfaenger-Adresse fehlt" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipient)) {
      return NextResponse.json(
        { error: "Ungueltige E-Mail-Adresse" },
        { status: 400 }
      );
    }

    // Import the email testing function
    const { testEmailConfiguration } = await import("@/lib/email");

    // Send the test email
    const result = await testEmailConfiguration(check.tenantId!, recipient);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Test-E-Mail wurde erfolgreich an ${recipient} gesendet.`,
        messageId: result.messageId,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "E-Mail konnte nicht gesendet werden",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error({ err: error }, "Error sending test email");
    return NextResponse.json(
      { error: "Fehler beim Senden der Test-E-Mail" },
      { status: 500 }
    );
  }
}

// =============================================================================
// Environment Variables Documentation
// =============================================================================
/**
 * Required environment variables for email functionality:
 *
 * SMTP_HOST             - SMTP server hostname (e.g., "smtp.gmail.com")
 * SMTP_PORT             - SMTP server port (25, 465, 587, or 2525)
 * SMTP_USER             - SMTP username (usually email address)
 * SMTP_PASS             - SMTP password or app-specific password
 * EMAIL_FROM_ADDRESS    - Default sender email address
 * EMAIL_FROM_NAME       - Default sender name (e.g., "WindparkManager")
 * EMAIL_ENCRYPTION_KEY  - 64-char hex key for encrypting sensitive config (optional)
 *
 * Note: Tenant-specific email settings override these defaults.
 * New settings are stored in dedicated Tenant fields:
 *   - emailProvider (smtp, sendgrid, ses)
 *   - emailConfig (encrypted JSON)
 *   - emailFromAddress
 *   - emailFromName
 *
 * Legacy settings are still supported in Tenant.settings.email for backwards compatibility.
 */
