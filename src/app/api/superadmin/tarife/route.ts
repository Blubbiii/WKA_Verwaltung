/**
 * GET  /api/superadmin/tarife — all tariffs with the number of customers
 * POST /api/superadmin/tarife — create a tariff
 *
 * Tariffs belong to the platform, not to a customer: maintained by the
 * platform operator (marketing settings), shown on the landing page and
 * enforced by the licence check (lib/lizenz).
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requireSuperadmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { serializePrisma } from "@/lib/serialize";
import { tarifSchema } from "@/lib/lizenz/tarif-schema";
import { zodMeldung } from "@/lib/validation/zod-meldung";

export async function GET() {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;
    const tarife = await prisma.tarif.findMany({
      orderBy: [{ sortierung: "asc" }, { name: "asc" }],
      include: { _count: { select: { tenants: true } } },
    });
    return NextResponse.json({ data: serializePrisma(tarife) });
  } catch (error) {
    logger.error({ err: error }, "[Tarife] Laden fehlgeschlagen");
    return apiError("FETCH_FAILED", 500, { message: "Tarife konnten nicht geladen werden" });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) return check.error;
    const parsed = tarifSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: zodMeldung(parsed.error, "Ungültige Eingabe") });
    }
    if (await prisma.tarif.findUnique({ where: { key: parsed.data.key }, select: { id: true } })) {
      return apiError("ALREADY_EXISTS", 409, { message: `Es gibt schon einen Tarif mit dem Kürzel „${parsed.data.key}“` });
    }
    const tarif = await prisma.tarif.create({ data: parsed.data });
    return NextResponse.json({ data: serializePrisma(tarif) }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[Tarife] Anlegen fehlgeschlagen");
    return apiError("CREATE_FAILED", 500, { message: "Tarif konnte nicht angelegt werden" });
  }
}
