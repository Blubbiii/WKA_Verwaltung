/**
 * Admin-API für FundAccess (ABAC).
 *
 * GET  /api/admin/users/[id]/fund-access
 *   → Liefert Liste der erlaubten Funds + alle verfügbaren Funds.
 *
 * PUT  /api/admin/users/[id]/fund-access
 *   Body: { fundIds: string[] }
 *   → Ersetzt die FundAccess-Liste des Users.
 *
 * Wenn fundIds leer ist, hat der User KEINE Restriction → er sieht ALLE
 * Funds (Default-Verhalten).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const putSchema = z.object({
  fundIds: z.array(z.string().uuid()),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("users:update");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant fehlt" });
    }

    const { id: userId } = await params;

    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId: check.tenantId },
      select: { id: true, email: true },
    });
    if (!user) {
      return apiError("NOT_FOUND", 404, { message: "User nicht gefunden" });
    }

    const [access, allFunds] = await Promise.all([
      prisma.fundAccess.findMany({
        where: { userId },
        include: { fund: { select: { id: true, name: true } } },
      }),
      prisma.fund.findMany({
        where: { tenantId: check.tenantId, deletedAt: null },
        select: { id: true, name: true, status: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({
      user: { id: user.id, email: user.email },
      allowedFunds: access.map((a) => a.fund),
      allFunds,
      restricted: access.length > 0,
    });
  } catch (error) {
    logger.error({ err: error }, "FundAccess GET fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Laden fehlgeschlagen" });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await requirePermission("users:update");
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("NOT_FOUND", 400, { message: "Mandant fehlt" });
    }

    const { id: userId } = await params;
    const body = await request.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("BAD_REQUEST", 400, {
        message: parsed.error.issues[0]?.message || "Ungültige Eingabe",
      });
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId: check.tenantId },
      select: { id: true },
    });
    if (!user) {
      return apiError("NOT_FOUND", 404, { message: "User nicht gefunden" });
    }

    // Funds müssen zum gleichen Tenant gehören
    if (parsed.data.fundIds.length > 0) {
      const validFunds = await prisma.fund.count({
        where: {
          id: { in: parsed.data.fundIds },
          tenantId: check.tenantId,
          deletedAt: null,
        },
      });
      if (validFunds !== parsed.data.fundIds.length) {
        return apiError("BAD_REQUEST", 400, {
          message: "Eine oder mehrere Fund-IDs ungültig oder nicht im Mandanten",
        });
      }
    }

    // Replace: alle löschen + neue erstellen, in Transaktion
    await prisma.$transaction([
      prisma.fundAccess.deleteMany({ where: { userId } }),
      ...(parsed.data.fundIds.length > 0
        ? [
            prisma.fundAccess.createMany({
              data: parsed.data.fundIds.map((fundId) => ({ userId, fundId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    logger.info(
      {
        adminId: check.userId,
        userId,
        fundCount: parsed.data.fundIds.length,
      },
      "FundAccess aktualisiert",
    );

    return NextResponse.json({
      success: true,
      restricted: parsed.data.fundIds.length > 0,
      fundCount: parsed.data.fundIds.length,
    });
  } catch (error) {
    logger.error({ err: error }, "FundAccess PUT fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "Speichern fehlgeschlagen" });
  }
}
