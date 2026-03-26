import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days} Tag${days !== 1 ? "e" : ""}, ${hours} Stunde${hours !== 1 ? "n" : ""}`;
  }
  if (hours > 0) {
    return `${hours} Stunde${hours !== 1 ? "n" : ""}`;
  }
  return `${minutes} Minute${minutes !== 1 ? "n" : ""}`;
}

async function checkStorage(): Promise<"available" | "unavailable"> {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;

  if (!endpoint || !bucket) return "unavailable";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${endpoint}/${bucket}`, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // 2xx or 4xx (e.g. 403 Forbidden) means storage is reachable
    return res.status < 500 ? "available" : "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function GET() {
  const check = await requireAdmin();
  if (!check.authorized) return check.error;

  let database: "connected" | "disconnected" = "disconnected";
  let storage: "available" | "unavailable" = "unavailable";

  // Check database
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "connected";
  } catch {
    database = "disconnected";
  }

  // Check storage in parallel with DB result known
  storage = await checkStorage();

  const status: "healthy" | "degraded" | "down" =
    database === "disconnected"
      ? "down"
      : storage === "unavailable"
      ? "degraded"
      : "healthy";

  // Use NEXT_PUBLIC_APP_VERSION injected at build time via next.config.ts env
  // (avoids dynamic require() which Turbopack traces as full-project NFT entry)
  const version =
    process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.npm_package_version ?? "0.0.0";

  return NextResponse.json({
    status,
    database,
    storage,
    uptime: formatUptime(Math.floor(process.uptime())),
    version,
    lastCheck: new Date().toISOString(),
  });
}
