/**
 * PUT    /api/superadmin/tarife/[id] — change a tariff
 * DELETE /api/superadmin/tarife/[id] — delete an unused tariff
 *
 * A tariff that customers have booked is not deleted — their licence would
 * silently become unlimited. It can be hidden from the landing page instead.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { tarifSchema } from "@/lib/lizenz/tarif-schema";
import { zodMeldung } from "@/lib/validation/zod-meldung";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;
    const { id } = await params;
    const parsed = tarifSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: zodMeldung(parsed.error, "Ungültige Eingabe") });
    }
    const gleicherKey = await prisma.tarif.findUnique({ where: { key: parsed.data.key }, select: { id: true } });
    if (gleicherKey && gleicherKey.id !== id) {
      return apiError("ALREADY_EXISTS", 409, { message: `Es gibt schon einen Tarif mit dem Kürzel „${parsed.data.key}“` });
    }
    const vorhanden = await prisma.tarif.findUnique({ where: { id }, select: { id: true } });
    if (!vorhanden) return apiError("NOT_FOUND", 404, { message: "Tarif nicht gefunden" });
    const tarif = await prisma.tarif.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ data: serializePrisma(tarif) });
  } catch (error) {
    logger.error({ err: error }, "[Tarife] Ändern fehlgeschlagen");
    return apiError("UPDATE_FAILED", 500, { message: "Tarif konnte nicht gespeichert werden" });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;
    const { id } = await params;
    const tarif = await prisma.tarif.findUnique({
      where: { id },
      select: { id: true, name: true, _count: { select: { tenants: true } } },
    });
    if (!tarif) return apiError("NOT_FOUND", 404, { message: "Tarif nicht gefunden" });
    if (tarif._count.tenants > 0) {
      return apiError("CONFLICT", 409, {
        message: `Tarif „${tarif.name}“ ist ${tarif._count.tenants}× gebucht. Stattdessen auf der Startseite ausblenden oder die Kunden umstellen.`,
      });
    }
    await prisma.tarif.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[Tarife] Löschen fehlgeschlagen");
    return apiError("DELETE_FAILED", 500, { message: "Tarif konnte nicht gelöscht werden" });
  }
}
