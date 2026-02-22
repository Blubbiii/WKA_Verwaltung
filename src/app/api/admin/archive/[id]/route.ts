/**
 * GET /api/admin/archive/[id] - Download an archived document
 *
 * Streams the file from S3/MinIO and logs the access.
 * Permission: admin:manage
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { getArchivedDocument } from "@/lib/archive/gobd-archive";
import { createAuditLog } from "@/lib/audit";
import { apiLogger as logger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Archiv-ID erforderlich" },
        { status: 400 }
      );
    }

    const result = await getArchivedDocument(id, check.tenantId!);

    if (!result) {
      return NextResponse.json(
        { error: "Archiviertes Dokument nicht gefunden" },
        { status: 404 }
      );
    }

    // Log access in audit trail (GoBD requirement: every access must be logged)
    await createAuditLog({
      action: "DOCUMENT_DOWNLOAD",
      entityType: "ArchivedDocument",
      entityId: id,
      newValues: {
        documentType: result.document.documentType,
        referenceNumber: result.document.referenceNumber,
        contentHash: result.document.contentHash,
      },
      description: `GoBD-Archiv Download: ${result.document.referenceNumber}`,
    });

    // Return file as download
    const headers = new Headers();
    headers.set("Content-Type", result.document.mimeType);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(result.document.fileName)}"`
    );
    headers.set("Content-Length", String(result.content.length));
    // Include hash in response headers for client-side verification
    headers.set("X-Content-Hash", result.document.contentHash);
    headers.set("X-Chain-Hash", result.document.chainHash);

    return new NextResponse(new Uint8Array(result.content), {
      status: 200,
      headers,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Integritaetsverletzung")
    ) {
      logger.error({ err: error }, "Archive integrity violation on download");
      return NextResponse.json(
        {
          error: "Integritaetsverletzung: Das Dokument wurde moeglicherweise manipuliert. " +
            "Bitte fuehren Sie eine vollstaendige Integritaetspruefung durch.",
        },
        { status: 500 }
      );
    }

    logger.error({ err: error }, "Error downloading archived document");
    return NextResponse.json(
      { error: "Fehler beim Herunterladen des archivierten Dokuments" },
      { status: 500 }
    );
  }
}
