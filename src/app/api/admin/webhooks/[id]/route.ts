/**
 * API Route: /api/admin/webhooks/[id]
 * GET: Single webhook with last 10 deliveries
 * PUT: Update webhook (url, events, description, isActive)
 * DELETE: Delete webhook (cascades to deliveries via Prisma)
 *
 * Authentication: Admin only
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { z } from "zod";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// Validation Schema
// =============================================================================

const validEventKeys = Object.keys(WEBHOOK_EVENTS) as [string, ...string[]];

const updateWebhookSchema = z.object({
  url: z.string().url("Ungueltige URL").optional(),
  events: z
    .array(z.enum(validEventKeys))
    .min(1, "Mindestens ein Event muss ausgewaehlt werden")
    .optional(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

// =============================================================================
// GET /api/admin/webhooks/[id] - Get single webhook with deliveries
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await params;

    const webhook = await prisma.webhook.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            event: true,
            statusCode: true,
            success: true,
            duration: true,
            attempts: true,
            error: true,
            createdAt: true,
          },
        },
        _count: {
          select: { deliveries: true },
        },
      },
    });

    if (!webhook) {
      return NextResponse.json(
        { error: "Webhook nicht gefunden" },
        { status: 404 }
      );
    }

    return NextResponse.json({
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
      recentDeliveries: webhook.deliveries.map((d) => ({
        id: d.id,
        event: d.event,
        statusCode: d.statusCode,
        success: d.success,
        duration: d.duration,
        attempts: d.attempts,
        error: d.error,
        createdAt: d.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching webhook");
    return NextResponse.json(
      { error: "Fehler beim Laden des Webhooks" },
      { status: 500 }
    );
  }
}

// =============================================================================
// PUT /api/admin/webhooks/[id] - Update webhook
// =============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateWebhookSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: parsed.error.format() },
        { status: 400 }
      );
    }

    // Verify webhook belongs to tenant
    const existing = await prisma.webhook.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Webhook nicht gefunden" },
        { status: 404 }
      );
    }

    const { url, events, description, isActive } = parsed.data;

    const updated = await prisma.webhook.update({
      where: { id },
      data: {
        ...(url !== undefined && { url }),
        ...(events !== undefined && { events }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    logger.info(
      { webhookId: id, tenantId: check.tenantId },
      "Webhook updated"
    );

    return NextResponse.json({
      id: updated.id,
      url: updated.url,
      events: updated.events,
      description: updated.description,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating webhook");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Webhooks" },
      { status: 500 }
    );
  }
}

// =============================================================================
// DELETE /api/admin/webhooks/[id] - Delete webhook (cascades deliveries)
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Verify webhook belongs to tenant
    const existing = await prisma.webhook.findUnique({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Webhook nicht gefunden" },
        { status: 404 }
      );
    }

    // Hard delete - WebhookDelivery cascades via onDelete: Cascade
    await prisma.webhook.delete({
      where: { id },
    });

    logger.info(
      { webhookId: id, tenantId: check.tenantId },
      "Webhook deleted"
    );

    return NextResponse.json({
      success: true,
      message: "Webhook wurde geloescht",
    });
  } catch (error) {
    logger.error({ err: error }, "Error deleting webhook");
    return NextResponse.json(
      { error: "Fehler beim Loeschen des Webhooks" },
      { status: 500 }
    );
  }
}
