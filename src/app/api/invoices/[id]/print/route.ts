import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { generateInvoicePdf } from "@/lib/pdf";
import { apiLogger as logger } from "@/lib/logger";

// POST /api/invoices/[id]/print - PDF generieren, drucken markieren und herunterladen
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:update");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Rechnung laden mit Tenant-Check
    const invoice = await prisma.invoice.findFirst({
      where: { id, ...(check.tenantId ? { tenantId: check.tenantId } : {}) },
      select: {
        id: true,
        invoiceNumber: true,
        tenantId: true,
        status: true,
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Rechnung nicht gefunden" },
        { status: 404 }
      );
    }

    // PDF generieren (laedt Invoice intern mit allen Relationen)
    const pdfBuffer = await generateInvoicePdf(invoice.id);

    // Druck-Zeitstempel setzen + bei DRAFT automatisch als versendet markieren
    await prisma.invoice.update({
      where: { id },
      data: {
        printedAt: new Date(),
        printedById: check.userId,
        ...(invoice.status === "DRAFT"
          ? { status: "SENT", sentAt: new Date() }
          : {}),
      },
    });

    // Dateiname erstellen
    const filename = `Gutschrift_${invoice.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`;

    // PDF als Response zurückgeben
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length.toString(),
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error printing invoice");
    return NextResponse.json(
      {
        error: "Fehler beim Drucken der Rechnung",
        details: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 }
    );
  }
}
