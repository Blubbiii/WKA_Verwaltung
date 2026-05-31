import { NextRequest, NextResponse } from "next/server";
import { registry } from "@/lib/metrics/prometheus";

/**
 * GET /api/metrics
 *
 * Prometheus text-format metrics endpoint.
 * Protected by METRICS_TOKEN env var (passed as ?token= query param or
 * Authorization: Bearer <token> header).
 *
 * Security policy:
 * - Production: METRICS_TOKEN MUSS gesetzt sein, sonst 503 (fail-closed).
 *   Verhindert dass eine vergessene env-var den Endpoint öffentlich macht
 *   (Metrics enthalten tenant-IDs, Queue-Depths, Error-Counts → SSRF/Reco).
 * - Development: Endpoint offen wenn Token fehlt, für lokales Prometheus-Setup.
 */
export async function GET(req: NextRequest) {
  const expectedToken = process.env.METRICS_TOKEN;
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && !expectedToken) {
    return new NextResponse(
      "Metrics endpoint requires METRICS_TOKEN in production",
      { status: 503 },
    );
  }

  if (expectedToken) {
    const authHeader = req.headers.get("authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
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
      "Cache-Control": "no-store",
    },
  });
}
