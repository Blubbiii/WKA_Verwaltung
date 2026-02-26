/**
 * Public Technician Check-Out API
 *
 * POST /api/techniker/[token]/check-out — Complete a technician session (public, no auth)
 *
 * Auto-creates a ServiceEvent with type TECHNICIAN_VISIT.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";
import { dispatchWebhook } from "@/lib/webhooks";
import {
  rateLimit,
  getClientIp,
  getRateLimitResponse,
  TECHNICIAN_RATE_LIMIT,
} from "@/lib/rate-limit";

const checkOutSchema = z.object({
  sessionId: z.string().uuid("Ungültige Session-ID"),
  workDescription: z.string().min(5, "Bitte beschreiben Sie die durchgeführten Arbeiten").max(2000),
});

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const ip = getClientIp(request);
    const rateLimitResult = rateLimit(`techniker-checkout:${ip}`, TECHNICIAN_RATE_LIMIT);
    if (!rateLimitResult.success) {
      return getRateLimitResponse(rateLimitResult, TECHNICIAN_RATE_LIMIT);
    }

    const { token } = await context.params;
    const body = await request.json();
    const parsed = checkOutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Verify turbine by token
    const turbine = await prisma.turbine.findUnique({
      where: { qrToken: token },
      select: {
        id: true,
        designation: true,
        park: { select: { name: true, tenantId: true } },
      },
    });

    if (!turbine) {
      return NextResponse.json({ error: "Ungültiger QR-Code" }, { status: 404 });
    }

    // Find the session and verify it belongs to this turbine
    const session = await prisma.technicianSession.findFirst({
      where: {
        id: parsed.data.sessionId,
        turbineId: turbine.id,
        checkOutAt: null,
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session nicht gefunden oder bereits abgeschlossen" },
        { status: 404 }
      );
    }

    const now = new Date();
    const durationMinutes = Math.round((now.getTime() - session.checkInAt.getTime()) / 60000);

    // Transaction: close session + create ServiceEvent
    const result = await prisma.$transaction(async (tx) => {
      // Create ServiceEvent
      const serviceEvent = await tx.serviceEvent.create({
        data: {
          turbineId: turbine.id,
          eventDate: session.checkInAt,
          eventType: "TECHNICIAN_VISIT",
          description: parsed.data.workDescription,
          durationHours: new Prisma.Decimal(durationMinutes / 60),
          performedBy: `${session.technicianName} (${session.companyName})`,
          notes: `Automatisch erstellt aus Techniker-Check-In. Dauer: ${durationMinutes} Min.`,
        },
      });

      // Update session
      const updatedSession = await tx.technicianSession.update({
        where: { id: session.id },
        data: {
          checkOutAt: now,
          workDescription: parsed.data.workDescription,
          durationMinutes,
          serviceEventId: serviceEvent.id,
        },
      });

      return { session: updatedSession, serviceEvent };
    });

    // Fire-and-forget webhooks
    const tenantId = turbine.park.tenantId;
    dispatchWebhook(tenantId, "technician.checked_out", {
      sessionId: result.session.id,
      technicianName: session.technicianName,
      companyName: session.companyName,
      turbineDesignation: turbine.designation,
      parkName: turbine.park.name,
      durationMinutes,
      workDescription: parsed.data.workDescription,
    }).catch((err) => { logger.warn({ err }, "[Webhook] technician.checked_out dispatch failed"); });

    dispatchWebhook(tenantId, "service_event.created", {
      id: result.serviceEvent.id,
      type: "TECHNICIAN_VISIT",
      description: parsed.data.workDescription,
    }).catch((err) => { logger.warn({ err }, "[Webhook] service_event.created dispatch failed"); });

    return NextResponse.json({
      session: result.session,
      serviceEvent: { id: result.serviceEvent.id },
      durationMinutes,
    });
  } catch (error) {
    logger.error({ err: error }, "[Techniker Check-Out] Failed");
    return NextResponse.json(
      { error: "Ein Fehler ist aufgetreten" },
      { status: 500 }
    );
  }
}
