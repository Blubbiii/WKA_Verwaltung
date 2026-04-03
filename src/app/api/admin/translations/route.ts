import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import deMessages from "@/messages/de.json";
import dePersonalMessages from "@/messages/de-personal.json";
import enMessages from "@/messages/en.json";

// GET /api/admin/translations — Load all translation keys with all 3 variants
export async function GET(_request: NextRequest) {
  try {
    const check = await requirePermission("system:config");
    if (!check.authorized) return check.error!;

    // Load DB overrides
    const overrides = await prisma.systemConfig.findMany({
      where: {
        tenantId: check.tenantId,
        key: { startsWith: "i18n." },
      },
    });

    // Build override map: key → { de?: string, "de-personal"?: string, en?: string }
    const overrideMap: Record<string, Record<string, string>> = {};
    for (const o of overrides) {
      // Key format: i18n.{locale}.{dotpath}  e.g. i18n.de.common.save
      const parts = o.key.replace("i18n.", "").split(".");
      const locale = parts[0];
      const path = parts.slice(1).join(".");
      if (!overrideMap[path]) overrideMap[path] = {};
      overrideMap[path][locale] = o.value;
    }

    // Flatten JSON messages to dot-notation
    function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "object" && value !== null) {
          Object.assign(result, flatten(value as Record<string, unknown>, fullKey));
        } else {
          result[fullKey] = String(value);
        }
      }
      return result;
    }

    const flatDe = flatten(deMessages);
    const flatDePersonal = flatten(dePersonalMessages);
    const flatEn = flatten(enMessages);

    // Merge all keys
    const allKeys = new Set([
      ...Object.keys(flatDe),
      ...Object.keys(flatDePersonal),
      ...Object.keys(flatEn),
    ]);

    const translations = Array.from(allKeys).sort().map((key) => ({
      key,
      de: overrideMap[key]?.de ?? flatDe[key] ?? "",
      "de-personal": overrideMap[key]?.["de-personal"] ?? flatDePersonal[key] ?? "",
      en: overrideMap[key]?.en ?? flatEn[key] ?? "",
      hasOverride: !!overrideMap[key],
    }));

    return NextResponse.json({ translations, total: translations.length });
  } catch (error) {
    logger.error({ err: error }, "Error loading translations");
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }
}

// PUT /api/admin/translations — Save a translation override
export async function PUT(request: NextRequest) {
  try {
    const check = await requirePermission("system:config");
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const { key, locale, value } = body as { key: string; locale: string; value: string };

    if (!key || !locale || !["de", "de-personal", "en"].includes(locale)) {
      return NextResponse.json({ error: "key und locale sind erforderlich" }, { status: 400 });
    }

    const configKey = `i18n.${locale}.${key}`;

    if (value === "" || value === null) {
      // Delete override (revert to file default)
      await prisma.systemConfig.deleteMany({
        where: { tenantId: check.tenantId!, key: configKey },
      });
    } else {
      // Upsert override
      await prisma.systemConfig.upsert({
        where: {
          tenantId_key: { tenantId: check.tenantId!, key: configKey },
        },
        update: { value },
        create: {
          tenantId: check.tenantId!,
          key: configKey,
          value,
          encrypted: false,
          category: "i18n",
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error saving translation");
    return NextResponse.json({ error: "Fehler beim Speichern" }, { status: 500 });
  }
}
