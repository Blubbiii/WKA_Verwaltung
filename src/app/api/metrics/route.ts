import { NextRequest, NextResponse } from "next/server";
import { registry } from "@/lib/metrics/prometheus";

/**
 * GET /api/metrics
 *
 * Prometheus text-format metrics endpoint.
 * Protected by METRICS_TOKEN env var (passed as ?token= query param or
 * Authorization: Bearer <token> header).
 *
 * If METRICS_TOKEN is not set, the endpoint is open (suitable for dev).
 */
export async function GET(req: NextRequest) {
  const expectedToken = process.env.METRICS_TOKEN;

  if (expectedToken) {
    // Check Bearer header
    const authHeader = req.headers.get("authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    // Also accept ?token= query param (used by Prometheus scrape config)
    const queryToken = req.nextUrl.searchParams.get("token");

    const providedToken = bearerToken ?? queryToken;
    if (providedToken !== expectedToken) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  const metrics = await registry.metrics();

  return new NextResponse(metrics, {
    status: 200,
    headers: {
      "Content-Type": registry.contentType,
      // Never cache metrics
      "Cache-Control": "no-store",
    },
  });
}
