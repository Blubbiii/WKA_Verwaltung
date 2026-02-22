import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";

/**
 * GET /api/notifications/unread-count
 * Quick count of unread notifications for the badge in the header.
 */
export async function GET() {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error!;

    const count = await prisma.notification.count({
      where: {
        userId: check.userId!,
        isRead: false,
      },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error("[API] Error fetching unread count:", error);
    return NextResponse.json(
      { error: "Fehler beim Laden der ungelesenen Anzahl" },
      { status: 500 }
    );
  }
}
