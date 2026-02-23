import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

/**
 * Health Check Endpoint
 *
 * Wird verwendet von:
 * - Docker HEALTHCHECK
 * - Traefik Load Balancer
 * - Monitoring Tools
 *
 * Prueft:
 * - App laeuft
 * - Datenbank-Verbindung
 */

export async function GET() {
  const isProduction = process.env.NODE_ENV === "production";

  const health: Record<string, unknown> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    checks: {
      database: "unknown" as "ok" | "error" | "unknown",
    },
  };

  // Only expose detailed info in non-production environments
  if (!isProduction) {
    health.uptime = process.uptime();
    health.version = process.env.npm_package_version || "unknown";
    health.environment = process.env.NODE_ENV || "unknown";
  }

  try {
    // Datenbank-Check (einfache Query)
    await prisma.$queryRaw`SELECT 1`;
    (health.checks as Record<string, string>).database = "ok";
  } catch (error) {
    (health.checks as Record<string, string>).database = "error";
    health.status = "degraded";

    // In Production nicht den vollen Error zurueckgeben
    logger.error({ err: error }, "[Health Check] Database connection failed");
  }

  // Status Code basierend auf Health
  const statusCode = health.status === "ok" ? 200 : 503;

  return NextResponse.json(health, { status: statusCode });
}

// HEAD Request fuer einfache Checks
export async function HEAD() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
