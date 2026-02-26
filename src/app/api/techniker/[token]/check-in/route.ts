/**
 * Public Technician Check-In API
 *
 * POST /api/techniker/[token]/check-in — Create a new technician session (public, no auth)
 */

import { NextRequest, NextResponse } from "next/server";
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

const checkInSchema = z.object({
  technicianName: z.string().min(2, "Name ist erforderlich").max(100),
  companyName: z.string().min(2, "Firma ist erforderlich").max(200),
});

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const ip = getClientIp(request);
    const rateLimitResult = rateLimit(`techniker-checkin:${ip}`, TECHNICIAN_RATE_LIMIT);
    if (!rateLimitResult.success) {
      return getRateLimitResponse(rateLimitResult, TECHNICIAN_RATE_LIMIT);
    }

    const { token } = await context.params;
    const body = await request.json();
    const parsed = checkInSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const turbine = await prisma.turbine.findUnique({
      where: { qrToken: token },
      select: {
        id: true,
        designation: true,
        status: true,
        park: { select: { name: true, tenantId: true } },
      },
    });

    if (!turbine) {
      return NextResponse.json({ error: "Ungültiger QR-Code" }, { status: 404 });
    }

    if (turbine.status !== "ACTIVE") {
      return NextResponse.json({ error: "Anlage ist nicht aktiv" }, { status: 400 });
    }

    // Prevent double check-in: check for open session at this turbine from same IP
    const existingSession = await prisma.technicianSession.findFirst({
      where: {
        turbineId: turbine.id,
        checkOutAt: null,
        ipAddress: ip,
        checkInAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    if (existingSession) {
      return NextResponse.json(
        { error: "Es gibt bereits einen aktiven Check-In für diese Anlage", session: { id: existingSession.id, checkInAt: existingSession.checkInAt } },
        { status: 409 }
      );
    }

    const session = await prisma.technicianSession.create({
      data: {
        turbineId: turbine.id,
        technicianName: parsed.data.technicianName,
        companyName: parsed.data.companyName,
        ipAddress: ip,
        userAgent: request.headers.get("user-agent")?.substring(0, 500) ?? null,
      },
    });

    // Fire-and-forget webhook
    dispatchWebhook(turbine.park.tenantId, "technician.checked_in", {
      sessionId: session.id,
      technicianName: session.technicianName,
      companyName: session.companyName,
      turbineDesignation: turbine.designation,
      parkName: turbine.park.name,
    }).catch((err) => { logger.warn({ err }, "[Webhook] technician.checked_in dispatch failed"); });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, "[Techniker Check-In] Failed");
    return NextResponse.json(
      { error: "Ein Fehler ist aufgetreten" },
      { status: 500 }
    );
  }
}
