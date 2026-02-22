import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { uploadFile, getSignedUrl, deleteFile } from "@/lib/storage";
import { apiLogger as logger } from "@/lib/logger";

// Maximale Dateigroesse: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Erlaubte MIME-Types
const ALLOWED_MIME_TYPES = ["application/pdf"];

/**
 * GET /api/proxies/[id]/document
 * Gibt eine Presigned URL fuer den Download des Vollmachts-Dokuments zurueck
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.VOTES_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Lade Proxy mit Tenant-Pruefung
    const proxy = await prisma.voteProxy.findFirst({
      where: {
        id,
        grantor: {
          fund: {
            tenantId: check.tenantId,
          },
        },
      },
      select: {
        id: true,
        documentUrl: true,
        grantor: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!proxy) {
      return NextResponse.json(
        { error: "Vollmacht nicht gefunden" },
        { status: 404 }
      );
    }

    if (!proxy.documentUrl) {
      return NextResponse.json(
        { error: "Kein Dokument vorhanden" },
        { status: 404 }
      );
    }

    // Generiere Presigned URL (gueltig fuer 1 Stunde)
    const signedUrl = await getSignedUrl(proxy.documentUrl, 3600);

    return NextResponse.json({
      url: signedUrl,
      key: proxy.documentUrl,
    });
  } catch (error) {
    logger.error({ err: error }, "Error getting proxy document");
    return NextResponse.json(
      { error: "Fehler beim Abrufen des Dokuments" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/proxies/[id]/document
 * Laedt ein Vollmachts-Dokument hoch (multipart/form-data)
 * - Nur PDF erlaubt
 * - Maximal 10MB
 * - Speichert in MinIO unter proxies/{proxyId}/{filename}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.VOTES_MANAGE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Lade Proxy mit Tenant-Pruefung
    const proxy = await prisma.voteProxy.findFirst({
      where: {
        id,
        grantor: {
          fund: {
            tenantId: check.tenantId,
          },
        },
      },
      select: {
        id: true,
        documentUrl: true,
        grantor: {
          select: {
            userId: true,
            fund: {
              select: {
                tenantId: true,
              },
            },
          },
        },
      },
    });

    if (!proxy) {
      return NextResponse.json(
        { error: "Vollmacht nicht gefunden" },
        { status: 404 }
      );
    }

    // Berechtigungspruefung: Vollmachtgeber selbst (Admin-Zugriff durch requirePermission abgedeckt)
    const isGrantor = proxy.grantor.userId === check.userId;

    if (!isGrantor) {
      return NextResponse.json(
        { error: "Keine Berechtigung zum Hochladen" },
        { status: 403 }
      );
    }

    // FormData parsen
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Keine Datei hochgeladen" },
        { status: 400 }
      );
    }

    // Validierung: MIME-Type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Nur PDF-Dateien sind erlaubt" },
        { status: 400 }
      );
    }

    // Validierung: Dateigroesse
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Die Datei darf maximal 10MB gross sein" },
        { status: 400 }
      );
    }

    // Datei in Buffer konvertieren
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Altes Dokument loeschen falls vorhanden
    if (proxy.documentUrl) {
      try {
        await deleteFile(proxy.documentUrl);
      } catch (deleteError) {
        logger.warn({ err: deleteError }, "Konnte altes Dokument nicht loeschen");
        // Fortfahren, auch wenn das Loeschen fehlschlaegt
      }
    }

    // Dateiname mit Proxy-ID als Prefix
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageKey = `proxies/${id}/${sanitizedFileName}`;

    // In MinIO hochladen (mit tenantId fuer Ordnerstruktur)
    // Wir verwenden einen speziellen Pfad fuer Vollmachten
    const key = await uploadFile(
      buffer,
      `proxies/${id}/${sanitizedFileName}`,
      file.type,
      check.tenantId!
    );

    // VoteProxy mit documentUrl aktualisieren
    const updatedProxy = await prisma.voteProxy.update({
      where: { id },
      data: {
        documentUrl: key,
      },
      select: {
        id: true,
        documentUrl: true,
      },
    });

    return NextResponse.json(
      {
        message: "Dokument erfolgreich hochgeladen",
        documentUrl: updatedProxy.documentUrl,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ err: error }, "Error uploading proxy document");
    return NextResponse.json(
      { error: "Fehler beim Hochladen des Dokuments" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/proxies/[id]/document
 * Loescht das Vollmachts-Dokument
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
const check = await requirePermission(PERMISSIONS.VOTES_MANAGE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Lade Proxy mit Tenant-Pruefung
    const proxy = await prisma.voteProxy.findFirst({
      where: {
        id,
        grantor: {
          fund: {
            tenantId: check.tenantId,
          },
        },
      },
      select: {
        id: true,
        documentUrl: true,
        grantor: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!proxy) {
      return NextResponse.json(
        { error: "Vollmacht nicht gefunden" },
        { status: 404 }
      );
    }

    // Berechtigungspruefung: Vollmachtgeber selbst (Admin-Zugriff durch requirePermission abgedeckt)
    const isGrantor = proxy.grantor.userId === check.userId;

    if (!isGrantor) {
      return NextResponse.json(
        { error: "Keine Berechtigung zum Loeschen" },
        { status: 403 }
      );
    }

    if (!proxy.documentUrl) {
      return NextResponse.json(
        { error: "Kein Dokument vorhanden" },
        { status: 404 }
      );
    }

    // Datei aus MinIO loeschen
    try {
      await deleteFile(proxy.documentUrl);
    } catch (deleteError) {
      logger.warn({ err: deleteError }, "Konnte Datei nicht aus Storage loeschen");
      // Fortfahren, auch wenn das Loeschen fehlschlaegt
    }

    // documentUrl auf null setzen
    await prisma.voteProxy.update({
      where: { id },
      data: {
        documentUrl: null,
      },
    });

    return NextResponse.json({
      message: "Dokument erfolgreich geloescht",
    });
  } catch (error) {
    logger.error({ err: error }, "Error deleting proxy document");
    return NextResponse.json(
      { error: "Fehler beim Loeschen des Dokuments" },
      { status: 500 }
    );
  }
}
