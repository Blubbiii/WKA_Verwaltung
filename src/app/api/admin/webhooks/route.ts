/**
 * API Route: /api/admin/webhooks
 * GET: List all webhooks for the tenant (with delivery stats)
 * POST: Create a new webhook (auto-generate secret)
 *
 * Authentication: Admin only
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { z } from "zod";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";
import { apiLogger as logger } from "@/lib/logger";
import crypto from "crypto";

// =============================================================================
// Validation Schema
// =============================================================================

const validEventKeys = Object.keys(WEBHOOK_EVENTS) as [string, ...string[]];

// SSRF protection: reject private/internal IP ranges
function isPrivateUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();
    // Block localhost, private IPs, link-local, cloud metadata
    return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|fc|fd|fe80|::1|\[::1\])/.test(hostname)
      || hostname === "metadata.google.internal"
      || hostname.endsWith(".internal")
      || hostname.endsWith(".local");
  } catch {
    return true; // Reject unparseable URLs
  }
}

const createWebhookSchema = z.object({
  url: z.string().url("Ungueltige URL"),
  events: z
    .array(z.enum(validEventKeys))
    .min(1, "Mindestens ein Event muss ausgewaehlt werden"),
  description: z.string().max(500).optional(),
});

// =============================================================================
// GET /api/admin/webhooks - List all webhooks
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const webhooks = await prisma.webhook.findMany({
      where: { tenantId: check.tenantId! },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: {
          select: { deliveries: true },
        },
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            success: true,
            statusCode: true,
            createdAt: true,
          },
        },
      },
    });

    const result = webhooks.map((webhook) => ({
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      description: webhook.description,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt.toISOString(),
      updatedAt: webhook.updatedAt.toISOString(),
      createdBy: webhook.createdBy
        ? {
            id: webhook.createdBy.id,
            name: [webhook.createdBy.firstName, webhook.createdBy.lastName].filter(Boolean).join(" ") || null,
            email: webhook.createdBy.email,
          }
        : null,
      deliveryCount: webhook._count.deliveries,
      lastDelivery: webhook.deliveries[0]
        ? {
            success: webhook.deliveries[0].success,
            statusCode: webhook.deliveries[0].statusCode,
            createdAt: webhook.deliveries[0].createdAt.toISOString(),
          }
        : null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error }, "Error fetching webhooks");
    return NextResponse.json(
      { error: "Fehler beim Laden der Webhooks" },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/admin/webhooks - Create a new webhook
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = createWebhookSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { url, events, description } = parsed.data;

    // SSRF protection: reject private/internal URLs
    if (isPrivateUrl(url)) {
      return NextResponse.json(
        { error: "Private oder interne URLs sind nicht erlaubt" },
        { status: 400 }
      );
    }

    // Auto-generate webhook secret
    const secret = crypto.randomBytes(32).toString("hex");

    const webhook = await prisma.webhook.create({
      data: {
        url,
        secret,
        events,
        description: description || null,
        tenantId: check.tenantId!,
        createdById: check.userId!,
      },
    });

    logger.info(
      { webhookId: webhook.id, tenantId: check.tenantId, url },
      "Webhook created"
    );

    return NextResponse.json(
      {
        id: webhook.id,
        url: webhook.url,
        secret: webhook.secret, // Return secret only on creation
        events: webhook.events,
        description: webhook.description,
        isActive: webhook.isActive,
        createdAt: webhook.createdAt.toISOString(),
        updatedAt: webhook.updatedAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ err: error }, "Error creating webhook");
    return NextResponse.json(
      { error: "Fehler beim Erstellen des Webhooks" },
      { status: 500 }
    );
  }
}
