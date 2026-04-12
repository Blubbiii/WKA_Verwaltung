import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { parsePaginationParams } from "@/lib/api-utils";

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
    const { page, limit, skip } = parsePaginationParams(searchParams, { maxLimit: 50 });
    const unreadOnly = searchParams.get("unreadOnly") === "true";

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
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "[API] Error fetching notifications");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Benachrichtigungen" });
  }
}
