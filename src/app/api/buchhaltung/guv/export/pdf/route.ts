/**
 * GET /api/buchhaltung/guv/export/pdf?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * F-1 Sprint 4: PDF-Export der GuV mit Vorjahresvergleich.
 * Steuerberater-Standardformat (§275 HGB).
 */

import { NextRequest } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateGuv } from "@/lib/accounting/reports/guv";
import { generateGuvPdf } from "@/lib/pdf/generators/guvPdf";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const now = new Date();
    const periodStart = from ? new Date(from) : new Date(now.getFullYear(), 0, 1);
    const periodEnd = to ? new Date(to) : new Date(now.getFullYear(), 11, 31, 23, 59, 59);

    const [result, tenant] = await Promise.all([
      generateGuv(check.tenantId!, periodStart, periodEnd),
      prisma.tenant.findUnique({
        where: { id: check.tenantId! },
        select: { name: true },
      }),
    ]);

    // Vorperiode berechnen (gleiche Länge, davor)
    const periodMs = periodEnd.getTime() - periodStart.getTime();
    const previousEnd = new Date(periodStart.getTime() - 1);
    const previousStart = new Date(periodStart.getTime() - 1 - periodMs);

    const buffer = await generateGuvPdf({
      companyName: tenant?.name ?? "Mandant",
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      previousPeriodStart: previousStart.toISOString(),
      previousPeriodEnd: previousEnd.toISOString(),
      lines: result.lines.map((l) => ({
        position: l.position,
        label: l.label,
        currentPeriod: l.currentPeriod,
        previousPeriod: l.previousPeriod,
        isSummary: l.isSummary,
        indent: l.indent,
      })),
      netIncome: result.netIncome,
      previousNetIncome: result.previousNetIncome,
    });

    const filename = `GuV_${periodStart.toISOString().slice(0, 10)}_${periodEnd.toISOString().slice(0, 10)}.pdf`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "GuV-PDF-Export fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "GuV-PDF-Export fehlgeschlagen" });
  }
}
