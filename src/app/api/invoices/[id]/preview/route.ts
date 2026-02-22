import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { generateInvoicePdfBase64 } from "@/lib/pdf";
import { apiLogger as logger } from "@/lib/logger";

// GET /api/invoices/[id]/preview - PDF als Base64 fuer Vorschau
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

    // PDF als Base64 generieren
    const base64 = await generateInvoicePdfBase64(id);

    return NextResponse.json({
      invoiceNumber: invoice.invoiceNumber,
      base64,
      mimeType: "application/pdf",
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating PDF preview");
    return NextResponse.json(
      {
        error: "Fehler bei der PDF-Vorschau",
        details: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 }
    );
  }
}
