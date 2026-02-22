/**
 * Available Parks API
 *
 * GET - List parks for dropdown selection.
 * tenantId is optional: if omitted, superadmins see ALL parks, non-superadmins see own tenant.
 * Response includes tenantId + tenantName per park for UI grouping.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("management-billing:read");
    if (!check.authorized) return check.error;

    const enabled = await getConfigBoolean("management-billing.enabled", check.tenantId, false);
    if (!enabled) {
      return NextResponse.json({ error: "Feature nicht aktiviert" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");

    // Determine effective tenant filter
    let effectiveTenantId: string | undefined;

    if (tenantId) {
      // Explicit tenant requested — check cross-tenant access for non-superadmins
      if (check.tenantId && check.tenantId !== tenantId) {
        const hasAccess = await prisma.parkStakeholder.findFirst({
          where: {
            stakeholderTenantId: check.tenantId,
            parkTenantId: tenantId,
            isActive: true,
          },
        });
        if (!hasAccess) {
          return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
        }
      }
      effectiveTenantId = tenantId;
    } else if (check.tenantId) {
      // No tenantId provided, non-superadmin → default to own tenant
      effectiveTenantId = check.tenantId;
    }
    // else: superadmin without tenantId → no filter (all parks)

    const parks = await prisma.park.findMany({
      where: effectiveTenantId ? { tenantId: effectiveTenantId } : undefined,
      select: {
        id: true,
        name: true,
        shortName: true,
        totalCapacityKw: true,
        tenantId: true,
        tenant: {
          select: { name: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const mapped = parks.map((p) => ({
      id: p.id,
      name: p.name,
      shortName: p.shortName,
      totalCapacityKw: p.totalCapacityKw,
      tenantId: p.tenantId,
      tenantName: p.tenant.name,
    }));

    return NextResponse.json({ parks: mapped });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] GET available-parks error");
    return NextResponse.json(
      { error: "Fehler beim Laden der Parks" },
      { status: 500 }
    );
  }
}
