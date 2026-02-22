import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const newVersionSchema = z.object({
  fileName: z.string().min(1, "Dateiname ist erforderlich"),
  fileUrl: z.string().min(1, "Datei-URL ist erforderlich"),
  fileSizeBytes: z.number().optional(),
  mimeType: z.string().optional(),
  description: z.string().optional(),
});

// POST /api/documents/[id]/versions - Neue Version hochladen
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_CREATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Finde das Original-Dokument (oder die aktuelle Version)
    const currentDocument = await prisma.document.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
    });

    if (!currentDocument) {
      return NextResponse.json(
        { error: "Dokument nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = newVersionSchema.parse(body);

    // Finde die höchste Versionsnummer aller Versionen dieses Dokuments
    // Das aktuelle Dokument könnte selbst eine Version sein (parentId != null)
    // oder das Original (parentId == null)
    const rootDocumentId = currentDocument.parentId || currentDocument.id;

    const latestVersion = await prisma.document.findFirst({
      where: {
        OR: [
          { id: rootDocumentId },
          { parentId: rootDocumentId },
        ],
        tenantId: check.tenantId,
      },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const nextVersion = (latestVersion?.version || 1) + 1;

    // Erstelle die neue Version
    const newVersion = await prisma.document.create({
      data: {
        // Kopiere Metadaten vom aktuellen Dokument
        title: currentDocument.title,
        description: validatedData.description || currentDocument.description,
        category: currentDocument.category,
        tags: currentDocument.tags,
        tenantId: currentDocument.tenantId,

        // Neue Datei-Informationen
        fileName: validatedData.fileName,
        fileUrl: validatedData.fileUrl,
        fileSizeBytes: validatedData.fileSizeBytes,
        mimeType: validatedData.mimeType,

        // Versionierung
        version: nextVersion,
        parentId: rootDocumentId,

        // Zuordnungen kopieren
        parkId: currentDocument.parkId,
        fundId: currentDocument.fundId,
        turbineId: currentDocument.turbineId,
        contractId: currentDocument.contractId,
        shareholderId: currentDocument.shareholderId,
        serviceEventId: currentDocument.serviceEventId,

        // Ersteller
        uploadedById: check.userId,
      },
    });

    return NextResponse.json({
      id: newVersion.id,
      version: newVersion.version,
      fileName: newVersion.fileName,
      parentId: newVersion.parentId,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error creating document version");
    return NextResponse.json(
      { error: "Fehler beim Erstellen der neuen Version" },
      { status: 500 }
    );
  }
}

// GET /api/documents/[id]/versions - Alle Versionen abrufen
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
      select: {
        id: true,
        parentId: true,
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Dokument nicht gefunden" },
        { status: 404 }
      );
    }

    // Finde das Root-Dokument
    const rootDocumentId = document.parentId || document.id;

    // Hole alle Versionen
    const versions = await prisma.document.findMany({
      where: {
        OR: [
          { id: rootDocumentId },
          { parentId: rootDocumentId },
        ],
        tenantId: check.tenantId,
      },
      select: {
        id: true,
        version: true,
        fileName: true,
        fileUrl: true,
        fileSizeBytes: true,
        mimeType: true,
        createdAt: true,
        uploadedBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { version: "desc" },
    });

    return NextResponse.json({
      rootDocumentId,
      currentDocumentId: id,
      versions: versions.map((v) => ({
        id: v.id,
        version: v.version,
        fileName: v.fileName,
        fileUrl: v.fileUrl,
        fileSizeBytes: v.fileSizeBytes ? Number(v.fileSizeBytes) : null,
        mimeType: v.mimeType,
        createdAt: v.createdAt.toISOString(),
        uploadedBy: v.uploadedBy
          ? [v.uploadedBy.firstName, v.uploadedBy.lastName].filter(Boolean).join(" ")
          : null,
        isCurrent: v.id === id,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching document versions");
    return NextResponse.json(
      { error: "Fehler beim Laden der Versionen" },
      { status: 500 }
    );
  }
}
