import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS, getUserHighestHierarchy, ROLE_HIERARCHY } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { deleteFile } from "@/lib/storage";
import { z } from "zod";
import { apiLogger as logger } from "@/lib/logger";

const documentUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.enum(["CONTRACT", "PROTOCOL", "REPORT", "INVOICE", "PERMIT", "CORRESPONDENCE", "OTHER"]).optional(),
  tags: z.array(z.string()).optional(),
  isArchived: z.boolean().optional(),
  approvalStatus: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "PUBLISHED", "REJECTED"]).optional(),
});

// GET /api/documents/[id] - Einzelnes Dokument mit Versionshistorie
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_READ);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const document = await prisma.document.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
      include: {
        park: {
          select: { id: true, name: true, shortName: true },
        },
        fund: {
          select: { id: true, name: true },
        },
        turbine: {
          select: { id: true, designation: true },
        },
        contract: {
          select: { id: true, title: true },
        },
        shareholder: {
          include: {
            person: {
              select: {
                firstName: true,
                lastName: true,
                companyName: true,
              },
            },
          },
        },
        uploadedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        reviewedBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        parent: {
          select: { id: true, version: true, fileName: true, createdAt: true },
        },
        versions: {
          select: {
            id: true,
            version: true,
            fileName: true,
            fileUrl: true,
            fileSizeBytes: true,
            createdAt: true,
            uploadedBy: {
              select: { firstName: true, lastName: true },
            },
          },
          orderBy: { version: "desc" },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Dokument nicht gefunden" },
        { status: 404 }
      );
    }

    // Build version history
    const allVersions = [
      {
        id: document.id,
        version: document.version,
        fileName: document.fileName,
        fileUrl: document.fileUrl,
        fileSizeBytes: document.fileSizeBytes ? Number(document.fileSizeBytes) : null,
        createdAt: document.createdAt.toISOString(),
        uploadedBy: document.uploadedBy
          ? [document.uploadedBy.firstName, document.uploadedBy.lastName]
              .filter(Boolean)
              .join(" ")
          : null,
        isCurrent: true,
      },
      ...document.versions.map((v) => ({
        id: v.id,
        version: v.version,
        fileName: v.fileName,
        fileUrl: v.fileUrl,
        fileSizeBytes: v.fileSizeBytes ? Number(v.fileSizeBytes) : null,
        createdAt: v.createdAt.toISOString(),
        uploadedBy: v.uploadedBy
          ? [v.uploadedBy.firstName, v.uploadedBy.lastName]
              .filter(Boolean)
              .join(" ")
          : null,
        isCurrent: false,
      })),
    ].sort((a, b) => b.version - a.version);

    return NextResponse.json({
      id: document.id,
      title: document.title,
      description: document.description,
      category: document.category,
      fileName: document.fileName,
      fileUrl: document.fileUrl,
      fileSizeBytes: document.fileSizeBytes ? Number(document.fileSizeBytes) : null,
      mimeType: document.mimeType,
      version: document.version,
      tags: document.tags,
      isArchived: document.isArchived,
      approvalStatus: document.approvalStatus,
      reviewedBy: document.reviewedBy
        ? {
            name: [document.reviewedBy.firstName, document.reviewedBy.lastName]
              .filter(Boolean)
              .join(" "),
            email: document.reviewedBy.email,
          }
        : null,
      reviewedAt: document.reviewedAt?.toISOString() || null,
      reviewNotes: document.reviewNotes,
      publishedAt: document.publishedAt?.toISOString() || null,
      park: document.park,
      fund: document.fund,
      turbine: document.turbine,
      contract: document.contract,
      shareholder: document.shareholder
        ? {
            id: document.shareholder.id,
            name:
              document.shareholder.person.companyName ||
              [document.shareholder.person.firstName, document.shareholder.person.lastName]
                .filter(Boolean)
                .join(" "),
          }
        : null,
      uploadedBy: document.uploadedBy
        ? {
            name: [document.uploadedBy.firstName, document.uploadedBy.lastName]
              .filter(Boolean)
              .join(" "),
            email: document.uploadedBy.email,
          }
        : null,
      versions: allVersions,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching document");
    return NextResponse.json(
      { error: "Fehler beim Laden des Dokuments" },
      { status: 500 }
    );
  }
}

// PUT /api/documents/[id] - Dokument aktualisieren (Metadaten)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_UPDATE);
    if (!check.authorized) return check.error;

    const { id } = await params;

    const existingDocument = await prisma.document.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!existingDocument) {
      return NextResponse.json(
        { error: "Dokument nicht gefunden" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validatedData = documentUpdateSchema.parse(body);

    const document = await prisma.document.update({
      where: { id },
      data: {
        ...(validatedData.title && { title: validatedData.title }),
        ...(validatedData.description !== undefined && {
          description: validatedData.description,
        }),
        ...(validatedData.category && { category: validatedData.category }),
        ...(validatedData.tags && { tags: validatedData.tags }),
        ...(validatedData.isArchived !== undefined && {
          isArchived: validatedData.isArchived,
        }),
      },
    });

    return NextResponse.json(document);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validierungsfehler", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error updating document");
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Dokuments" },
      { status: 500 }
    );
  }
}

// DELETE /api/documents/[id] - Dokument unwiderruflich löschen (nur ADMIN/SUPERADMIN)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_DELETE);
    if (!check.authorized) return check.error;

    // Additional check: Only Admin or higher (hierarchy >= 80) can hard-delete
    const hierarchy = await getUserHighestHierarchy(check.userId!);
    const session = await auth();
    const isAdmin = hierarchy >= ROLE_HIERARCHY.ADMIN ||
      (session?.user?.role && ["ADMIN", "SUPERADMIN"].includes(session.user.role));
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Keine Berechtigung. Nur Administratoren können Dokumente löschen." },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Before delete, get the full data for audit log
    const documentToDelete = await prisma.document.findFirst({
      where: {
        id,
        tenantId: check.tenantId!,
      },
    });

    if (!documentToDelete) {
      return NextResponse.json(
        { error: "Dokument nicht gefunden" },
        { status: 404 }
      );
    }

    // Loesche Datei aus S3/MinIO (wenn vorhanden)
    // fileUrl enthaelt den S3-Key
    if (documentToDelete.fileUrl) {
      try {
        await deleteFile(documentToDelete.fileUrl);
      } catch (storageError) {
        // Log den Fehler, aber fahre mit DB-Loeschung fort
        // Die Datei könnte bereits gelöscht sein oder nie existiert haben
        logger.error({ err: storageError }, "Failed to delete file from S3");
        // Optional: Warnung im Response zurückgeben
      }
    }

    // Hard delete + storage decrement + audit log atomar in einer Transaktion
    await prisma.$transaction(async (tx) => {
      // 1. Hard delete the document from database
      await tx.document.delete({
        where: { id },
      });

      // 2. Decrement storage usage
      if (documentToDelete.fileSizeBytes && documentToDelete.tenantId) {
        const fileSizeNum = Number(documentToDelete.fileSizeBytes);
        // Get current usage to avoid going negative
        const tenant = await tx.tenant.findUnique({
          where: { id: documentToDelete.tenantId },
          select: { storageUsedBytes: true },
        });
        if (tenant) {
          const currentBytes = Number(tenant.storageUsedBytes);
          const decrementBy = Math.min(fileSizeNum, currentBytes);
          if (decrementBy > 0) {
            await tx.tenant.update({
              where: { id: documentToDelete.tenantId },
              data: { storageUsedBytes: { decrement: decrementBy } },
            });
          }
        }
      }

      // 3. Log the deletion for audit trail
      await tx.auditLog.create({
        data: {
          action: "DELETE",
          entityType: "Document",
          entityId: id,
          oldValues: documentToDelete as unknown as Prisma.InputJsonValue,
          newValues: Prisma.JsonNull,
          tenantId: check.tenantId!,
          userId: check.userId!,
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error deleting document");
    return NextResponse.json(
      { error: "Fehler beim Löschen des Dokuments" },
      { status: 500 }
    );
  }
}
