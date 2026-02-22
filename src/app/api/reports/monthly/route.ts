import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import {
  generateMonthlyReportPdf,
  getMonthlyReportFilename,
} from "@/lib/pdf/generators/monthlyReportPdf";
import { prisma } from "@/lib/prisma";

// Validation schema
const monthlyReportSchema = z.object({
  parkId: z.string().uuid("Ungueltige Park-ID"),
  year: z
    .number()
    .int()
    .min(2000, "Jahr muss >= 2000 sein")
    .max(2100, "Jahr muss <= 2100 sein"),
  month: z
    .number()
    .int()
    .min(1, "Monat muss zwischen 1 und 12 liegen")
    .max(12, "Monat muss zwischen 1 und 12 liegen"),
});

/**
 * POST /api/reports/monthly
 *
 * Generate a monthly report PDF for a specific park and month.
 *
 * Body: { parkId: string, year: number, month: number }
 * Returns: PDF file as download
 */
export async function POST(request: NextRequest) {
  try {
    // Permission check
    const check = await requirePermission(PERMISSIONS.REPORTS_CREATE);
    if (!check.authorized) return check.error!;

    // Parse and validate body
    const body = await request.json();
    const parsed = monthlyReportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Ungueltige Eingabedaten",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { parkId, year, month } = parsed.data;

    // Verify park belongs to tenant
    const park = await prisma.park.findFirst({
      where: {
        id: parkId,
        tenantId: check.tenantId!,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Windpark nicht gefunden oder keine Berechtigung" },
        { status: 404 }
      );
    }

    // Generate PDF
    logger.info(
      { parkId, year, month, userId: check.userId },
      "Generating monthly report PDF"
    );

    const pdfBuffer = await generateMonthlyReportPdf(
      parkId,
      year,
      month,
      check.tenantId!
    );

    const filename = getMonthlyReportFilename(park.name, year, month);

    // Return PDF as download (convert Buffer to Uint8Array for NextResponse)
    const uint8Array = new Uint8Array(pdfBuffer);
    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating monthly report");

    const message =
      error instanceof Error ? error.message : "Interner Serverfehler";

    return NextResponse.json(
      { error: `Fehler bei der Berichtserstellung: ${message}` },
      { status: 500 }
    );
  }
}
