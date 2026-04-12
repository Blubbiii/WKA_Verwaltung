import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import {
  generateSettlementReportPdf,
  getSettlementReportFilename,
} from "@/lib/pdf/generators/settlementReportPdf";
import { apiError } from "@/lib/api-errors";

// GET /api/admin/settlement-periods/[id]/report - PDF Report herunterladen
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Hole Periode für Dateinamen
    const period = await prisma.leaseSettlementPeriod.findUnique({
      where: { id },
      include: {
        park: {
          select: { name: true },
        },
      },
    });

    if (!period) {
      return apiError("NOT_FOUND", undefined, { message: "Abrechnungsperiode nicht gefunden" });
    }

    if (period.tenantId !== check.tenantId!) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
    }

    // PDF generieren
    const pdfBuffer = await generateSettlementReportPdf(id, check.tenantId!);

    // Dateiname generieren
    const filename = getSettlementReportFilename(
      period.park.name,
      period.year,
      "download"
    );

    // PDF als Response zurückgeben
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating settlement report PDF");
    return apiError("CREATE_FAILED", undefined, { message: "Fehler beim Generieren des PDFs" });
  }
}

// POST /api/admin/settlement-periods/[id]/report - PDF als Base64 (für Vorschau)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("invoices:read");
    if (!check.authorized) return check.error;

    const { id } = await params;

    // Hole Periode
    const period = await prisma.leaseSettlementPeriod.findUnique({
      where: { id },
      select: {
        tenantId: true,
        year: true,
        park: {
          select: { name: true },
        },
      },
    });

    if (!period) {
      return apiError("NOT_FOUND", undefined, { message: "Abrechnungsperiode nicht gefunden" });
    }

    if (period.tenantId !== check.tenantId!) {
      return apiError("FORBIDDEN", undefined, { message: "Keine Berechtigung" });
    }

    // PDF generieren
    const pdfBuffer = await generateSettlementReportPdf(id, check.tenantId!);
    const base64 = pdfBuffer.toString("base64");

    // Dateiname generieren
    const filename = getSettlementReportFilename(
      period.park.name,
      period.year,
      "download"
    );

    return NextResponse.json({
      base64,
      filename,
      mimeType: "application/pdf",
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating settlement report preview");
    return apiError("CREATE_FAILED", undefined, { message: "Fehler beim Generieren der Vorschau" });
  }
}
