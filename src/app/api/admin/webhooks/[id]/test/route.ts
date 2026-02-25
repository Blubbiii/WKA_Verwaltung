/**
 * API Route: /api/admin/webhooks/[id]/test
 * POST: Send a test event to the webhook
 *
 * Authentication: Admin only
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { enqueueWebhookDelivery } from "@/lib/queue/queues/webhook.queue";
import { apiLogger as logger } from "@/lib/logger";
import type { WebhookEventPayload } from "@/lib/webhooks/dispatcher";

// =============================================================================
// POST /api/admin/webhooks/[id]/test - Send test event
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Verify webhook belongs to tenant
    const webhook = await prisma.webhook.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
      select: { id: true, url: true, secret: true, isActive: true },
    });

    if (!webhook) {
      return NextResponse.json(
        { error: "Webhook nicht gefunden" },
        { status: 404 }
      );
    }

    if (!webhook.isActive) {
      return NextResponse.json(
        { error: "Webhook ist deaktiviert. Bitte zuerst aktivieren." },
        { status: 400 }
      );
    }

    // Build test payload
    const payload: WebhookEventPayload = {
      event: "webhook.test",
      timestamp: new Date().toISOString(),
      tenantId: check.tenantId!,
      data: {
        message: "Dies ist ein Test-Webhook",
        triggeredBy: check.userId,
      },
    };

    // Enqueue delivery job
    await enqueueWebhookDelivery({
      webhookId: webhook.id,
      url: webhook.url,
      secret: webhook.secret,
      payload,
    });

    logger.info(
      { webhookId: id, tenantId: check.tenantId },
      "Webhook test event enqueued"
    );

    return NextResponse.json({
      success: true,
      message: "Test-Event wurde in die Warteschlange eingereiht",
    });
  } catch (error) {
    logger.error({ err: error }, "Error sending webhook test event");
    return NextResponse.json(
      { error: "Fehler beim Senden des Test-Events" },
      { status: 500 }
    );
  }
}
