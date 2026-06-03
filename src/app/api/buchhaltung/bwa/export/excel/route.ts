/**
 * GET /api/buchhaltung/bwa/export/excel?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * F-4 Sprint 4: Excel-Export der BWA mit Vorjahresvergleich + YTD.
 */

import { NextRequest } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateBwa } from "@/lib/accounting/reports/bwa";
import { generateExcel } from "@/lib/export/excel";
import type { ColumnDef } from "@/lib/export/types";

const bwaColumns: ColumnDef[] = [
  { key: "label", header: "Bezeichnung", width: 40 },
  { key: "currentPeriod", header: "Aktuelle Periode (€)", width: 20, format: "currency" },
  { key: "previousPeriod", header: "Vorperiode (€)", width: 20, format: "currency" },
  { key: "ytd", header: "YTD (€)", width: 18, format: "currency" },
  { key: "previousYtd", header: "Vorjahres-YTD (€)", width: 22, format: "currency" },
];

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const now = new Date();
    const periodStart = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = to ? new Date(to) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const result = await generateBwa(check.tenantId!, periodStart, periodEnd);

    const buffer = await generateExcel(
      result.lines as unknown as Record<string, unknown>[],
      bwaColumns,
      "BWA",
    );

    const filename = `BWA_${periodStart.toISOString().slice(0, 10)}_${periodEnd.toISOString().slice(0, 10)}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "BWA-Excel-Export fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "BWA-Excel-Export fehlgeschlagen" });
  }
}
