/**
 * GET /api/admin/archive - Search and list archived documents
 * POST /api/admin/archive - Manually archive a document
 *
 * Permission: admin:manage
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/withPermission";
import {
  searchArchive,
  getArchiveStats,
} from "@/lib/archive/gobd-archive";
import { autoArchiveInvoice, autoArchiveContract } from "@/lib/archive/auto-archive";
import { createAuditLog } from "@/lib/audit";
import { apiLogger as logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// GET - Search / list archived documents
// ---------------------------------------------------------------------------

const searchQuerySchema = z.object({
  type: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(25),
  stats: z.enum(["true", "false"]).default("false"),
});

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);

    const params = searchQuerySchema.parse({
      type: searchParams.get("type") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      search: searchParams.get("search") || undefined,
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 25,
      stats: searchParams.get("stats") || "false",
    });

    // If stats requested, return statistics
    if (params.stats === "true") {
      const stats = await getArchiveStats(check.tenantId!);
      return NextResponse.json({ stats });
    }

    // Search archive
    const result = await searchArchive({
      tenantId: check.tenantId!,
      documentType: params.type || undefined,
      dateFrom: params.dateFrom ? new Date(params.dateFrom) : undefined,
      dateTo: params.dateTo ? new Date(params.dateTo) : undefined,
      searchTerm: params.search || undefined,
      limit: params.limit,
      offset: (params.page - 1) * params.limit,
    });

    const totalPages = Math.ceil(result.total / params.limit);

    return NextResponse.json({
      data: result.items,
      pagination: {
        page: params.page,
        limit: params.limit,
        totalCount: result.total,
        totalPages,
        hasNextPage: params.page < totalPages,
        hasPrevPage: params.page > 1,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Ungültige Parameter", details: error.errors },
        { status: 400 }
      );
    }
    logger.error({ err: error }, "Error searching archive");
    return NextResponse.json(
      { error: "Fehler beim Durchsuchen des Archivs" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST - Manually archive a document
// ---------------------------------------------------------------------------

const archiveBodySchema = z.object({
  documentType: z.enum(["INVOICE", "CREDIT_NOTE", "RECEIPT", "CONTRACT", "SETTLEMENT"]),
  referenceId: z.string().min(1, "Referenz-ID erforderlich"),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("admin:manage");
    if (!check.authorized) return check.error;

    const body = await request.json();
    const parsed = archiveBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabedaten", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { documentType, referenceId } = parsed.data;
    let archiveId: string | null = null;

    // Route to the appropriate auto-archive handler
    switch (documentType) {
      case "INVOICE":
      case "CREDIT_NOTE": {
        archiveId = await autoArchiveInvoice(referenceId, check.userId!);
        break;
      }
      case "CONTRACT": {
        archiveId = await autoArchiveContract(referenceId, check.userId!);
        break;
      }
      default: {
        return NextResponse.json(
          {
            error: `Manuelles Archivieren für Typ '${documentType}' wird noch nicht unterstuetzt. ` +
              "Verwenden Sie die API mit Content-Upload.",
          },
          { status: 400 }
        );
      }
    }

    if (!archiveId) {
      return NextResponse.json(
        {
          error: "Dokument konnte nicht archiviert werden. " +
            "Moeglicherweise existiert kein PDF oder das Dokument wurde bereits archiviert.",
        },
        { status: 422 }
      );
    }

    // Audit log
    await createAuditLog({
      action: "CREATE",
      entityType: "ArchivedDocument",
      entityId: archiveId,
      newValues: { documentType, referenceId, archiveId },
      description: `GoBD-Archivierung: ${documentType} ${referenceId}`,
    });

    return NextResponse.json(
      { archiveId, message: "Dokument erfolgreich archiviert" },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("bereits archiviert")) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }
    logger.error({ err: error }, "Error archiving document");
    return NextResponse.json(
      { error: "Fehler beim Archivieren des Dokuments" },
      { status: 500 }
    );
  }
}
