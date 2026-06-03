/**
 * GET /api/buchhaltung/guv/export/excel?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * F-4 Sprint 4: Excel-Export der GuV (HGB §275 Gesamtkostenverfahren).
 * Spalten: Pos., Bezeichnung, Aktuelle Periode (€), Vorjahres-Periode (€).
 */

import { NextRequest } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateGuv } from "@/lib/accounting/reports/guv";
import { generateExcel } from "@/lib/export/excel";
import type { ColumnDef } from "@/lib/export/types";

const guvColumns: ColumnDef[] = [
  { key: "position", header: "Pos.", width: 8 },
  { key: "label", header: "Bezeichnung", width: 50 },
  { key: "currentPeriod", header: "Akt. Periode (€)", width: 18, format: "currency" },
  { key: "previousPeriod", header: "Vorperiode (€)", width: 18, format: "currency" },
];

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

    const result = await generateGuv(check.tenantId!, periodStart, periodEnd);

    const buffer = await generateExcel(
      result.lines as unknown as Record<string, unknown>[],
      guvColumns,
      `GuV ${periodStart.getFullYear()}`,
    );

    const filename = `GuV_${periodStart.toISOString().slice(0, 10)}_${periodEnd.toISOString().slice(0, 10)}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "GuV-Excel-Export fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "GuV-Excel-Export fehlgeschlagen" });
  }
}
