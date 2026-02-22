import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { generateInvoicePdf } from "@/lib/pdf";
import { parseWatermarkParam } from "@/lib/pdf/utils/watermark";
import type { InvoicePdfOptions } from "@/lib/pdf/generators/invoicePdf";
import { apiLogger as logger } from "@/lib/logger";

// GET /api/invoices/[id]/pdf - PDF generieren und herunterladen
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Rechnung pruefen
    const invoice = await prisma.invoice.findUnique({
      where: { id },
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

    if (invoice.tenantId !== check.tenantId!) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    // Query-Parameter auslesen
    const { searchParams } = new URL(request.url);
    const inline = searchParams.get("inline") === "true";
    const preview = searchParams.get("preview") === "true";
    const watermarkParam = searchParams.get("watermark");

    // Wasserzeichen-Typ aus Query-Parameter parsen
    const explicitWatermark = parseWatermarkParam(watermarkParam);

    // PDF-Optionen zusammenstellen
    const pdfOptions: InvoicePdfOptions = {
      isPreview: preview,
      watermark: explicitWatermark,
    };

    // Bei DRAFT-Rechnungen automatisch DRAFT-Wasserzeichen (wenn kein explizites angegeben)
    // Dies wird automatisch durch shouldShowWatermark in generateInvoicePdf behandelt

    // Bei preview=true automatisch MUSTER-Wasserzeichen (wenn kein explizites angegeben)
    // Dies wird automatisch durch shouldShowWatermark in generateInvoicePdf behandelt

    // PDF generieren
    const pdfBuffer = await generateInvoicePdf(id, pdfOptions);

    // Dateiname erstellen (mit Wasserzeichen-Suffix falls vorhanden)
    let filename = `${invoice.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, "_")}`;
    if (preview) {
      filename += "_MUSTER";
    } else if (explicitWatermark) {
      filename += `_${explicitWatermark}`;
    }
    filename += ".pdf";

    // Response mit PDF (Buffer zu Uint8Array konvertieren fuer Web API Kompatibilitaet)
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": inline
          ? `inline; filename="${filename}"`
          : `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length.toString(),
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating PDF");
    return NextResponse.json(
      {
        error: "Fehler bei der PDF-Generierung",
        details: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 }
    );
  }
}
