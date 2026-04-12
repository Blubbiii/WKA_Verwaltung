/**
 * Tenant Feature Flags API
 *
 * GET  - Read feature flags for the current tenant
 * PUT  - Update feature flags for the current tenant
 *
 * Accessible by tenant admins (settings:read / settings:update)
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import {
  getConfigBoolean,
  setConfig,
  type ConfigCategory,
} from "@/lib/config";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";

const putFeaturesSchema = z.object({
  features: z.record(z.string(), z.boolean()),
});

// Known feature flags
const FEATURE_FLAGS = [
  {
    key: "management-billing.enabled",
    label: "BF-Abrechnung",
    description: "Betriebsführungs-Abrechnungen (Konstellationen, Berechnung, Rechnungserstellung)",
  },
] as const;

// GET /api/admin/features
export async function GET() {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const features: Record<string, boolean> = {};

    for (const flag of FEATURE_FLAGS) {
      features[flag.key] = await getConfigBoolean(
        flag.key,
        check.tenantId,
        false
      );
    }

    return NextResponse.json({
      features,
      available: FEATURE_FLAGS,
    });
  } catch (error) {
    logger.error({ err: error }, "[Features API] GET error");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Feature-Flags" });
  }
}

// PUT /api/admin/features
export async function PUT(request: NextRequest) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = putFeaturesSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }
    const { features } = parsed.data;

    // Only allow known feature flags
    const knownKeys = new Set<string>(FEATURE_FLAGS.map((f) => f.key));
    const results: Record<string, boolean> = {};

    for (const [key, value] of Object.entries(features)) {
      if (!knownKeys.has(key)) continue;

      await setConfig(key, value ? "true" : "false", {
        category: "features" as ConfigCategory,
        tenantId: check.tenantId,
      });

      results[key] = value;
    }

    return NextResponse.json({ success: true, features: results });
  } catch (error) {
    logger.error({ err: error }, "[Features API] PUT error");
    return apiError("SAVE_FAILED", undefined, { message: "Fehler beim Speichern der Feature-Flags" });
  }
}
