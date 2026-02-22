import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSuperadmin } from "@/lib/auth/withPermission";
import { cache } from "@/lib/cache";
import { CACHE_TTL } from "@/lib/cache/types";
import { apiLogger as logger } from "@/lib/logger";

// Module name translations
const moduleLabels: Record<string, string> = {
  parks: "Windparks",
  turbines: "Anlagen",
  funds: "Beteiligungen",
  shareholders: "Gesellschafter",
  plots: "Flurstücke",
  leases: "Pachtverträge",
  contracts: "Verträge",
  documents: "Dokumente",
  invoices: "Rechnungen",
  votes: "Abstimmungen",
  news: "Meldungen",
  "service-events": "Service-Events",
  energy: "Energie",
  reports: "Berichte",
  settings: "Einstellungen",
  users: "Benutzer",
  roles: "Rollen",
  portal: "Portal",
  admin: "Administration",
  system: "System",
};

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
export async function GET(request: NextRequest) {
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
            "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
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
          label: moduleLabels[perm.module] || perm.module,
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

    // Convert to array and sort by common order
    const moduleOrder = [
      "parks", "turbines", "funds", "shareholders", "plots", "leases",
      "contracts", "documents", "invoices", "votes", "news", "service-events",
      "energy", "reports", "settings", "users", "roles", "portal", "admin", "system",
    ];

    const result = moduleOrder
      .filter(m => grouped[m])
      .map(m => grouped[m]);

    // Add any modules not in the predefined order
    for (const [module, data] of Object.entries(grouped)) {
      if (!moduleOrder.includes(module)) {
        result.push(data);
      }
    }

    const responseData = {
      permissions,
      grouped: result,
      moduleLabels,
      actionLabels,
    };

    // Cache permissions for 1 hour (they rarely change)
    cache.set(cacheKey, responseData, CACHE_TTL.LONG).catch((err) => {
      logger.warn({ err: err }, "[Permissions] Cache write error");
    });

    return NextResponse.json(responseData, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching permissions");
    return NextResponse.json(
      { error: "Fehler beim Laden der Berechtigungen" },
      { status: 500 }
    );
  }
}
