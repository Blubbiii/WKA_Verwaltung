/**
 * System Configuration API - Single Key Operations
 *
 * GET    - Retrieve a specific configuration value
 * PATCH  - Update a specific configuration value
 * DELETE - Delete a specific configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import {
  getConfig,
  setConfig,
  deleteConfig,
  getConfigKeyMetadata,
  isKnownConfigKey,
  CONFIG_KEYS,
  type ConfigCategory,
  type ConfigKey,
} from "@/lib/config";
import { maskSensitive } from "@/lib/email/encryption";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const updateConfigSchema = z.object({
  value: z.string(),
  category: z.enum(["email", "weather", "storage", "general"]).optional(),
  encrypted: z.boolean().optional(),
  label: z.string().optional(),
  tenantId: z.string().uuid().nullable().optional(),
});

// =============================================================================
// GET /api/admin/system-config/[key]
// =============================================================================

interface RouteParams {
  params: Promise<{ key: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const { key } = await params;
    const decodedKey = decodeURIComponent(key);

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId") || check.tenantId;

    // Get the config value
    const value = await getConfig(decodedKey, tenantId);

    // Get metadata for this key
    const metadata = getConfigKeyMetadata(decodedKey);

    if (value === null && !metadata) {
      return NextResponse.json(
        { error: "Konfiguration nicht gefunden" },
        { status: 404 }
      );
    }

    // Mask sensitive values
    let displayValue = value;
    if (metadata?.encrypted && value) {
      displayValue = maskSensitive(value);
    }

    return NextResponse.json({
      key: decodedKey,
      value: displayValue,
      encrypted: metadata?.encrypted || false,
      category: metadata?.category || "general",
      label: metadata?.label || decodedKey,
      hasValue: value !== null,
      isKnownKey: isKnownConfigKey(decodedKey),
    });
  } catch (error) {
    logger.error({ err: error }, "[System Config API] GET [key] error");
    return NextResponse.json(
      { error: "Fehler beim Laden der Konfiguration" },
      { status: 500 }
    );
  }
}

// =============================================================================
// PATCH /api/admin/system-config/[key]
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const { key } = await params;
    const decodedKey = decodeURIComponent(key);

    const body = await request.json();
    const parsed = updateConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { value, category, encrypted, label, tenantId } = parsed.data;

    // Get metadata for this key (to determine defaults)
    const keyMeta = CONFIG_KEYS[decodedKey as ConfigKey];

    // Determine final values
    const finalCategory = (category || keyMeta?.category || "general") as ConfigCategory;
    const finalEncrypted = encrypted ?? keyMeta?.encrypted ?? false;
    const finalLabel = label || keyMeta?.label || decodedKey;
    const effectiveTenantId = tenantId === undefined ? check.tenantId : tenantId;

    // Update the config
    const result = await setConfig(decodedKey, value, {
      category: finalCategory,
      encrypted: finalEncrypted,
      label: finalLabel,
      tenantId: effectiveTenantId,
    });

    return NextResponse.json({
      success: true,
      config: result,
    });
  } catch (error) {
    logger.error({ err: error }, "[System Config API] PATCH [key] error");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Konfiguration" },
      { status: 500 }
    );
  }
}

// =============================================================================
// DELETE /api/admin/system-config/[key]
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const { key } = await params;
    const decodedKey = decodeURIComponent(key);

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId") || check.tenantId;

    // Delete the config
    const deleted = await deleteConfig(decodedKey, tenantId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Konfiguration nicht gefunden oder konnte nicht geloescht werden" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Konfiguration '${decodedKey}' wurde geloescht`,
    });
  } catch (error) {
    logger.error({ err: error }, "[System Config API] DELETE [key] error");
    return NextResponse.json(
      { error: "Fehler beim Loeschen der Konfiguration" },
      { status: 500 }
    );
  }
}
