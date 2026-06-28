/**
 * Idee D — Entity-Presence-API.
 *
 *  - POST   /api/presence            heartbeat (upsert lastSeenAt=now)
 *  - GET    /api/presence?…          liefert OTHER User die in den letzten 2 min aktiv waren
 *  - DELETE /api/presence?…          explicit-leave (Unmount aus Detail-Page)
 *
 * Alle Routes: requireAuth, Tenant-Scope. Body/Query verlangt {entityType, entityId}.
 * Stale-Cleanup happens lazy (kein Cron) — bei jedem GET filtern wir > 2min weg.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiError } from "@/lib/api-errors";
import { apiLogger as logger } from "@/lib/logger";

const STALE_AFTER_MS = 2 * 60 * 1000;

const inputSchema = z.object({
  entityType: z.string().min(1).max(64),
  entityId: z.string().min(1).max(64),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return apiError("BAD_REQUEST", 400, { message: "Kein aktiver Mandant" });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        details: parsed.error.flatten(),
      });
    }
    const { entityType, entityId } = parsed.data;

    await prisma.entityPresence.upsert({
      where: {
        userId_entityType_entityId: {
          userId: check.userId!,
          entityType,
          entityId,
        },
      },
      create: {
        tenantId: check.tenantId,
        userId: check.userId!,
        entityType,
        entityId,
      },
      update: { lastSeenAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "[presence] heartbeat failed");
    return apiError("INTERNAL_ERROR", 500, { message: "Fehler beim Heartbeat" });
  }
}

export async function GET(request: NextRequest) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return NextResponse.json({ others: [] });
    }

    const { searchParams } = new URL(request.url);
    const parsed = inputSchema.safeParse({
      entityType: searchParams.get("entityType"),
      entityId: searchParams.get("entityId"),
    });
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        details: parsed.error.flatten(),
      });
    }
    const { entityType, entityId } = parsed.data;

    const cutoff = new Date(Date.now() - STALE_AFTER_MS);
    const presence = await prisma.entityPresence.findMany({
      where: {
        tenantId: check.tenantId,
        entityType,
        entityId,
        lastSeenAt: { gt: cutoff },
        userId: { not: check.userId! },
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { lastSeenAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      others: presence.map((p) => ({
        userId: p.user.id,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        email: p.user.email,
        lastSeenAt: p.lastSeenAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "[presence] GET failed");
    return NextResponse.json({ others: [] });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const check = await requireAuth();
    if (!check.authorized) return check.error;
    if (!check.tenantId) {
      return NextResponse.json({ ok: true });
    }

    const { searchParams } = new URL(request.url);
    const parsed = inputSchema.safeParse({
      entityType: searchParams.get("entityType"),
      entityId: searchParams.get("entityId"),
    });
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        details: parsed.error.flatten(),
      });
    }
    const { entityType, entityId } = parsed.data;

    await prisma.entityPresence
      .delete({
        where: {
          userId_entityType_entityId: {
            userId: check.userId!,
            entityType,
            entityId,
          },
        },
      })
      .catch(() => {
        // Record nicht da (kein heartbeat-cycle) — ok
      });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "[presence] DELETE failed");
    return NextResponse.json({ ok: true });
  }
}
