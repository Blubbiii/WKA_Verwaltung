import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

/**
 * PATCH /api/notifications/[id]
 * Mark a single notification as read.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Ensure the notification belongs to the current user
    const notification = await prisma.notification.findFirst({
      where: {
        id,
        userId: check.userId!,
      },
    });

    if (!notification) {
      return apiError("NOT_FOUND", 404, { message: "Benachrichtigung nicht gefunden" });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
      select: {
        id: true,
        isRead: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    logger.error({ err: error }, "[API] Error marking notification as read");
    return apiError("UPDATE_FAILED", 500, { message: "Fehler beim Aktualisieren der Benachrichtigung" });
  }
}
