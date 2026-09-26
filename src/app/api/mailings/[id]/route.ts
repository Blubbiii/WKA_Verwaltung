/**
 * Single Mailing API
 *
 * GET    /api/mailings/[id] — Get mailing detail with recipients
 * DELETE /api/mailings/[id] — Delete a draft mailing
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { mandantDb } from "@/lib/mandant/mandant-db";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;
  const db = mandantDb(check.tenantId!);
  const { id } = await context.params;

  try {
    const mailing = await db.mailing.findFirst({
      where: { id, tenantId: check.tenantId! },
      include: {
        template: { select: { name: true, category: true, subject: true } },
        fund: { select: { id: true, name: true } },
        recipients: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            sentAt: true,
            error: true,
          },
        },
      },
    });

    if (!mailing) {
      return apiError("NOT_FOUND", 404, { message: "Mailing nicht gefunden" });
    }

    return NextResponse.json({ mailing });
  } catch (error) {
    logger.error({ err: error }, "[Mailing] GET failed");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden" });
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;
  const db = mandantDb(check.tenantId!);
  const { id } = await context.params;

  try {
    const mailing = await db.mailing.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!mailing) {
      return apiError("NOT_FOUND", 404, { message: "Mailing nicht gefunden" });
    }

    if (mailing.status !== "DRAFT") {
      return apiError("BAD_REQUEST", 400, { message: "Nur Entwürfe können gelöscht werden" });
    }

    // Delete recipients first (cascade should handle this, but be explicit)
    await db.mailing.delete({ where: { id, tenantId: check.tenantId! } });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[Mailing] DELETE failed");
    return apiError("DELETE_FAILED", 500, { message: "Fehler beim Löschen" });
  }
}
