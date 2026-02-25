/**
 * API Route: /api/admin/webhooks/stats
 * GET: Aggregated webhook delivery stats for the dashboard widget
 *
 * Permission: admin:manage
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/admin/webhooks/stats - Delivery stats (last 24h)
// =============================================================================

export async function GET() {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    const tenantId = check.tenantId!;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find all webhooks belonging to this tenant
    const tenantWebhookIds = await prisma.webhook.findMany({
      where: { tenantId },
      select: { id: true },
    });

    const webhookIds = tenantWebhookIds.map((w) => w.id);

    if (webhookIds.length === 0) {
      return NextResponse.json({
        totalDeliveries24h: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        recentDeliveries: [],
      });
    }

    // Run counts and recent deliveries in parallel
    const [successCount, failureCount, recentDeliveries] = await Promise.all([
      prisma.webhookDelivery.count({
        where: {
          webhookId: { in: webhookIds },
          createdAt: { gte: since },
          success: true,
        },
      }),
      prisma.webhookDelivery.count({
        where: {
          webhookId: { in: webhookIds },
          createdAt: { gte: since },
          success: false,
        },
      }),
      prisma.webhookDelivery.findMany({
        where: {
          webhookId: { in: webhookIds },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          event: true,
          success: true,
          statusCode: true,
          duration: true,
          createdAt: true,
          webhook: {
            select: { url: true },
          },
        },
      }),
    ]);

    const totalDeliveries24h = successCount + failureCount;
    const successRate =
      totalDeliveries24h > 0
        ? Math.round((successCount / totalDeliveries24h) * 100)
        : 0;

    return NextResponse.json({
      totalDeliveries24h,
      successCount,
      failureCount,
      successRate,
      recentDeliveries: recentDeliveries.map((d) => ({
        id: d.id,
        event: d.event,
        url: d.webhook.url,
        success: d.success,
        statusCode: d.statusCode,
        duration: d.duration,
        createdAt: d.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching webhook stats");
    return NextResponse.json(
      { error: "Fehler beim Laden der Webhook-Statistiken" },
      { status: 500 }
    );
  }
}
