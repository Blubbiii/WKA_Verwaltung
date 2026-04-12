/**
 * Turbine QR Token API
 *
 * POST /api/turbines/[id]/qr-token — Generate/regenerate QR check-in token
 * DELETE /api/turbines/[id]/qr-token — Remove QR token (disable check-in)
 */

import crypto from "crypto";
import { apiError } from "@/lib/api-errors";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await context.params;

    // Verify turbine belongs to tenant
    const turbine = await prisma.turbine.findFirst({
      where: { id, park: { tenantId: check.tenantId! } },
      select: { id: true },
    });

    if (!turbine) {
      return apiError("NOT_FOUND", 404, { message: "Anlage nicht gefunden" });
    }

    const qrToken = crypto.randomBytes(24).toString("base64url");

    await prisma.turbine.update({
      where: { id },
      data: { qrToken },
    });

    return NextResponse.json({ qrToken });
  } catch (error) {
    logger.error({ err: error }, "[QR Token] Generate failed");
    return apiError("INTERNAL_ERROR", 500, { message: "Fehler beim Generieren des QR-Tokens" });
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const check = await requirePermission(PERMISSIONS.TURBINES_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await context.params;

    const turbine = await prisma.turbine.findFirst({
      where: { id, park: { tenantId: check.tenantId! } },
      select: { id: true },
    });

    if (!turbine) {
      return apiError("NOT_FOUND", 404, { message: "Anlage nicht gefunden" });
    }

    await prisma.turbine.update({
      where: { id },
      data: { qrToken: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[QR Token] Delete failed");
    return apiError("DELETE_FAILED", 500, { message: "Fehler beim Entfernen des QR-Tokens" });
  }
}
