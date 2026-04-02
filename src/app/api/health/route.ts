import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { isRedisHealthy } from "@/lib/queue/connection";

/**
 * Health Check Endpoint
 *
 * Checks: App, Database, Redis, S3/MinIO
 * Used by: Docker HEALTHCHECK, Traefik, Monitoring
 */

async function checkS3(): Promise<"ok" | "error"> {
  try {
    const { S3Client, HeadBucketCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
      region: process.env.S3_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
        secretAccessKey: process.env.S3_SECRET_KEY || "minioadmin",
      },
      forcePathStyle: true,
    });
    await client.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET || "wpm-documents" }));
    return "ok";
  } catch {
    return "error";
  }
}

export async function GET() {
  const isProduction = process.env.NODE_ENV === "production";

  const checks: Record<string, "ok" | "error" | "unknown"> = {
    database: "unknown",
    redis: "unknown",
    storage: "unknown",
  };

  // Database check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (err) {
    checks.database = "error";
    logger.error({ err }, "[Health] Database connection failed");
  }

  // Redis check
  try {
    const redisOk = await isRedisHealthy();
    checks.redis = redisOk ? "ok" : "error";
  } catch {
    checks.redis = "error";
  }

  // S3/MinIO check
  try {
    checks.storage = await checkS3();
  } catch {
    checks.storage = "error";
  }

  // Overall status
  const allOk = Object.values(checks).every((v) => v === "ok");
  const anyError = Object.values(checks).some((v) => v === "error");
  const status = allOk ? "ok" : anyError ? "degraded" : "ok";

  const health: Record<string, unknown> = {
    status,
    timestamp: new Date().toISOString(),
    checks,
  };

  if (!isProduction) {
    health.uptime = process.uptime();
    health.version = process.env.npm_package_version || "unknown";
    health.environment = process.env.NODE_ENV || "unknown";
  }

  return NextResponse.json(health, { status: status === "ok" ? 200 : 503 });
}

// HEAD for simple checks (Docker HEALTHCHECK)
export async function HEAD() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
