/**
 * DELETE /api/municipality-benefits/[id] — Vereinbarung entfernen
 *
 * Bewusst ein echtes Löschen und kein Befristen: eine irrtümlich angelegte
 * Vereinbarung soll verschwinden. Eine ausgelaufene wird dagegen über
 * `validUntil` beendet — dann bleibt sie als Beleg für die Zahlungen der
 * Vorjahre erhalten, und die Auswertung eines zurückliegenden Jahres stimmt
 * weiterhin.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";
import { createAuditLog } from "@/lib/audit";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_UPDATE);
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant nicht gefunden" });
    }

    const { id } = await params;
    const existing = await prisma.municipalityBenefit.findFirst({
      where: { id, tenantId: check.tenantId },
      include: {
        municipality: { select: { name: true } },
        turbine: { select: { designation: true } },
      },
    });
    if (!existing) {
      return apiError("NOT_FOUND", 404, { message: "Vereinbarung nicht gefunden" });
    }

    await prisma.municipalityBenefit.delete({ where: { id } });

    await createAuditLog({
      action: "DELETE",
      entityType: "Municipality",
      entityId: id,
      oldValues: {
        turbine: existing.turbine.designation,
        municipality: existing.municipality.name,
        areaShare: Number(existing.areaShare),
        rateCtPerKwh: Number(existing.rateCtPerKwh),
      },
      description: `§ 6 EEG entfernt: ${existing.turbine.designation} → ${existing.municipality.name}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Vereinbarung konnte nicht entfernt werden");
    return apiError("PROCESS_FAILED", 500, {
      message: "Vereinbarung konnte nicht entfernt werden",
    });
  }
}
