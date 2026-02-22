import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

// Schema fuer das Verknuepfen eines existierenden Dokuments
const linkDocumentSchema = z.object({
  documentId: z.string().uuid("Ungueltige Dokument-ID"),
});

// GET /api/contracts/[id]/documents - Liste aller Dokumente eines Vertrags
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.CONTRACTS_READ);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Pruefe ob der Vertrag existiert und zum Tenant gehoert
    const contract = await prisma.contract.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
    });

    if (!contract) {
      return NextResponse.json(
        { error: "Vertrag nicht gefunden" },
        { status: 404 }
      );
    }

    // Hole alle Dokumente die mit diesem Vertrag verknuepft sind
    const documents = await prisma.document.findMany({
      where: {
        contractId: id,
        tenantId: check.tenantId,
        isArchived: false,
      },
      select: {
        id: true,
        title: true,
        description: true,
        fileName: true,
        fileUrl: true,
        fileSizeBytes: true,
        mimeType: true,
        category: true,
        tags: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        uploadedBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      data: documents.map((doc) => ({
        ...doc,
        fileSizeBytes: doc.fileSizeBytes ? Number(doc.fileSizeBytes) : null,
        uploadedBy: doc.uploadedBy
          ? `${doc.uploadedBy.firstName || ""} ${doc.uploadedBy.lastName || ""}`.trim()
          : null,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching contract documents");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// POST /api/contracts/[id]/documents - Dokument mit Vertrag verknuepfen
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.CONTRACTS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Pruefe ob der Vertrag existiert und zum Tenant gehoert
    const contract = await prisma.contract.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
    });

    if (!contract) {
      return NextResponse.json(
        { error: "Vertrag nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { documentId } = linkDocumentSchema.parse(body);

    // Pruefe ob das Dokument existiert und zum selben Tenant gehoert
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        tenantId: check.tenantId,
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Dokument nicht gefunden" },
        { status: 404 }
      );
    }

    // Pruefe ob das Dokument bereits mit diesem Vertrag verknuepft ist
    if (document.contractId === id) {
      return NextResponse.json(
        { error: "Dokument ist bereits mit diesem Vertrag verknuepft" },
        { status: 400 }
      );
    }

    // Verknuepfe das Dokument mit dem Vertrag
    const updatedDocument = await prisma.document.update({
      where: { id: documentId },
      data: { contractId: id },
      select: {
        id: true,
        title: true,
        description: true,
        fileName: true,
        fileUrl: true,
        fileSizeBytes: true,
        mimeType: true,
        category: true,
        tags: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        uploadedBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return NextResponse.json({
      ...updatedDocument,
      fileSizeBytes: updatedDocument.fileSizeBytes
        ? Number(updatedDocument.fileSizeBytes)
        : null,
      uploadedBy: updatedDocument.uploadedBy
        ? `${updatedDocument.uploadedBy.firstName || ""} ${updatedDocument.uploadedBy.lastName || ""}`.trim()
        : null,
      createdAt: updatedDocument.createdAt.toISOString(),
      updatedAt: updatedDocument.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Ungueltige Daten", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error linking document to contract");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}

// DELETE /api/contracts/[id]/documents - Dokument-Verknuepfung entfernen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.CONTRACTS_UPDATE);
    if (!check.authorized) return check.error!;

    const { id } = await params;

    // Hole documentId aus Query-Parameter
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("documentId");

    if (!documentId) {
      return NextResponse.json(
        { error: "documentId ist erforderlich" },
        { status: 400 }
      );
    }

    // Pruefe ob der Vertrag existiert und zum Tenant gehoert
    const contract = await prisma.contract.findFirst({
      where: {
        id,
        tenantId: check.tenantId,
      },
    });

    if (!contract) {
      return NextResponse.json(
        { error: "Vertrag nicht gefunden" },
        { status: 404 }
      );
    }

    // Pruefe ob das Dokument mit diesem Vertrag verknuepft ist
    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        contractId: id,
        tenantId: check.tenantId,
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Dokument nicht mit diesem Vertrag verknuepft" },
        { status: 404 }
      );
    }

    // Entferne die Verknuepfung (setze contractId auf null)
    await prisma.document.update({
      where: { id: documentId },
      data: { contractId: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error unlinking document from contract");
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
