/**
 * Single Mailing API
 *
 * GET    /api/mailings/[id] — Get mailing detail with recipients
 * DELETE /api/mailings/[id] — Delete a draft mailing
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;
  const { id } = await context.params;

  try {
    const mailing = await prisma.mailing.findFirst({
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
      return NextResponse.json({ error: "Mailing nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json({ mailing });
  } catch (error) {
    logger.error({ err: error }, "[Mailing] GET failed");
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const check = await requireAuth();
  if (!check.authorized) return check.error!;
  const { id } = await context.params;

  try {
    const mailing = await prisma.mailing.findFirst({
      where: { id, tenantId: check.tenantId! },
    });

    if (!mailing) {
      return NextResponse.json({ error: "Mailing nicht gefunden" }, { status: 404 });
    }

    if (mailing.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Nur Entwürfe können gelöscht werden" },
        { status: 400 }
      );
    }

    // Delete recipients first (cascade should handle this, but be explicit)
    await prisma.mailing.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "[Mailing] DELETE failed");
    return NextResponse.json({ error: "Fehler beim Löschen" }, { status: 500 });
  }
}
