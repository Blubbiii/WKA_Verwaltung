/**
 * Public Technician Check-In API
 *
 * POST /api/techniker/[token]/check-in — Create a new technician session (public, no auth)
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
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
    const rateLimitResult = await rateLimit(`techniker-checkin:${ip}`, TECHNICIAN_RATE_LIMIT);
    if (!rateLimitResult.success) {
      return getRateLimitResponse(rateLimitResult, TECHNICIAN_RATE_LIMIT);
    }

    const { token } = await context.params;
    const body = await request.json();
    const parsed = checkInSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
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
      return apiError("NOT_FOUND", 404, { message: "Ungültiger QR-Code" });
    }

    if (turbine.status !== "ACTIVE") {
      return apiError("BAD_REQUEST", 400, { message: "Anlage ist nicht aktiv" });
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
      return apiError("CONFLICT", 409, { message: "Es gibt bereits einen aktiven Check-In für diese Anlage" });
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
    return apiError("INTERNAL_ERROR", 500, { message: "Ein Fehler ist aufgetreten" });
  }
}
