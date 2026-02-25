/**
 * Webhook Dispatcher
 *
 * Finds active webhooks subscribed to an event and enqueues
 * delivery jobs via BullMQ. Non-blocking — errors are logged
 * but never break the caller.
 */

import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

export interface WebhookEventPayload {
  event: string;
  timestamp: string;
  tenantId: string;
  data: Record<string, unknown>;
}

/**
 * Dispatch a webhook event to all matching subscribers.
 *
 * This is fire-and-forget: it enqueues BullMQ jobs for
 * each matching webhook and returns immediately.
 */
export async function dispatchWebhook(
  tenantId: string,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    // Find all active webhooks for this tenant that subscribe to this event
    const webhooks = await prisma.webhook.findMany({
      where: {
        tenantId,
        isActive: true,
        events: { has: event },
      },
      select: { id: true, url: true, secret: true },
    });

    if (webhooks.length === 0) return;

    const payload: WebhookEventPayload = {
      event,
      timestamp: new Date().toISOString(),
      tenantId,
      data,
    };

    // Lazy import to avoid circular dependency
    const { enqueueWebhookDelivery } = await import(
      "@/lib/queue/queues/webhook.queue"
    );

    for (const webhook of webhooks) {
      await enqueueWebhookDelivery({
        webhookId: webhook.id,
        url: webhook.url,
        secret: webhook.secret,
        payload,
      });
    }

    logger.info(
      { event, tenantId, webhookCount: webhooks.length },
      "[Webhook] Dispatched"
    );
  } catch (error) {
    // Non-blocking: webhook dispatch should never break the caller
    logger.error({ err: error, event, tenantId }, "[Webhook] Dispatch error");
  }
}
