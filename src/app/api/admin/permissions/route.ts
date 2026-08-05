import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSuperadmin } from "@/lib/auth/withPermission";
import { cache } from "@/lib/cache";
import { CACHE_TTL } from "@/lib/cache/types";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";
import {
  MODUL_BESCHRIFTUNGEN,
  modulBeschriftung,
  sortiereModule,
} from "@/lib/auth/module-labels";

/*
  Die Modul-Beschriftungen standen hier als eigene Liste — zwanzig Eintraege,
  waehrend es 32 Module gibt. Eine zweite, noch kuerzere Kopie lag in der
  Export-Route, eine dritte in der PDF-Vorlage. Drei Listen, drei Staende.

  Sichtbar wurde es in der exportierten Berechtigungs-Matrix: fuenfzehn
  Ueberschriften standen dort als technischer Schluessel, und weil dieselben
  fuenfzehn auch in der Reihenfolge fehlten, hingen sie unsortiert hinten dran.

  Jetzt eine Quelle: `lib/auth/module-labels.ts`, gehalten von einem Waechter,
  der sie gegen den Rechte-Katalog vergleicht.
*/

// Action name translations
const actionLabels: Record<string, string> = {
  read: "Anzeigen",
  create: "Erstellen",
  update: "Bearbeiten",
  delete: "Löschen",
  export: "Exportieren",
  download: "Herunterladen",
  manage: "Verwalten",
  assign: "Zuweisen",
  impersonate: "Impersonieren",
  email: "E-Mail",
  "billing-rules": "Abrechnungsregeln",
  "settlement-periods": "Abrechnungsperioden",
  "access-report": "Zugriffsreport",
  "mass-communication": "Massen-Kommunikation",
  "invoice-settings": "Rechnungseinstellungen",
  templates: "Vorlagen",
  tenants: "Mandanten",
  settings: "Einstellungen",
  health: "System & Wartung",
  config: "Konfiguration",
  audit: "Audit-Logs",
  backup: "Backup & Speicher",
  marketing: "Marketing",
  "revenue-types": "Vergütungsarten",
  "fund-categories": "Gesellschaftstypen",
};

// GET /api/admin/permissions - Alle Permissions laden (gruppiert nach Modul)
export async function GET(_request: NextRequest) {
  try {
    const check = await requirePermission("roles:read");
    if (!check.authorized) return check.error;

    // Non-superadmins cannot see system:* permissions (they can't assign them anyway)
    const superadminCheck = await requireSuperadmin();
    const isSuperAdmin = superadminCheck.authorized;

    // Permissions rarely change -- serve from Redis cache if available
    // Separate cache keys for superadmin (sees system:* modules) vs regular users
    const cacheKey = isSuperAdmin ? "admin:permissions:all:superadmin" : "admin:permissions:all:regular";

    try {
      const cached = await cache.get<Record<string, unknown>>(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: {
            "X-Cache": "HIT",
            "Cache-Control": `private, max-age=${CACHE_TTL.SHORT}, stale-while-revalidate=${CACHE_TTL.MEDIUM}`,
          },
        });
      }
    } catch (error) {
      logger.warn("[Permissions] Cache read error: %s", error instanceof Error ? error.message : "Unknown error");
    }

    const permissions = await prisma.permission.findMany({
      where: isSuperAdmin ? {} : { module: { not: "system" } },
      orderBy: [
        { sortOrder: "asc" },
        { module: "asc" },
        { action: "asc" },
      ],
    });

    // Group by module
    const grouped: Record<string, {
      module: string;
      label: string;
      permissions: Array<{
        id: string;
        name: string;
        displayName: string;
        action: string;
        actionLabel: string;
      }>;
    }> = {};

    for (const perm of permissions) {
      if (!grouped[perm.module]) {
        grouped[perm.module] = {
          module: perm.module,
          label: modulBeschriftung(perm.module),
          permissions: [],
        };
      }

      grouped[perm.module].permissions.push({
        id: perm.id,
        name: perm.name,
        displayName: perm.displayName,
        action: perm.action,
        actionLabel: actionLabels[perm.action] || perm.action,
      });
    }

    const result = sortiereModule(Object.keys(grouped)).map((m) => grouped[m]);

    const responseData = {
      permissions,
      grouped: result,
      moduleLabels: MODUL_BESCHRIFTUNGEN,
      actionLabels,
    };

    // Cache permissions for 1 hour (they rarely change)
    cache.set(cacheKey, responseData, CACHE_TTL.LONG).catch((err) => {
      logger.warn({ err: err }, "[Permissions] Cache write error");
    });

    return NextResponse.json(responseData, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": `private, max-age=${CACHE_TTL.SHORT}, stale-while-revalidate=${CACHE_TTL.MEDIUM}`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching permissions");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden der Berechtigungen" });
  }
}
