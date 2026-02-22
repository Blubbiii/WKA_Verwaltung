import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";

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
      return NextResponse.json(
        { error: "Benachrichtigung nicht gefunden" },
        { status: 404 }
      );
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
    console.error("[API] Error marking notification as read:", error);
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren der Benachrichtigung" },
      { status: 500 }
    );
  }
}
