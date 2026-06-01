/**
 * PATCH /api/superadmin/system-settings/[key]
 *
 * Ändert einen einzelnen Setting-Wert. Body: { value: any }.
 * Invalidiert den In-Process-Cache nach Änderung — alle nachfolgenden
 * Lib-Calls sehen den neuen Wert.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  SYSTEM_SETTING_DEFAULTS,
  invalidateSystemSettingsCache,
} from "@/lib/system-settings";
import { serializePrisma } from "@/lib/serialize";
import { Prisma } from "@prisma/client";

const patchSchema = z.object({
  value: z.unknown(),
  validFrom: z.iso.datetime().nullable().optional(),
  validTo: z.iso.datetime().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const { key } = await params;
    if (!(key in SYSTEM_SETTING_DEFAULTS)) {
      return apiError("NOT_FOUND", 404, {
        message: `Unbekannter Setting-Key: "${key}"`,
      });
    }

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message || "Ungültige Eingabe",
      });
    }

    const def = SYSTEM_SETTING_DEFAULTS[key as keyof typeof SYSTEM_SETTING_DEFAULTS];

    const updated = await prisma.systemSetting.upsert({
      where: { key },
      create: {
        key,
        value: parsed.data.value as unknown as Prisma.InputJsonValue,
        category: def.category,
        description: def.description,
        validFrom: parsed.data.validFrom ? new Date(parsed.data.validFrom) : null,
        validTo: parsed.data.validTo ? new Date(parsed.data.validTo) : null,
        updatedById: check.userId!,
      },
      update: {
        value: parsed.data.value as unknown as Prisma.InputJsonValue,
        validFrom: parsed.data.validFrom ? new Date(parsed.data.validFrom) : null,
        validTo: parsed.data.validTo ? new Date(parsed.data.validTo) : null,
        updatedById: check.userId!,
      },
    });

    invalidateSystemSettingsCache();

    logger.info(
      { userId: check.userId, key, newValue: parsed.data.value },
      "System setting updated",
    );

    return NextResponse.json(serializePrisma(updated));
  } catch (error) {
    logger.error({ err: error }, "Error updating system setting");
    return apiError("UPDATE_FAILED", 500, {
      message: "Fehler beim Aktualisieren der System-Einstellung",
    });
  }
}
