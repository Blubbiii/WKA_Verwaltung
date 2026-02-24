/**
 * POST /api/admin/archive/export - Export archive for tax audit (Betriebsprüfung)
 *
 * Generates a structured export with:
 * - Index CSV (GDPdU/GoBD format) with document metadata
 * - All archived PDF files
 * - Packaged for download
 *
 * Permission: admin:manage
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/withPermission";
import { getArchiveExportData } from "@/lib/archive/gobd-archive";
import { createAuditLog } from "@/lib/audit";
import { apiLogger as logger } from "@/lib/logger";

const exportBodySchema = z.object({
  year: z.number().int().min(2000).max(2100),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = exportBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabedaten", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { year } = parsed.data;

    // Get export data
    const exportData = await getArchiveExportData(check.tenantId!, year);

    if (exportData.documents.length === 0) {
      return NextResponse.json(
        { error: `Keine archivierten Dokumente für das Jahr ${year} gefunden` },
        { status: 404 }
      );
    }

    // Audit log the export
    await createAuditLog({
      action: "EXPORT",
      entityType: "ArchivedDocument",
      entityId: `archive-export-${year}`,
      newValues: {
        year,
        documentCount: exportData.documents.length,
        totalSizeBytes: exportData.totalSize,
      },
      description: `GoBD-Archiv Export für Betriebsprüfung: Jahr ${year}, ${exportData.documents.length} Dokumente`,
    });

    // Return the index CSV and document list as JSON
    // The frontend can then download individual documents or request bulk download
    return NextResponse.json({
      year,
      documentCount: exportData.documents.length,
      totalSizeBytes: exportData.totalSize,
      indexCsv: exportData.indexCsv,
      documents: exportData.documents.map((doc) => ({
        id: doc.id,
        documentType: doc.documentType,
        referenceNumber: doc.referenceNumber,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        contentHash: doc.contentHash,
        chainHash: doc.chainHash,
        archivedAt: doc.archivedAt,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "Error exporting archive");
    return NextResponse.json(
      { error: "Fehler beim Exportieren des Archivs" },
      { status: 500 }
    );
  }
}
