// mandantenübergreifend: ParkStakeholder hat keine eigene tenantId; die Route beendet nur Einträge mit parkTenantId = eigener Mandant.
/**
 * The park owner ends a service provider's access to its parks.
 *
 * The entry is deactivated, not deleted: it documents who could see the
 * park's settlements until when, and the provider's billings refer to it.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { apiLogger as logger } from "@/lib/logger";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const check = await requirePermission("settings:update");
    if (!check.authorized) return check.error;

    const { id } = await params;
    const eintrag = await prisma.parkStakeholder.findFirst({
      where: { id, parkTenantId: check.tenantId!, isActive: true },
      select: { id: true, stakeholderTenantId: true, parkId: true, role: true },
    });
    if (!eintrag) {
      return apiError("NOT_FOUND", 404, { message: "Zugriff nicht gefunden" });
    }

    await prisma.parkStakeholder.update({
      where: { id },
      data: { isActive: false, validTo: new Date() },
    });

    await createAuditLog({
      action: "UPDATE",
      entityType: "ParkStakeholder",
      entityId: id,
      oldValues: { isActive: true },
      newValues: { isActive: false },
      description: "Externer Zugriff vom Park-Eigentümer beendet",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[Zugriffe] DELETE error");
    return apiError("DELETE_FAILED", 500, { message: "Zugriff konnte nicht beendet werden" });
  }
}
