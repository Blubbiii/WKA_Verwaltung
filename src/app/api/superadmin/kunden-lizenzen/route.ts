/**
 * GET /api/superadmin/kunden-lizenzen — every customer with tariff, usage
 * and licence state.
 *
 * Only counts and the state leave this route — no names of parks, companies
 * or persons. The platform operator sees what a customer books and uses,
 * not what they manage.
 */

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { ladeLizenz } from "@/lib/lizenz/lizenz-db";

export async function GET() {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;

    const kunden = await prisma.tenant.findMany({
      select: { id: true, name: true, slug: true, status: true },
      orderBy: { name: "asc" },
    });
    const data = [];
    for (const k of kunden) {
      const lizenz = await ladeLizenz(k.id);
      data.push({
        ...k,
        tarif: lizenz.tarif,
        abweichung: lizenz.abweichung,
        zeilen: lizenz.lage.zeilen,
        ueberschritten: lizenz.lage.ueberschritten,
        karenzBis: lizenz.lage.karenzBis?.toISOString() ?? null,
        gesperrt: lizenz.lage.gesperrt,
      });
    }
    return NextResponse.json({ data });
  } catch (error) {
    logger.error({ err: error }, "[Lizenz] Kundenübersicht fehlgeschlagen");
    return apiError("FETCH_FAILED", 500, { message: "Kundenlizenzen konnten nicht geladen werden" });
  }
}
