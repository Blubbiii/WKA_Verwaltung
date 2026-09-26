/**
 * PUT /api/superadmin/kunden-lizenzen/[tenantId] — book a tariff for a
 * customer and set a per-customer exception.
 *
 * The licence state is recalculated right away: a downgrade starts the
 * 30-day grace period at once, an upgrade ends it at once.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api-errors";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { ladeLizenz } from "@/lib/lizenz/lizenz-db";
import { kundenLizenzSchema } from "@/lib/lizenz/tarif-schema";
import { zodMeldung } from "@/lib/validation/zod-meldung";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;
    const { tenantId } = await params;

    const parsed = kundenLizenzSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: zodMeldung(parsed.error, "Ungültige Eingabe") });
    }
    const kunde = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!kunde) return apiError("NOT_FOUND", 404, { message: "Kunde nicht gefunden" });
    if (parsed.data.tarifId && !(await prisma.tarif.findUnique({ where: { id: parsed.data.tarifId } }))) {
      return apiError("NOT_FOUND", 404, { message: "Tarif nicht gefunden" });
    }

    // Keep only counters that are actually set; an empty exception is none.
    const abweichung = Object.fromEntries(
      Object.entries(parsed.data.abweichung ?? {}).filter(([, v]) => v !== undefined),
    );
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        tarifId: parsed.data.tarifId,
        lizenzAbweichung: Object.keys(abweichung).length > 0 ? abweichung : Prisma.DbNull,
      },
    });

    await createAuditLog({
      action: "UPDATE",
      entityType: "Tenant",
      entityId: tenantId,
      newValues: { tarifId: parsed.data.tarifId, lizenzAbweichung: abweichung },
      description: "Lizenz geändert",
    });

    const lizenz = await ladeLizenz(tenantId);
    return NextResponse.json({
      tarif: lizenz.tarif,
      zeilen: lizenz.lage.zeilen,
      ueberschritten: lizenz.lage.ueberschritten,
      karenzBis: lizenz.lage.karenzBis?.toISOString() ?? null,
      gesperrt: lizenz.lage.gesperrt,
    });
  } catch (error) {
    logger.error({ err: error }, "[Lizenz] Speichern fehlgeschlagen");
    return apiError("UPDATE_FAILED", 500, { message: "Lizenz konnte nicht gespeichert werden" });
  }
}
