import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { getFileBuffer } from "@/lib/storage";
import { CATEGORY_LABELS } from "@/types/document-explorer";
import { z } from "zod";
import JSZip from "jszip";

const MAX_FILES = 200;
const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

const downloadSchema = z.object({
  documentIds: z.array(z.string()).optional(),
  invoiceIds: z.array(z.string()).optional(),
  folder: z.object({
    parkId: z.string().nullable(),
    year: z.number(),
    category: z.string().optional(),
  }).optional(),
  taxExport: z.object({
    parkId: z.string(),
    year: z.number(),
  }).optional(),
});

interface FileEntry {
  path: string;
  fileUrl: string;
}

// POST /api/documents/explorer/download-zip
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.DOCUMENTS_READ);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const data = downloadSchema.parse(body);
    const tenantId = check.tenantId!;
    const files: FileEntry[] = [];

    // Get park name helper
    const getParkName = async (parkId: string | null): Promise<string> => {
      if (!parkId) return "Ohne Zuordnung";
      const park = await prisma.park.findFirst({
        where: { id: parkId, tenantId },
        select: { shortName: true, name: true },
      });
      return park?.shortName || park?.name || "Park";
    };

    if (data.documentIds?.length || data.invoiceIds?.length) {
      // Option A: Specific files by ID
      if (data.documentIds?.length) {
        const docs = await prisma.document.findMany({
          where: { id: { in: data.documentIds }, tenantId },
          select: { fileName: true, fileUrl: true, category: true, createdAt: true, park: { select: { shortName: true, name: true } } },
        });
        for (const doc of docs) {
          const parkName = doc.park?.shortName || doc.park?.name || "Ohne Zuordnung";
          const year = doc.createdAt.getFullYear();
          const catLabel = CATEGORY_LABELS[doc.category] ?? doc.category;
          files.push({ path: `${parkName}/${year}/${catLabel}/${doc.fileName}`, fileUrl: doc.fileUrl });
        }
      }
      if (data.invoiceIds?.length) {
        const invs = await prisma.invoice.findMany({
          where: { id: { in: data.invoiceIds }, tenantId, pdfUrl: { not: null } },
          select: { invoiceNumber: true, pdfUrl: true, invoiceDate: true, park: { select: { shortName: true, name: true } } },
        });
        for (const inv of invs) {
          const parkName = inv.park?.shortName || inv.park?.name || "Ohne Zuordnung";
          const year = inv.invoiceDate.getFullYear();
          files.push({ path: `${parkName}/${year}/Rechnungen/${inv.invoiceNumber}.pdf`, fileUrl: inv.pdfUrl! });
        }
      }
    } else if (data.folder) {
      // Option B: Entire folder
      const { parkId, year, category } = data.folder;
      const parkName = await getParkName(parkId);
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year + 1, 0, 1);
      const parkFilter = parkId ? { parkId } : { parkId: null as unknown as string };

      if (!category || category !== "INVOICE_PDF") {
        const docs = await prisma.document.findMany({
          where: {
            tenantId,
            ...parkFilter,
            createdAt: { gte: yearStart, lt: yearEnd },
            ...(category ? { category: category as "CONTRACT" | "PROTOCOL" | "REPORT" | "INVOICE" | "PERMIT" | "CORRESPONDENCE" | "OTHER" } : {}),
          },
          select: { fileName: true, fileUrl: true, category: true },
          take: MAX_FILES,
        });
        for (const doc of docs) {
          const catLabel = CATEGORY_LABELS[doc.category] ?? doc.category;
          files.push({ path: `${parkName}/${year}/${catLabel}/${doc.fileName}`, fileUrl: doc.fileUrl });
        }
      }

      if (!category || category === "INVOICE_PDF") {
        const invs = await prisma.invoice.findMany({
          where: { tenantId, ...parkFilter, pdfUrl: { not: null }, invoiceDate: { gte: yearStart, lt: yearEnd } },
          select: { invoiceNumber: true, pdfUrl: true },
          take: MAX_FILES,
        });
        for (const inv of invs) {
          files.push({ path: `${parkName}/${year}/Rechnungen/${inv.invoiceNumber}.pdf`, fileUrl: inv.pdfUrl! });
        }
      }
    } else if (data.taxExport) {
      // Option C: Tax export — all documents + invoices for a park/year
      const { parkId, year } = data.taxExport;
      const parkName = await getParkName(parkId);
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year + 1, 0, 1);

      const [docs, invs] = await Promise.all([
        prisma.document.findMany({
          where: { tenantId, parkId, createdAt: { gte: yearStart, lt: yearEnd } },
          select: { fileName: true, fileUrl: true, category: true },
          take: MAX_FILES,
        }),
        prisma.invoice.findMany({
          where: { tenantId, parkId, pdfUrl: { not: null }, invoiceDate: { gte: yearStart, lt: yearEnd } },
          select: { invoiceNumber: true, pdfUrl: true, invoiceType: true },
          take: MAX_FILES,
        }),
      ]);

      for (const doc of docs) {
        const catLabel = CATEGORY_LABELS[doc.category] ?? doc.category;
        files.push({ path: `${parkName}/${year}/${catLabel}/${doc.fileName}`, fileUrl: doc.fileUrl });
      }
      for (const inv of invs) {
        const prefix = inv.invoiceType === "CREDIT_NOTE" ? "Gutschriften" : "Rechnungen";
        files.push({ path: `${parkName}/${year}/${prefix}/${inv.invoiceNumber}.pdf`, fileUrl: inv.pdfUrl! });
      }
    } else {
      return NextResponse.json({ error: "Keine Dateien ausgewählt" }, { status: 400 });
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "Keine Dateien gefunden" }, { status: 404 });
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Maximal ${MAX_FILES} Dateien pro Download` },
        { status: 400 }
      );
    }

    // Build ZIP
    const zip = new JSZip();
    let totalSize = 0;

    for (const file of files) {
      try {
        const buffer = await getFileBuffer(file.fileUrl);
        totalSize += buffer.length;
        if (totalSize > MAX_SIZE_BYTES) {
          return NextResponse.json(
            { error: "ZIP-Größe überschreitet 500 MB Limit" },
            { status: 400 }
          );
        }
        zip.file(file.path, buffer);
      } catch {
        // Skip files that can't be loaded (e.g. deleted from S3)
        logger.warn({ fileUrl: file.fileUrl }, "File not found in storage, skipping");
      }
    }

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const fileName = data.taxExport
      ? `Steuerexport-${data.taxExport.year}.zip`
      : `dokumente-${new Date().toISOString().split("T")[0]}.zip`;

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(zipBuffer.length),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logger.error({ err: error }, "Error generating ZIP download");
    return NextResponse.json(
      { error: "Fehler beim Erstellen des Downloads" },
      { status: 500 }
    );
  }
}
