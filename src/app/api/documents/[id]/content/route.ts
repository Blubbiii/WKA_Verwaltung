import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client, S3_BUCKET } from "@/lib/storage";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { apiLogger as logger } from "@/lib/logger";
import { CACHE_TTL } from "@/lib/cache/types";
import { apiError } from "@/lib/api-errors";

const S3_ENDPOINT = process.env.S3_ENDPOINT || "http://localhost:9000";

/**
 * GET /api/documents/[id]/content
 *
 * Proxy-Route die Dokument-Inhalte von S3/MinIO streamt.
 * Loest das CORS-Problem für PDF-Viewer im Browser.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Dokument aus DB laden
    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        fileUrl: true,
        fileName: true,
        mimeType: true,
        tenantId: true,
      },
    });

    if (!document) {
      return apiError("NOT_FOUND", undefined, { message: "Dokument nicht gefunden" });
    }

    // Tenant-Prüfung
    if (document.tenantId !== check.tenantId) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
    }

    // Prüfe ob fileUrl vorhanden und gültig ist
    if (!document.fileUrl) {
      logger.error(`Document ${id} hat keine fileUrl`);
      return apiError("NOT_FOUND", undefined, { message: "Dokument hat keine Datei verknuepft" });
    }

    // Prüfen ob fileUrl ein S3-Key ist oder eine externe URL
    const isS3Key = !document.fileUrl.startsWith("http://") &&
      !document.fileUrl.startsWith("https://");

    if (!isS3Key) {
      // Security: Only redirect to known/trusted hosts
      try {
        const externalUrl = new URL(document.fileUrl);
        const allowedHosts = [
          new URL(S3_ENDPOINT).hostname,
          process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : null,
        ].filter(Boolean);
        if (!allowedHosts.includes(externalUrl.hostname)) {
          logger.warn(`Blocked redirect to untrusted host: ${externalUrl.hostname}`);
          return apiError("FORBIDDEN", undefined, { message: "Externer Link nicht vertrauenswuerdig" });
        }
      } catch {
        return apiError("VALIDATION_FAILED", undefined, { message: "Ungültige Datei-URL" });
      }
      return NextResponse.redirect(document.fileUrl);
    }

    // Datei von S3 laden
    try {
      const client = getS3Client();

      logger.info(`Lade Datei von S3: Bucket=${S3_BUCKET}, Key=${document.fileUrl}`);

      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: document.fileUrl,
      });

      const response = await client.send(command);

      if (!response.Body) {
        logger.error(`S3 returned no body for key: ${document.fileUrl}`);
        return apiError("INTERNAL_ERROR", undefined, { message: "Datei konnte nicht geladen werden" });
      }

      // Body zu Buffer konvertieren
      const chunks: Uint8Array[] = [];
      const reader = response.Body.transformToWebStream().getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const buffer = Buffer.concat(chunks);

      // Response mit korrekten Headers
      const headers = new Headers();
      headers.set("Content-Type", document.mimeType || "application/octet-stream");
      headers.set("Content-Length", buffer.length.toString());
      headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(document.fileName)}"`);
      headers.set("Cache-Control", `private, max-age=${CACHE_TTL.LONG}`);
      headers.set("Access-Control-Allow-Origin", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
      headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");

      return new NextResponse(buffer, {
        status: 200,
        headers,
      });
    } catch (s3Error) {
      // Bessere Fehlerbehandlung mit detailliertem Logging
      const errorMessage = s3Error instanceof Error ? s3Error.message : String(s3Error);
      const errorName = s3Error instanceof Error ? (s3Error as { name?: string }).name : "Unknown";

      logger.error({
        documentId: id,
        s3Key: document.fileUrl,
        bucket: S3_BUCKET,
        endpoint: S3_ENDPOINT,
        errorName,
        errorMessage,
      }, "S3 Fehler beim Abrufen von Datei");

      // Bei NoSuchKey: Versuche lokalen Fallback (alte Uploads)
      if (errorName === "NoSuchKey" || errorMessage.includes("NoSuchKey")) {
        // Versuche Datei lokal zu laden (Fallback für alte Uploads)
        const publicDir = path.resolve(process.cwd(), "public");
        const localPath = path.resolve(publicDir, document.fileUrl);

        // Security: Prevent path traversal outside public/ directory
        if (!localPath.startsWith(publicDir + path.sep)) {
          return apiError("VALIDATION_FAILED", undefined, { message: "Ungültiger Dateipfad" });
        }

        if (existsSync(localPath)) {
          logger.info(`Fallback: Lade Datei lokal von: ${localPath}`);
          try {
            const fileBuffer = await readFile(localPath);

            const headers = new Headers();
            headers.set("Content-Type", document.mimeType || "application/octet-stream");
            headers.set("Content-Length", fileBuffer.length.toString());
            headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(document.fileName)}"`);
            headers.set("Cache-Control", `private, max-age=${CACHE_TTL.LONG}`);
            headers.set("Access-Control-Allow-Origin", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");

            return new NextResponse(fileBuffer, { status: 200, headers });
          } catch (localError) {
            logger.error({ err: localError }, "Fehler beim lokalen Laden");
          }
        }

        return apiError("NOT_FOUND", undefined, { message: "Datei existiert nicht. Bitte laden Sie das Dokument erneut hoch." });
      } else if (errorName === "NoSuchBucket" || errorMessage.includes("NoSuchBucket")) {
        return apiError("STORAGE_FAILED", undefined, { message: "Storage-Bucket nicht konfiguriert. Rufen Sie /api/documents/health auf." });
      } else if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("connect")) {
        return apiError("STORAGE_FAILED", 503, { message: "Storage-Service nicht erreichbar. Bitte MinIO starten." });
      } else {
        return apiError("STORAGE_FAILED", undefined, { message: "Fehler beim Laden der Datei vom Storage" });
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden des Dokuments");
    return apiError("FETCH_FAILED", undefined, { message: "Fehler beim Laden des Dokuments" });
  }
}

// OPTIONS für CORS Preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
