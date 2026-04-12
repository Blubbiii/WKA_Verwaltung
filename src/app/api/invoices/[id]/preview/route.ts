import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { generateInvoicePdfBase64 } from "@/lib/pdf";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

// GET /api/invoices/[id]/preview - PDF als Base64 für Vorschau
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Rechnung prüfen
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        invoiceNumber: true,
        tenantId: true,
      },
    });

    if (!invoice) {
      return apiError("NOT_FOUND", undefined, { message: "Rechnung nicht gefunden" });
    }

    if (invoice.tenantId !== check.tenantId!) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
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
    return apiError("PROCESS_FAILED", undefined, { message: "Fehler bei der PDF-Vorschau", details: error instanceof Error ? error.message : "Unbekannter Fehler" });
  }
}
