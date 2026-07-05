import { NextResponse } from "next/server";

/**
 * Liveness Probe (/api/health/live)
 *
 * Answers "is the Node process up and serving HTTP?" — nothing more.
 * Does NOT check DB, Redis, or any external dependency.
 *
 * Used by Docker HEALTHCHECK so the container is marked healthy as soon
 * as the HTTP server can respond. This avoids 503-storms during container
 * startup where DB / Redis are still connecting.
 *
 * For dependency readiness use /api/health/ready.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "live" });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
