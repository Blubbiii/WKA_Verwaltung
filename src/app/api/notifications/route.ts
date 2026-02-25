import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

/**
 * GET /api/notifications
 * List notifications for the current user, paginated, newest first.
 *
 * Query params:
 *   - page (default: 1)
 *   - limit (default: 20, max: 50)
 *   - unreadOnly (default: false)
 */
export async function GET(request: NextRequest) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const skip = (page - 1) * limit;

    const where = {
      userId: check.userId!,
      ...(unreadOnly ? { isRead: false } : {}),
    };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          link: true,
          isRead: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({ where }),
    ]);

    return NextResponse.json({
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[API] Error fetching notifications");
    return NextResponse.json(
      { error: "Fehler beim Laden der Benachrichtigungen" },
      { status: 500 }
    );
  }
}
