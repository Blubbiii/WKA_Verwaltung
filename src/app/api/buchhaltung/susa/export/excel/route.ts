/**
 * GET /api/buchhaltung/susa/export/excel?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * F-4 Sprint 4: Excel-Export der Summen- und Saldenliste mit Totals-Zeile.
 */

import { NextRequest } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateSuSa } from "@/lib/accounting/reports/susa";
import { generateExcel } from "@/lib/export/excel";
import type { ColumnDef } from "@/lib/export/types";

const susaColumns: ColumnDef[] = [
  { key: "accountNumber", header: "Konto", width: 12 },
  { key: "accountName", header: "Bezeichnung", width: 35 },
  { key: "category", header: "Kategorie", width: 14 },
  { key: "openingDebit", header: "EB Soll (€)", width: 16, format: "currency" },
  { key: "openingCredit", header: "EB Haben (€)", width: 16, format: "currency" },
  { key: "periodDebit", header: "Periode Soll (€)", width: 18, format: "currency" },
  { key: "periodCredit", header: "Periode Haben (€)", width: 18, format: "currency" },
  { key: "closingDebit", header: "SB Soll (€)", width: 16, format: "currency" },
  { key: "closingCredit", header: "SB Haben (€)", width: 16, format: "currency" },
  { key: "balance", header: "Saldo (€)", width: 16, format: "currency" },
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

    const result = await generateSuSa(check.tenantId!, periodStart, periodEnd);

    // Totals-Zeile anfügen
    const rowsWithTotals = [
      ...result.rows,
      {
        accountNumber: "",
        accountName: "SUMME",
        category: "",
        openingDebit: result.rows.reduce((s, r) => s + r.openingDebit, 0),
        openingCredit: result.rows.reduce((s, r) => s + r.openingCredit, 0),
        periodDebit: result.totalDebit,
        periodCredit: result.totalCredit,
        closingDebit: result.rows.reduce((s, r) => s + r.closingDebit, 0),
        closingCredit: result.rows.reduce((s, r) => s + r.closingCredit, 0),
        balance: result.rows.reduce((s, r) => s + r.balance, 0),
      },
    ];

    const buffer = await generateExcel(
      rowsWithTotals as unknown as Record<string, unknown>[],
      susaColumns,
      `SuSa ${periodStart.getFullYear()}`,
    );

    const filename = `SuSa_${periodStart.toISOString().slice(0, 10)}_${periodEnd.toISOString().slice(0, 10)}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "SuSa-Excel-Export fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, { message: "SuSa-Excel-Export fehlgeschlagen" });
  }
}
