import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSignedUrl } from "@/lib/storage";
import { createAuditLog } from "@/lib/audit";
import { apiLogger as logger } from "@/lib/logger";

/**
 * GET /api/portal/my-reports/[id]/download
 *
 * Generiert eine signierte URL fuer den Download eines Berichts.
 * Prueft ob der angemeldete Gesellschafter Zugriff auf das Dokument hat.
 * Erstellt einen Audit-Log-Eintrag fuer den Download.
 *
 * Query Parameters:
 * - redirect: wenn "true", wird direkt zur signierten URL weitergeleitet
 * - expiresIn: Gueltigkeitsdauer in Sekunden (Standard: 3600)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);

    // Query Parameter
    const shouldRedirect = searchParams.get("redirect") === "true";
    const expiresInParam = searchParams.get("expiresIn");
    const expiresIn = expiresInParam ? parseInt(expiresInParam, 10) : 3600;

    // Validiere expiresIn (1 Minute bis 7 Tage)
    const MIN_EXPIRES = 60;
    const MAX_EXPIRES = 604800;
    const validExpiresIn = Math.min(Math.max(expiresIn, MIN_EXPIRES), MAX_EXPIRES);

    // Find the shareholder linked to this user
    const shareholder = await prisma.shareholder.findUnique({
      where: { userId: session.user.id },
    });

    if (!shareholder) {
      return NextResponse.json(
        { error: "Kein Gesellschafter-Zugang vorhanden" },
        { status: 403 }
      );
    }

    // Find all shareholders for the same person
    const shareholders = await prisma.shareholder.findMany({
      where: {
        personId: shareholder.personId,
      },
      select: {
        id: true,
        fundId: true,
      },
    });

    const fundIds = shareholders.map((sh) => sh.fundId);
    const shareholderIds = shareholders.map((sh) => sh.id);

    // Fetch the document and verify access
    const document = await prisma.document.findFirst({
      where: {
        id,
        isArchived: false,
        OR: [
          // Fund-level document
          {
            fundId: { in: fundIds },
            category: "REPORT",
          },
          // Personal shareholder document
          {
            shareholderId: { in: shareholderIds },
            category: "REPORT",
          },
        ],
      },
      select: {
        id: true,
        title: true,
        fileUrl: true,
        fileName: true,
        mimeType: true,
        fundId: true,
        shareholderId: true,
        fund: {
          select: { name: true },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Bericht nicht gefunden oder kein Zugriff" },
        { status: 404 }
      );
    }

    // fileUrl contains the S3 key
    const s3Key = document.fileUrl;

    if (!s3Key) {
      return NextResponse.json(
        { error: "Keine Datei mit diesem Bericht verknuepft" },
        { status: 404 }
      );
    }

    // Generate signed URL
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

    // Create audit log for the download
    await createAuditLog({
      action: "VIEW",
      entityType: "Document",
      entityId: document.id,
      newValues: {
        action: "DOWNLOAD",
        portal: "shareholder",
        fileName: document.fileName,
        title: document.title,
        fundName: document.fund?.name,
      },
    });

    // If redirect=true, redirect directly to the signed URL
    if (shouldRedirect) {
      return NextResponse.redirect(signedUrl);
    }

    // Otherwise return JSON response with URL and metadata
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
