/**
 * API Route: /api/fund-categories (Public endpoint for non-admin users)
 * GET: Liste aktiver Gesellschaftstypen (fuer Dropdowns)
 *
 * Multi-Tenancy: Filtert automatisch nach tenantId aus der Session
 * Berechtigung: FUNDS_READ
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiLogger as logger } from "@/lib/logger";

// ============================================================================
// GET /api/fund-categories
// ============================================================================

/**
 * Listet alle aktiven Gesellschaftstypen fuer den aktuellen Tenant
 *
 * Dieser Endpoint ist fuer nicht-Admin-Benutzer zugaenglich (mit FUNDS_READ Permission)
 * und wird z.B. in Dropdowns verwendet.
 *
 * Returns: Nur id, name, code, color, sortOrder (keine _count oder sensitive Daten)
 * Sortierung: Nach sortOrder ASC, dann name ASC
 */
export async function GET(request: NextRequest) {
  try {
    // Auth-Check: Benutzer mit FUNDS_READ Permission duerfen zugreifen
    const check = await requirePermission(PERMISSIONS.FUNDS_READ);
    if (!check.authorized) return check.error;

    // Nur aktive Gesellschaftstypen abrufen
    const fundCategories = await prisma.fundCategory.findMany({
      where: {
        tenantId: check.tenantId!,
        isActive: true,
      },
      orderBy: [
        { sortOrder: "asc" },
        { name: "asc" },
      ],
      select: {
        id: true,
        name: true,
        code: true,
        color: true,
        sortOrder: true,
      },
    });

    return NextResponse.json({
      data: fundCategories,
      total: fundCategories.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching fund categories");
    return NextResponse.json(
      { error: "Fehler beim Laden der Gesellschaftstypen" },
      { status: 500 }
    );
  }
}
