import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";
import {
  generateCustomReportPdf,
  getCustomReportFilename,
} from "@/lib/pdf/generators/customReportPdf";
import { prisma } from "@/lib/prisma";

// =============================================================================
// Validation Schema
// =============================================================================

const VALID_MODULE_KEYS = [
  // Analytics modules
  "performanceKpis",
  "productionHeatmap",
  "turbineRanking",
  "yearOverYear",
  "availabilityBreakdown",
  "availabilityTrend",
  "availabilityHeatmap",
  "downtimePareto",
  "turbineComparison",
  "powerCurveOverlay",
  "faultPareto",
  "warningTrend",
  "windDistribution",
  "environmentalData",
  "financialOverview",
  "revenueComparison",
  // Classic modules
  "kpiSummary",
  "production",
  "powerCurve",
  "windRose",
  "dailyProfile",
] as const;

const customReportSchema = z.object({
  parkId: z.string().min(1, "Park-ID erforderlich"),
  year: z
    .number()
    .int()
    .min(2000, "Jahr muss >= 2000 sein")
    .max(2100, "Jahr muss <= 2100 sein"),
  month: z
    .number()
    .int()
    .min(1, "Monat muss zwischen 1 und 12 liegen")
    .max(12, "Monat muss zwischen 1 und 12 liegen")
    .optional(),
  modules: z
    .array(z.string())
    .min(1, "Mindestens ein Modul muss ausgewählt sein")
    .max(20, "Maximal 20 Module erlaubt")
    .refine(
      (mods) => mods.every((m) => (VALID_MODULE_KEYS as readonly string[]).includes(m)),
      { message: "Unbekannte Modul-Schlüssel in der Auswahl" }
    ),
});

// =============================================================================
// Route Handler
// =============================================================================

/**
 * POST /api/reports/custom
 *
 * Generate a custom analytics PDF report for the selected modules.
 *
 * Body: { parkId: string, year: number, month?: number, modules: string[] }
 * Returns: PDF binary as attachment download
 */
export async function POST(request: NextRequest) {
  try {
    // Permission check — requires energy:read
    const check = await requirePermission(PERMISSIONS.ENERGY_READ);
    if (!check.authorized) return check.error!;

    // Parse and validate body
    const body = await request.json();
    const parsed = customReportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Ungültige Eingabedaten",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { parkId, year, month, modules } = parsed.data;

    // Resolve park name (and verify park belongs to tenant if not "all")
    let parkName = "Alle Parks";
    if (parkId !== "all") {
      const park = await prisma.park.findFirst({
        where: {
          id: parkId,
          tenantId: check.tenantId!,
        },
        select: { id: true, name: true },
      });

      if (!park) {
        return NextResponse.json(
          { error: "Windpark nicht gefunden oder keine Berechtigung" },
          { status: 404 }
        );
      }

      parkName = park.name;
    }

    // Fetch tenant name for cover page
    const tenant = await prisma.tenant.findUnique({
      where: { id: check.tenantId! },
      select: { name: true },
    });
    const tenantName = tenant?.name ?? "Unbekannt";

    logger.info(
      { parkId, year, month, modules, userId: check.userId },
      "Generating custom report PDF"
    );

    // Generate PDF
    const pdfBuffer = await generateCustomReportPdf(
      parkId,
      year,
      month,
      modules,
      check.tenantId!,
      tenantName
    );

    const filename = getCustomReportFilename(parkName, year, month);

    // Return PDF as download
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
    logger.error({ err: error }, "Error generating custom report");

    const message =
      error instanceof Error ? error.message : "Interner Serverfehler";

    return NextResponse.json(
      { error: `Fehler bei der Berichtserstellung: ${message}` },
      { status: 500 }
    );
  }
}
