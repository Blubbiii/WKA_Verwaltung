/**
 * System Configuration API
 *
 * GET  - Retrieve all system configurations (masked for sensitive values)
 * POST - Create or update a system configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import {
  getAllConfigs,
  getConfigsByCategory,
  setConfig,
  setConfigs,
  CONFIG_KEYS,
  type ConfigCategory,
  type ConfigKey,
} from "@/lib/config";

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const getCategoriesSchema = z.enum(["email", "weather", "storage", "general", "features"]);

const setConfigSchema = z.object({
  key: z.string().min(1, "Key ist erforderlich"),
  value: z.string(),
  category: z.enum(["email", "weather", "storage", "general", "features"]),
  encrypted: z.boolean().optional(),
  label: z.string().optional(),
  tenantId: z.string().uuid().nullable().optional(),
});

const bulkSetConfigSchema = z.object({
  configs: z.array(
    z.object({
      key: z.string().min(1),
      value: z.string(),
      category: z.enum(["email", "weather", "storage", "general", "features"]),
      encrypted: z.boolean().optional(),
      label: z.string().optional(),
    })
  ),
  tenantId: z.string().uuid().nullable().optional(),
});

// =============================================================================
// GET /api/admin/system-config
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    let configs;

    if (category) {
      // Validate category
      const parsed = getCategoriesSchema.safeParse(category);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Ungültige Kategorie" },
          { status: 400 }
        );
      }

      configs = await getConfigsByCategory(
        parsed.data as ConfigCategory,
        check.tenantId,
        true // mask sensitive values
      );
    } else {
      // Get all configs
      configs = await getAllConfigs(check.tenantId, true);
    }

    // Group by category for easier frontend consumption
    const grouped: Record<string, typeof configs> = {};
    for (const config of configs) {
      if (!grouped[config.category]) {
        grouped[config.category] = [];
      }
      grouped[config.category].push(config);
    }

    return NextResponse.json({
      configs,
      grouped,
      availableKeys: Object.entries(CONFIG_KEYS).map(([key, meta]) => ({
        key,
        ...meta,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "[System Config API] GET error");
    return NextResponse.json(
      { error: "Fehler beim Laden der Konfiguration" },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/admin/system-config
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    // Validate that the session tenantId still exists in the DB (guards against stale JWTs after DB reset)
    let validTenantId: string | null = null;
    if (check.tenantId) {
      const tenantExists = await prisma.tenant.findUnique({
        where: { id: check.tenantId },
        select: { id: true },
      });
      if (tenantExists) {
        validTenantId = tenantExists.id;
      } else {
        logger.warn(`[System Config API] Session tenantId ${check.tenantId} not found in DB — using null (global config)`);
      }
    }

    const body = await request.json();

    // Check if bulk operation
    if (body.configs && Array.isArray(body.configs)) {
      const parsed = bulkSetConfigSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validierungsfehler", details: parsed.error.format() },
          { status: 400 }
        );
      }

      const { configs, tenantId } = parsed.data;

      // Set the tenant ID (use provided, validated session tenant, or null for global)
      const effectiveTenantId = tenantId === undefined ? validTenantId : tenantId;

      // Prepare configs with options
      const configsToSet = configs.map((config) => {
        // Check if this key should be encrypted by default
        const keyMeta = CONFIG_KEYS[config.key as ConfigKey];
        const shouldEncrypt = config.encrypted ?? keyMeta?.encrypted ?? false;

        return {
          key: config.key,
          value: config.value,
          options: {
            category: config.category as ConfigCategory,
            encrypted: shouldEncrypt,
            label: config.label || keyMeta?.label,
            tenantId: effectiveTenantId,
          },
        };
      });

      const results = await setConfigs(configsToSet);

      return NextResponse.json({
        success: true,
        updated: results.length,
        configs: results,
      });
    }

    // Single config operation
    const parsed = setConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { key, value, category, encrypted, label, tenantId } = parsed.data;

    // Determine if encryption should be used
    const keyMeta = CONFIG_KEYS[key as ConfigKey];
    const shouldEncrypt = encrypted ?? keyMeta?.encrypted ?? false;

    // Set the tenant ID (use provided, validated session tenant, or null for global)
    const effectiveTenantId = tenantId === undefined ? validTenantId : tenantId;

    const result = await setConfig(key, value, {
      category: category as ConfigCategory,
      encrypted: shouldEncrypt,
      label: label || keyMeta?.label,
      tenantId: effectiveTenantId,
    });

    return NextResponse.json({
      success: true,
      config: result,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ err: error }, "[System Config API] POST error: " + errMsg);
    return NextResponse.json(
      { error: "Fehler beim Speichern der Konfiguration" },
      { status: 500 }
    );
  }
}
