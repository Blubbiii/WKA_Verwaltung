/**
 * API Route: /api/admin/webhooks/[id]/deliveries
 * GET: Paginated delivery log for a webhook
 *
 * Authentication: Admin only
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// GET /api/admin/webhooks/[id]/deliveries - Paginated delivery log
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
    const skip = (page - 1) * limit;

    // Verify webhook belongs to tenant
    const webhook = await prisma.webhook.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
      select: { id: true },
    });

    if (!webhook) {
      return NextResponse.json(
        { error: "Webhook nicht gefunden" },
        { status: 404 }
      );
    }

    // Fetch deliveries and total count in parallel
    const [deliveries, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where: { webhookId: id },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          event: true,
          payload: true,
          statusCode: true,
          responseBody: true,
          duration: true,
          attempts: true,
          lastAttemptAt: true,
          success: true,
          error: true,
          createdAt: true,
        },
      }),
      prisma.webhookDelivery.count({
        where: { webhookId: id },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      deliveries: deliveries.map((d) => ({
        id: d.id,
        event: d.event,
        payload: d.payload,
        statusCode: d.statusCode,
        responseBody: d.responseBody,
        duration: d.duration,
        attempts: d.attempts,
        lastAttemptAt: d.lastAttemptAt.toISOString(),
        success: d.success,
        error: d.error,
        createdAt: d.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching webhook deliveries");
    return NextResponse.json(
      { error: "Fehler beim Laden der Webhook-Zustellungen" },
      { status: 500 }
    );
  }
}
