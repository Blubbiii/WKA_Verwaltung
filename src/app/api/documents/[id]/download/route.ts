import { NextRequest, NextResponse, after } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { getSignedUrl } from "@/lib/storage";
import { API_LIMITS } from "@/lib/config/api-limits";
import { createAuditLog } from "@/lib/audit";
import { apiLogger as logger } from "@/lib/logger";

/**
 * GET /api/documents/[id]/download
 *
 * Generiert eine signierte URL für den Download/Preview eines Dokuments.
 * Die URL ist standardmaessig 1 Stunde gültig.
 *
 * Query Parameters:
 * - redirect: wenn "true", wird direkt zur signierten URL weitergeleitet
 * - expiresIn: Gültigkeitsdauer in Sekunden (Standard: 3600)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Berechtigungsprüfung
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_READ);
    if (!check.authorized) return check.error;

    const { id } = await params;
    const { searchParams } = new URL(request.url);

    // Query Parameter
    const shouldRedirect = searchParams.get("redirect") === "true";
    const expiresInParam = searchParams.get("expiresIn");
    const expiresIn = expiresInParam ? parseInt(expiresInParam, 10) : API_LIMITS.signedUrlDefaultExpires;

    // Validiere expiresIn (1 Minute bis 7 Tage)
    const validExpiresIn = Math.min(Math.max(expiresIn, API_LIMITS.signedUrlMinExpires), API_LIMITS.signedUrlMaxExpires);

    // Hole Dokument aus der Datenbank
    const document = await prisma.document.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
      select: {
        id: true,
        title: true,
        fileUrl: true,
        fileName: true,
        mimeType: true,
        category: true,
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Dokument nicht gefunden" },
        { status: 404 }
      );
    }

    // fileUrl enthaelt den S3-Key
    const s3Key = document.fileUrl;

    if (!s3Key) {
      return NextResponse.json(
        { error: "Keine Datei mit diesem Dokument verknuepft" },
        { status: 404 }
      );
    }

    // Generiere signierte URL
    let signedUrl: string;
    try {
      signedUrl = await getSignedUrl(s3Key, validExpiresIn);
    } catch (storageError) {
      logger.error({ err: storageError }, "Failed to generate signed URL");
      return NextResponse.json(
        { error: "Download-URL konnte nicht generiert werden" },
        { status: 500 }
      );
    }

    // Log download to audit trail (deferred: runs after response is sent)
    after(async () => {
      await createAuditLog({
        action: "DOCUMENT_DOWNLOAD",
        entityType: "Document",
        entityId: document.id,
        newValues: {
          documentId: document.id,
          documentTitle: document.title,
          fileName: document.fileName,
          category: document.category,
          downloadedAt: new Date().toISOString(),
          redirect: shouldRedirect,
        },
        description: `Dokument "${document.title}" (${document.fileName}) heruntergeladen`,
      });
    });

    // Wenn redirect=true, leite direkt zur signierten URL weiter
    if (shouldRedirect) {
      return NextResponse.redirect(signedUrl);
    }

    // Ansonsten JSON-Response mit URL und Metadaten
    return NextResponse.json({
      url: signedUrl,
      fileName: document.fileName,
      mimeType: document.mimeType,
      expiresIn: validExpiresIn,
      expiresAt: new Date(Date.now() + validExpiresIn * 1000).toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating download URL");
    return NextResponse.json(
      { error: "Fehler beim Generieren der Download-URL" },
      { status: 500 }
    );
  }
}
