/**
 * Tenant Email Configuration API
 *
 * GET    - Retrieve the current tenant's SMTP email configuration
 * POST   - Create or update tenant-specific SMTP email configuration
 * DELETE - Remove tenant-specific config (reverts to global/env defaults)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  getConfigsByCategory,
  setConfig,
  deleteConfig,
  type ConfigCategory,
} from "@/lib/config";
import { clearProviderCache } from "@/lib/email/provider";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const smtpConfigSchema = z.object({
  smtpHost: z.string().min(1, "SMTP Host ist erforderlich"),
  smtpPort: z.string().regex(/^(25|465|587|2525)$/, "Ungültiger SMTP Port"),
  smtpUser: z.string().min(1, "SMTP Benutzer ist erforderlich"),
  smtpPassword: z.string().optional(),
  smtpSecure: z.boolean(),
  fromAddress: z.string().email("Ungültige E-Mail-Adresse"),
  fromName: z.string().max(100).optional(),
});

// =============================================================================
// EMAIL CONFIG KEYS
// =============================================================================

const EMAIL_CONFIG_KEYS = [
  "email.smtp.host",
  "email.smtp.port",
  "email.smtp.user",
  "email.smtp.password",
  "email.smtp.secure",
  "email.from.address",
  "email.from.name",
] as const;

// =============================================================================
// GET /api/admin/tenant-email
// =============================================================================

export async function GET(_request: NextRequest) {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    // Fetch all email configs (tenant-specific override global)
    const configs = await getConfigsByCategory(
      "email",
      check.tenantId,
      true // mask sensitive values
    );

    // Determine if tenant has custom (non-global) config
    const isCustom = configs.some((c) => c.tenantId !== null);

    // Build a lookup map for quick access
    const configMap = new Map(configs.map((c) => [c.key, c]));

    // Extract values for the frontend
    const smtpHost = configMap.get("email.smtp.host")?.value || "";
    const smtpPort = configMap.get("email.smtp.port")?.value || "587";
    const smtpUser = configMap.get("email.smtp.user")?.value || "";
    const smtpSecure = configMap.get("email.smtp.secure")?.value === "true";
    const fromAddress = configMap.get("email.from.address")?.value || "";
    const fromName = configMap.get("email.from.name")?.value || "";

    // For the password, only indicate whether one is stored
    const passwordValue = configMap.get("email.smtp.password")?.value || "";
    const hasPassword = passwordValue.length > 0 && passwordValue !== "***";

    return NextResponse.json({
      isCustom,
      config: {
        smtpHost,
        smtpPort,
        smtpUser,
        hasPassword,
        smtpSecure,
        fromAddress,
        fromName,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[Tenant Email API] GET error");
    return NextResponse.json(
      { error: "Fehler beim Laden der E-Mail-Konfiguration" },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/admin/tenant-email
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = smtpConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const {
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPassword,
      smtpSecure,
      fromAddress,
      fromName,
    } = parsed.data;

    const configOptions = {
      category: "email" as ConfigCategory,
      tenantId: check.tenantId,
    };

    // Save each SMTP config value
    await setConfig("email.smtp.host", smtpHost, configOptions);
    await setConfig("email.smtp.port", smtpPort, configOptions);
    await setConfig("email.smtp.user", smtpUser, configOptions);

    // Only update password if a new one was provided
    if (smtpPassword) {
      await setConfig("email.smtp.password", smtpPassword, {
        ...configOptions,
        encrypted: true,
      });
    }

    await setConfig(
      "email.smtp.secure",
      smtpSecure ? "true" : "false",
      configOptions
    );
    await setConfig("email.from.address", fromAddress, configOptions);
    await setConfig("email.from.name", fromName || "", configOptions);

    // Clear the cached provider so the next send picks up the new config
    clearProviderCache(check.tenantId!);

    logger.info(
      { tenantId: check.tenantId, userId: check.userId },
      "[Tenant Email API] SMTP configuration updated"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      { err: error },
      "[Tenant Email API] POST error: " + errMsg
    );
    return NextResponse.json(
      { error: "Fehler beim Speichern der E-Mail-Konfiguration" },
      { status: 500 }
    );
  }
}

// =============================================================================
// DELETE /api/admin/tenant-email
// =============================================================================

export async function DELETE(_request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    // Remove all tenant-specific email config keys
    await Promise.all(
      EMAIL_CONFIG_KEYS.map((key) => deleteConfig(key, check.tenantId))
    );

    // Clear the cached provider so it falls back to global/env defaults
    clearProviderCache(check.tenantId!);

    logger.info(
      { tenantId: check.tenantId, userId: check.userId },
      "[Tenant Email API] Tenant SMTP configuration deleted (reverted to defaults)"
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[Tenant Email API] DELETE error");
    return NextResponse.json(
      { error: "Fehler beim Zurücksetzen der E-Mail-Konfiguration" },
      { status: 500 }
    );
  }
}
