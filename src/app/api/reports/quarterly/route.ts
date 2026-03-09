import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import {
  generateQuarterlyReportPdf,
  getQuarterlyReportFilename,
} from "@/lib/pdf/generators/quarterlyReportPdf";
import { prisma } from "@/lib/prisma";

const quarterlyReportSchema = z.object({
  parkId: z.string().uuid("Ungültige Park-ID"),
  year: z
    .number()
    .int()
    .min(2000, "Jahr muss >= 2000 sein")
    .max(2100, "Jahr muss <= 2100 sein"),
  quarter: z
    .number()
    .int()
    .min(1, "Quartal muss zwischen 1 und 4 liegen")
    .max(4, "Quartal muss zwischen 1 und 4 liegen"),
});

/**
 * POST /api/reports/quarterly
 *
 * Generate a quarterly report PDF for a specific park and quarter.
 *
 * Body: { parkId: string, year: number, quarter: number }
 * Returns: PDF file as download
 */
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.REPORTS_CREATE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const parsed = quarterlyReportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Ungültige Eingabedaten",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { parkId, year, quarter } = parsed.data;

    const park = await prisma.park.findFirst({
      where: { id: parkId, tenantId: check.tenantId! },
      select: { id: true, name: true },
    });

    if (!park) {
      return NextResponse.json(
        { error: "Windpark nicht gefunden oder keine Berechtigung" },
        { status: 404 }
      );
    }

    logger.info(
      { parkId, year, quarter, userId: check.userId },
      "Generating quarterly report PDF"
    );

    const pdfBuffer = await generateQuarterlyReportPdf(
      parkId,
      year,
      quarter,
      check.tenantId!
    );

    const filename = getQuarterlyReportFilename(park.name, year, quarter);

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
    logger.error({ err: error }, "Error generating quarterly report");

    const message =
      error instanceof Error ? error.message : "Interner Serverfehler";

    return NextResponse.json(
      { error: `Fehler bei der Berichtserstellung: ${message}` },
      { status: 500 }
    );
  }
}
