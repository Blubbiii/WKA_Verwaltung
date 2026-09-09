import { NextResponse } from "next/server";
import { mitFrist } from "@/lib/util/frist";
import { prisma } from "@/lib/prisma";
import { isRedisHealthy } from "@/lib/queue/connection";

/**
 * Public Health Check Endpoint
 *
 * Returns minimal status info ONLY — no version, no env, no diagnostics
 * (Reconnaissance hardening). Detailed system status is available at
 * /api/admin/system/status (admin-only via requireAdmin).
 *
 * Used by: Docker HEALTHCHECK, Traefik, Uptime monitoring
 */

export async function GET() {
  // DB quick-check (2s timeout)
  const dbOk = await mitFrist(
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    2000,
  );

  // Redis quick-check (1s timeout)
  const redisOk = await mitFrist(
    isRedisHealthy().catch(() => false),
    1000,
  );

  const allOk = dbOk === true && redisOk === true;

  return NextResponse.json(
    { status: allOk ? "ok" : "degraded" },
    { status: allOk ? 200 : 503 },
  );
}

// HEAD for Docker HEALTHCHECK (no body)
export async function HEAD() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
