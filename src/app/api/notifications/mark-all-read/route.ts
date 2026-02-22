import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";

/**
 * POST /api/notifications/mark-all-read
 * Mark all unread notifications for the current user as read.
 */
export async function POST() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error!;

    const result = await prisma.notification.updateMany({
      where: {
        userId: check.userId!,
        isRead: false,
      },
      data: { isRead: true },
    });

    return NextResponse.json({
      success: true,
      count: result.count,
    });
  } catch (error) {
    console.error("[API] Error marking all notifications as read:", error);
    return NextResponse.json(
      { error: "Fehler beim Markieren aller Benachrichtigungen" },
      { status: 500 }
    );
  }
}
