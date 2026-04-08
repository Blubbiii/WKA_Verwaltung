import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { generateInvoicePdf } from "@/lib/pdf";
import { apiLogger as logger } from "@/lib/logger";
import JSZip from "jszip";
import { API_LIMITS } from "@/lib/config/api-limits";
import { z } from "zod";

const batchPdfSchema = z.object({
  invoiceIds: z.array(z.string().min(1)).min(1).max(API_LIMITS.batchSize),
});

// POST /api/invoices/batch-pdf - Generate PDFs for multiple invoices and return as ZIP
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    // Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Ungueltiger Request Body" },
        { status: 400 }
      );
    }

    const parsed = batchPdfSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { invoiceIds } = parsed.data;

    // Deduplicate IDs
    const uniqueIds = [...new Set(invoiceIds)];

    logger.info(
      { count: uniqueIds.length, userId: check.userId },
      "Starting batch PDF generation"
    );

    // Fetch invoice numbers upfront (single DB query)
    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: uniqueIds },
        ...(check.tenantId ? { tenantId: check.tenantId } : {}),
      },
      select: { id: true, invoiceNumber: true },
    });
    const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv]));

    // Build ZIP
    const zip = new JSZip();
    let generated = 0;
    let failed = 0;

    for (const invoiceId of uniqueIds) {
      try {
        const invoice = invoiceMap.get(invoiceId);
        if (!invoice) {
          failed++;
          logger.warn({ invoiceId }, "Batch PDF: invoice not found or no access");
          continue;
        }

        const pdfBuffer = await generateInvoicePdf(invoiceId);
        const safeName = invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
        zip.file(`Rechnung_${safeName}.pdf`, pdfBuffer);
        generated++;
      } catch (error) {
        failed++;
        logger.error(
          { invoiceId, err: error },
          "Batch PDF: error generating PDF for invoice"
        );
      }
    }

    if (generated === 0) {
      return NextResponse.json(
        { error: "Keine PDFs konnten generiert werden" },
        { status: 404 }
      );
    }

    logger.info(
      { generated, failed, userId: check.userId },
      "Batch PDF generation completed"
    );

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="Rechnungen.zip"`,
        "Content-Length": String(zipBuffer.length),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error in batch PDF generation");
    return NextResponse.json(
      {
        error: "Fehler bei der Batch-PDF-Generierung",
        details:
          error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 }
    );
  }
}
