import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import {
  generateAnnualReportPdf,
  getAnnualReportFilename,
} from "@/lib/pdf/generators/annualReportPdf";
import { prisma } from "@/lib/prisma";

// Validation schema
const sectionsSchema = z.object({
  topology: z.boolean().optional(),
  kpis: z.boolean().optional(),
  monthlyTrend: z.boolean().optional(),
  turbinePerformance: z.boolean().optional(),
  financial: z.boolean().optional(),
  service: z.boolean().optional(),
}).optional();

const annualReportSchema = z.object({
  parkId: z.string().uuid("Ungültige Park-ID"),
  year: z
    .number()
    .int()
    .min(2000, "Jahr muss >= 2000 sein")
    .max(2100, "Jahr muss <= 2100 sein"),
  sections: sectionsSchema,
});

/**
 * POST /api/reports/annual
 *
 * Generate an annual report PDF for a specific park and year.
 *
 * Body: { parkId: string, year: number }
 * Returns: PDF file as download
 */
export async function POST(request: NextRequest) {
  try {
    // Permission check
    const check = await requirePermission(PERMISSIONS.REPORTS_CREATE);
    if (!check.authorized) return check.error!;

    // Parse and validate body
    const body = await request.json();
    const parsed = annualReportSchema.safeParse(body);

    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabedaten", details: parsed.error.flatten().fieldErrors });
    }

    const { parkId, year, sections } = parsed.data;

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
      return apiError("FORBIDDEN", 404, { message: "Windpark nicht gefunden oder keine Berechtigung" });
    }

    // Generate PDF
    logger.info(
      { parkId, year, userId: check.userId },
      "Generating annual report PDF"
    );

    const pdfBuffer = await generateAnnualReportPdf(
      parkId,
      year,
      check.tenantId!,
      sections
    );

    const filename = getAnnualReportFilename(park.name, year);

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
    logger.error({ err: error }, "Error generating annual report");

    const message =
      error instanceof Error ? error.message : "Interner Serverfehler";

    return apiError("INTERNAL_ERROR", 500, { message: `Fehler bei der Berichtserstellung: ${message}` });
  }
}
