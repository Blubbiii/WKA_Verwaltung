/**
 * Public Technician Lookup API
 *
 * GET /api/techniker/[token] — Lookup turbine info by QR token (public, no auth)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import {
  rateLimit,
  getClientIp,
  getRateLimitResponse,
  TECHNICIAN_RATE_LIMIT,
} from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const ip = getClientIp(request);
    const rateLimitResult = rateLimit(`techniker:${ip}`, TECHNICIAN_RATE_LIMIT);
    if (!rateLimitResult.success) {
      return getRateLimitResponse(rateLimitResult, TECHNICIAN_RATE_LIMIT);
    }

    const { token } = await context.params;

    const turbine = await prisma.turbine.findUnique({
      where: { qrToken: token },
      select: {
        id: true,
        designation: true,
        manufacturer: true,
        model: true,
        park: { select: { name: true } },
      },
    });

    if (!turbine) {
      return NextResponse.json(
        { error: "Ungültiger QR-Code" },
        { status: 404 }
      );
    }

    // Check for any active session from this IP
    const activeSession = await prisma.technicianSession.findFirst({
      where: {
        turbineId: turbine.id,
        checkOutAt: null,
        checkInAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { checkInAt: "desc" },
      select: {
        id: true,
        technicianName: true,
        companyName: true,
        checkInAt: true,
      },
    });

    return NextResponse.json({ turbine, activeSession });
  } catch (error) {
    logger.error({ err: error }, "[Techniker Lookup] Failed");
    return NextResponse.json(
      { error: "Ein Fehler ist aufgetreten" },
      { status: 500 }
    );
  }
}
