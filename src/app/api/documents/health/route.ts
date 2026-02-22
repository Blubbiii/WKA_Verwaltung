import { NextResponse } from "next/server";
import { S3Client, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";

export async function GET() {
  // Admin-only health check - requires admin:system permission
  const check = await requirePermission(PERMISSIONS.ADMIN_SYSTEM);
  if (!check.authorized) return check.error!;

  const S3_ENDPOINT = process.env.S3_ENDPOINT || "http://localhost:9000";
  const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || "minioadmin";
  const S3_SECRET_KEY = process.env.S3_SECRET_KEY || "minioadmin";
  const S3_BUCKET = process.env.S3_BUCKET || "wpm-documents";
  const S3_REGION = process.env.S3_REGION || "us-east-1";

  const result: {
    status: string;
    timestamp: string;
    config: {
      endpoint: string;
      bucket: string;
      region: string;
    };
    checks: Array<{
      name: string;
      status: string;
      message: string;
      error?: string;
    }>;
  } = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    config: {
      endpoint: S3_ENDPOINT,
      bucket: S3_BUCKET,
      region: S3_REGION,
    },
    checks: [],
  };

  // Teste S3-Verbindung
  try {
    const s3Client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
      forcePathStyle: true,
    });

    try {
      const command = new HeadBucketCommand({ Bucket: S3_BUCKET });
      await s3Client.send(command);

      result.checks.push({
        name: "S3 Bucket",
        status: "ok",
        message: `Bucket '${S3_BUCKET}' existiert und ist erreichbar`,
      });
    } catch (bucketError) {
      const errorMessage = bucketError instanceof Error ? bucketError.message : String(bucketError);
      const errorName = bucketError instanceof Error ? (bucketError as { name?: string }).name : "Unknown";

      // Versuche Bucket zu erstellen wenn er nicht existiert
      if (errorName === "NotFound" || errorName === "NoSuchBucket" || errorMessage.includes("404")) {
        try {
          const createCommand = new CreateBucketCommand({ Bucket: S3_BUCKET });
          await s3Client.send(createCommand);

          result.checks.push({
            name: "S3 Bucket",
            status: "created",
            message: `Bucket '${S3_BUCKET}' wurde erstellt`,
          });
        } catch (createError) {
          result.status = "unhealthy";
          result.checks.push({
            name: "S3 Bucket",
            status: "error",
            message: `Bucket konnte nicht erstellt werden`,
            error: createError instanceof Error ? createError.message : String(createError),
          });
        }
      } else {
        throw bucketError;
      }
    }
  } catch (error) {
    result.status = "unhealthy";
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes("ECONNREFUSED")) {
      result.checks.push({
        name: "S3 Connection",
        status: "error",
        message: `MinIO/S3 ist nicht erreichbar unter ${S3_ENDPOINT}`,
        error: "ECONNREFUSED - Bitte starte MinIO mit: docker-compose -f docker-compose.dev.yml up -d minio",
      });
    } else {
      result.checks.push({
        name: "S3 Connection",
        status: "error",
        message: `Fehler beim Zugriff auf Storage`,
        error: errorMessage,
      });
    }
  }

  return NextResponse.json(result, {
    status: result.status === "healthy" ? 200 : 503,
  });
}
