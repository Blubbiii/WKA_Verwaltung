import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { CATEGORY_LABELS } from "@/types/document-explorer";
import type { ExplorerFile, FolderPath } from "@/types/document-explorer";

// GET /api/documents/explorer/folder?parkId=x&year=2026&category=CONTRACT&page=1&limit=20
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_READ);
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get("parkId") || null;
    const yearStr = searchParams.get("year");
    const category = searchParams.get("category") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));

    if (!yearStr || !category) {
      return NextResponse.json(
        { error: "year und category sind erforderlich" },
        { status: 400 }
      );
    }

    const year = parseInt(yearStr, 10);
    if (isNaN(year) || year < 1970 || year > 2100) {
      return NextResponse.json({ error: "Ungültiges Jahr" }, { status: 400 });
    }
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);
    const skip = (page - 1) * limit;

    // Get park name for folder path
    let parkName = "Ohne Zuordnung";
    if (parkId) {
      const park = await prisma.park.findFirst({
        where: { id: parkId, tenantId: check.tenantId },
        select: { name: true, shortName: true },
      });
      parkName = park?.shortName || park?.name || "Unbekannter Park";
    }

    const folderPath: FolderPath = {
      parkId,
      parkName,
      year,
      category,
      categoryLabel: CATEGORY_LABELS[category] ?? category,
    };

    let data: ExplorerFile[] = [];
    let total = 0;

    if (category === "INVOICE_PDF") {
      // Query invoices with PDF
      const where = {
        tenantId: check.tenantId!,
        pdfUrl: { not: null },
        invoiceDate: { gte: yearStart, lt: yearEnd },
        ...(parkId ? { parkId } : {}),
      };

      const [invoices, count] = await Promise.all([
        prisma.invoice.findMany({
          where,
          select: {
            id: true,
            invoiceNumber: true,
            invoiceType: true,
            invoiceDate: true,
            recipientName: true,
            pdfUrl: true,
            grossAmount: true,
            status: true,
            park: { select: { id: true, name: true } },
          },
          orderBy: { invoiceDate: "desc" },
          skip,
          take: limit,
        }),
        prisma.invoice.count({ where }),
      ]);

      data = invoices.map((inv) => ({
        id: inv.id,
        type: "invoice" as const,
        title: `${inv.invoiceType === "CREDIT_NOTE" ? "GS" : "RG"} ${inv.invoiceNumber} — ${inv.recipientName || "Unbekannt"}`,
        fileName: `${inv.invoiceNumber}.pdf`,
        fileUrl: inv.pdfUrl!,
        fileSizeBytes: null,
        mimeType: "application/pdf",
        category: "INVOICE_PDF",
        createdAt: inv.invoiceDate.toISOString(),
        park: inv.park ? { id: inv.park.id, name: inv.park.name } : null,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate.toISOString(),
        grossAmount: inv.grossAmount ? Number(inv.grossAmount) : undefined,
        status: inv.status,
      }));
      total = count;
    } else {
      // Query documents
      const where = {
        tenantId: check.tenantId!,
        category: category as "CONTRACT" | "PROTOCOL" | "REPORT" | "INVOICE" | "PERMIT" | "CORRESPONDENCE" | "OTHER",
        createdAt: { gte: yearStart, lt: yearEnd },
        ...(parkId ? { parkId } : {}),
      };

      const [documents, count] = await Promise.all([
        prisma.document.findMany({
          where,
          select: {
            id: true,
            title: true,
            fileName: true,
            fileUrl: true,
            fileSizeBytes: true,
            mimeType: true,
            category: true,
            createdAt: true,
            approvalStatus: true,
            park: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.document.count({ where }),
      ]);

      data = documents.map((doc) => ({
        id: doc.id,
        type: "document" as const,
        title: doc.title,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        fileSizeBytes: doc.fileSizeBytes ? Number(doc.fileSizeBytes) : null,
        mimeType: doc.mimeType,
        category: doc.category,
        createdAt: doc.createdAt.toISOString(),
        park: doc.park ? { id: doc.park.id, name: doc.park.name } : null,
        status: doc.approvalStatus,
      }));
      total = count;
    }

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      folderPath,
    });
  } catch (error) {
    logger.error({ err: error }, "Error loading folder contents");
    return NextResponse.json(
      { error: "Fehler beim Laden des Ordnerinhalts" },
      { status: 500 }
    );
  }
}
