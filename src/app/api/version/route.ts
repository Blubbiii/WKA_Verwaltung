import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";

/**
 * Public Version Info Endpoint
 *
 * Returns build metadata used by the client-side version poll to detect
 * when a new server version has been deployed and prompt the user to reload.
 *
 * `displayVersion` is the source of truth for what the UI shows in footer /
 * login screens: it is maintained via /admin/version (SystemConfig row
 * "app.displayVersion"). If not set, the package.json version is returned.
 *
 * No authentication required — only harmless metadata. No PII, no runtime
 * diagnostics.
 *
 * Cached for 60 seconds (Cache-Control) so a fleet of clients polling every
 * 5 minutes doesn't hammer the DB. Admins updating the displayVersion will
 * see the change propagate within a minute.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readDisplayVersion(): Promise<string | null> {
  try {
    const row = await prisma.systemConfig.findFirst({
      where: { key: "app.displayVersion", tenantId: null },
      select: { value: true },
    });
    return row?.value ?? null;
  } catch (err) {
    // DB may be unreachable at cold-start or during maintenance — fall back
    // gracefully rather than 500-ing this public endpoint.
    logger.warn({ err }, "Public /api/version: displayVersion DB read failed");
    return null;
  }
}

export async function GET() {
  const packageVersion =
    process.env.npm_package_version ??
    process.env.NEXT_PUBLIC_APP_VERSION ??
    "0.0.0";
  const displayVersion = (await readDisplayVersion()) ?? packageVersion;

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
      /** Underlying build version from package.json. */
      version: packageVersion,
      /**
       * User-facing version — the one to show in footer/login. Falls back
       * to `version` when no admin override is configured.
       */
      displayVersion,
    },
    {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    },
  );
}
