import { NextResponse } from "next/server";

/**
 * Public Version Info Endpoint
 *
 * Returns build metadata used by the client-side version poll to detect
 * when a new server version has been deployed and prompt the user to reload.
 *
 * No authentication required — only harmless metadata (commit sha, build time,
 * package version). No PII, no runtime diagnostics.
 *
 * Cached for 5 seconds via Cache-Control so a fleet of clients polling every
 * 5 minutes doesn't hammer the server; the dynamic export prevents Next.js
 * from statically caching the response at build time.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      commit:
        process.env.NEXT_PUBLIC_COMMIT_SHA ??
        process.env.COMMIT_SHA ??
        "unknown",
      buildTime:
        process.env.NEXT_PUBLIC_BUILD_TIME ??
        process.env.BUILD_TIME ??
        "unknown",
      version: process.env.npm_package_version ?? "0.0.0",
    },
    {
      headers: { "Cache-Control": "public, max-age=5, s-maxage=5" },
    },
  );
}
