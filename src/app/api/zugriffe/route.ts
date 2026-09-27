// mandantenübergreifend: ParkStakeholder hat keine eigene tenantId und nennt den Dienstleister-Mandanten; die Route filtert selbst auf parkTenantId = eigener Mandant.
/**
 * External access to the tenant's parks — the park owner's view.
 *
 * GET: active ParkStakeholder entries that open this tenant's parks to a
 * service provider (settings:read). Ending one: ./[id] (settings:update).
 */

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

export async function GET() {
  try {
    const check = await requirePermission("settings:read");
    if (!check.authorized) return check.error;

    const eintraege = await prisma.parkStakeholder.findMany({
      where: { parkTenantId: check.tenantId!, isActive: true },
      select: {
        id: true,
        parkId: true,
        role: true,
        validFrom: true,
        billingEnabled: true,
        stakeholderTenant: { select: { name: true } },
      },
      orderBy: { validFrom: "desc" },
    });

    const parks = await prisma.park.findMany({
      where: { id: { in: [...new Set(eintraege.map((e) => e.parkId))] }, tenantId: check.tenantId! },
      select: { id: true, name: true },
    });
    const parkName = new Map(parks.map((p) => [p.id, p.name]));

    return NextResponse.json({
      zugriffe: eintraege.map((e) => ({
        id: e.id,
        dienstleister: e.stakeholderTenant.name,
        park: parkName.get(e.parkId) ?? null,
        rolle: e.role,
        seit: e.validFrom,
        abrechnung: e.billingEnabled,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "[Zugriffe] GET error");
    return apiError("FETCH_FAILED", 500, { message: "Externe Zugriffe konnten nicht geladen werden" });
  }
}
