import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { apiLogger as logger } from "@/lib/logger";

// S3 Client Konfiguration
const S3_ENDPOINT = process.env.S3_ENDPOINT || "http://localhost:9000";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || "minioadmin";
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || "minioadmin";
const S3_BUCKET = process.env.S3_BUCKET || "wpm-documents";
const S3_REGION = process.env.S3_REGION || "us-east-1";

// Lazy-initialized S3 Client (NOT on module load)
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
      forcePathStyle: true,
    });
  }
  return s3Client;
}

/**
 * GET /api/documents/[id]/content
 *
 * Proxy-Route die Dokument-Inhalte von S3/MinIO streamt.
 * Loest das CORS-Problem fuer PDF-Viewer im Browser.
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
      return NextResponse.json(
        { error: "Dokument nicht gefunden" },
        { status: 404 }
      );
    }

    // Tenant-Pruefung
    if (document.tenantId !== check.tenantId) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Prüfe ob fileUrl vorhanden und gültig ist
    if (!document.fileUrl) {
      logger.error(`Document ${id} hat keine fileUrl`);
      return NextResponse.json(
        { error: "Dokument hat keine Datei verknuepft" },
        { status: 404 }
      );
    }

    // Pruefen ob fileUrl ein S3-Key ist oder eine externe URL
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
          return NextResponse.json(
            { error: "Externer Link nicht vertrauenswuerdig" },
            { status: 403 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Ungueltige Datei-URL" },
          { status: 400 }
        );
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
        return NextResponse.json(
          { error: "Datei konnte nicht geladen werden" },
          { status: 500 }
        );
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
      headers.set("Cache-Control", "private, max-age=3600");
      headers.set("Access-Control-Allow-Origin", process.env.NEXT_PUBLIC_APP_URL || "");
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
        // Versuche Datei lokal zu laden (Fallback fuer alte Uploads)
        const publicDir = path.resolve(process.cwd(), "public");
        const localPath = path.resolve(publicDir, document.fileUrl);

        // Security: Prevent path traversal outside public/ directory
        if (!localPath.startsWith(publicDir + path.sep)) {
          return NextResponse.json(
            { error: "Ungueltiger Dateipfad" },
            { status: 400 }
          );
        }

        if (existsSync(localPath)) {
          logger.info(`Fallback: Lade Datei lokal von: ${localPath}`);
          try {
            const fileBuffer = await readFile(localPath);

            const headers = new Headers();
            headers.set("Content-Type", document.mimeType || "application/octet-stream");
            headers.set("Content-Length", fileBuffer.length.toString());
            headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(document.fileName)}"`);
            headers.set("Cache-Control", "private, max-age=3600");
            headers.set("Access-Control-Allow-Origin", process.env.NEXT_PUBLIC_APP_URL || "");

            return new NextResponse(fileBuffer, { status: 200, headers });
          } catch (localError) {
            logger.error({ err: localError }, "Fehler beim lokalen Laden");
          }
        }

        return NextResponse.json(
          { error: "Datei existiert nicht. Bitte laden Sie das Dokument erneut hoch." },
          { status: 404 }
        );
      } else if (errorName === "NoSuchBucket" || errorMessage.includes("NoSuchBucket")) {
        return NextResponse.json(
          { error: "Storage-Bucket nicht konfiguriert. Rufen Sie /api/documents/health auf." },
          { status: 500 }
        );
      } else if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("connect")) {
        return NextResponse.json(
          { error: "Storage-Service nicht erreichbar. Bitte MinIO starten." },
          { status: 503 }
        );
      } else {
        return NextResponse.json(
          { error: "Fehler beim Laden der Datei vom Storage" },
          { status: 500 }
        );
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Fehler beim Laden des Dokuments");
    return NextResponse.json(
      { error: "Fehler beim Laden des Dokuments" },
      { status: 500 }
    );
  }
}

// OPTIONS fuer CORS Preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": process.env.NEXT_PUBLIC_APP_URL || "",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
