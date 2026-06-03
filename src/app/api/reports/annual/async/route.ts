/**
 * POST /api/reports/annual/async
 *
 * P-4 Sprint 2: Async-Variante des Annual-Report-PDF-Endpoints.
 * Statt blockierender 30s+ react-pdf-Generierung wird ein Job in die
 * pdf.queue gelegt. Returnt sofort jobId — Client pollt /api/reports/jobs/[id].
 *
 * Body identisch zu /api/reports/annual (sync), nur async.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { apiLogger as logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { enqueueAnnualReportPdfAsync } from "@/lib/queue/queues/pdf.queue";

const sectionsSchema = z.object({
  topology: z.boolean().optional(),
  kpis: z.boolean().optional(),
  monthlyTrend: z.boolean().optional(),
  turbinePerformance: z.boolean().optional(),
  financial: z.boolean().optional(),
  service: z.boolean().optional(),
}).optional();

const schema = z.object({
  parkId: z.string().uuid("Ungültige Park-ID"),
  year: z.number().int().min(2000).max(2100),
  sections: sectionsSchema,
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(PERMISSIONS.REPORTS_CREATE);
    if (!check.authorized) return check.error!;

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Ungültige Eingabe",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { parkId, year, sections } = parsed.data;

    const park = await prisma.park.findFirst({
      where: { id: parkId, tenantId: check.tenantId! },
      select: { id: true, name: true },
    });
    if (!park) {
      return apiError("FORBIDDEN", 404, {
        message: "Windpark nicht gefunden",
      });
    }

    const job = await enqueueAnnualReportPdfAsync(parkId, year, check.tenantId!, {
      requestedBy: check.userId,
      sections,
    });

    logger.info(
      { jobId: job.id, parkId, year, tenantId: check.tenantId },
      "Annual-Report-PDF-Job enqueued",
    );

    return NextResponse.json(
      {
        jobId: job.id,
        status: "queued",
        statusUrl: `/api/reports/jobs/${job.id}`,
        message: "Job in Queue — Status über statusUrl pollen",
      },
      { status: 202 },
    );
  } catch (error) {
    logger.error({ err: error }, "Annual-Report-Async fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, {
      message: "Job-Erzeugung fehlgeschlagen",
    });
  }
}
