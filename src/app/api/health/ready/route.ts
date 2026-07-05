import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRedisHealthy } from "@/lib/queue/connection";

/**
 * Readiness Probe (/api/health/ready)
 *
 * Checks all external dependencies (DB + Redis) that must be reachable
 * before the app can serve real traffic. Returns 503 while any of them
 * is still unreachable — safe to gate load-balancer routing on this.
 *
 * For a bare "process is up" check use /api/health/live.
 * The legacy /api/health remains as an alias for backwards compatibility
 * with existing monitoring integrations.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function GET() {
  const dbOk = await withTimeout(
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    2000,
  );

  const redisOk = await withTimeout(
    isRedisHealthy().catch(() => false),
    1000,
  );

  const allOk = dbOk === true && redisOk === true;

  return NextResponse.json(
    { status: allOk ? "ready" : "degraded" },
    { status: allOk ? 200 : 503 },
  );
}

export async function HEAD() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
