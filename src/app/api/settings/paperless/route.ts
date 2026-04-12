/**
 * Tenant-Level Paperless-ngx Configuration API
 *
 * GET  - Retrieve paperless config for the current tenant (ADMIN+)
 * POST - Save paperless config for the current tenant (ADMIN+)
 */

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import {
  getConfigsByCategory,
  setConfig,
  CONFIG_KEYS,
  type ConfigCategory,
  type ConfigKey,
} from "@/lib/config";
import { z } from "zod";

const paperlessConfigSchema = z.object({
  configs: z.array(z.object({
    key: z.string().min(1),
    value: z.string(),
    category: z.literal("paperless"),
  })).min(1, "Keine Konfigurationsdaten"),
});

// =============================================================================
// GET /api/settings/paperless
// =============================================================================

export async function GET() {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    const configs = await getConfigsByCategory(
      "paperless" as ConfigCategory,
      check.tenantId,
      true // mask sensitive values
    );

    // Build availableKeys for paperless category
    const availableKeys = Object.entries(CONFIG_KEYS)
      .filter(([, meta]) => meta.category === "paperless")
      .map(([key, meta]) => ({
        key,
        category: meta.category,
        label: meta.label,
        encrypted: meta.encrypted,
        envFallback: "envFallback" in meta ? meta.envFallback : undefined,
        defaultValue: "defaultValue" in meta ? meta.defaultValue : undefined,
      }));

    return NextResponse.json({
      configs: configs.map((c) => ({
        ...c,
        updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
      })),
      availableKeys,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, detail }, "[Settings/Paperless] GET error");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Konfiguration" });
  }
}

// =============================================================================
// POST /api/settings/paperless
// =============================================================================

export async function POST(request: Request) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = paperlessConfigSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { configs } = parsed.data;

    const results = [];
    for (const c of configs) {
      const keyMeta = CONFIG_KEYS[c.key as ConfigKey];
      const result = await setConfig(c.key, c.value, {
        category: "paperless" as ConfigCategory,
        encrypted: keyMeta?.encrypted ?? false,
        label: keyMeta?.label,
        tenantId: check.tenantId,
      });
      results.push(result);
    }

    logger.info(
      { tenantId: check.tenantId, keys: configs.map((c) => c.key) },
      "[Settings/Paperless] Config saved"
    );

    return NextResponse.json({ success: true, configs: results });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, detail }, "[Settings/Paperless] POST error");
    return apiError("SAVE_FAILED", 500, { message: "Fehler beim Speichern der Konfiguration" });
  }
}
