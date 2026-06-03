/**
 * GET /api/buchhaltung/bwa/multi-year/export/excel?startYear=2022&endYear=2026
 *
 * RA-1: Excel-Export des Mehrjahres-BWA-Trends.
 */

import { NextRequest } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateBwa } from "@/lib/accounting/reports/bwa";
import { generateExcel } from "@/lib/export/excel";
import type { ColumnDef } from "@/lib/export/types";

const MAX_YEARS = 5;

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const currentYear = new Date().getFullYear();
    const startYear = parseInt(searchParams.get("startYear") ?? String(currentYear - 2), 10);
    const endYear = parseInt(searchParams.get("endYear") ?? String(currentYear), 10);

    if (
      !Number.isFinite(startYear) ||
      !Number.isFinite(endYear) ||
      startYear > endYear ||
      endYear - startYear + 1 > MAX_YEARS
    ) {
      return apiError("VALIDATION_FAILED", 400, {
        message: `Ungültiger Zeitraum (max ${MAX_YEARS} Jahre)`,
      });
    }

    const years: number[] = [];
    for (let y = startYear; y <= endYear; y++) years.push(y);

    const results = await Promise.all(
      years.map((y) =>
        generateBwa(
          check.tenantId!,
          new Date(y, 0, 1),
          new Date(y, 11, 31, 23, 59, 59),
        ),
      ),
    );

    const template = results[0]?.lines ?? [];
    const rows = template.map((line, idx) => {
      const row: Record<string, unknown> = { label: line.label };
      years.forEach((y, i) => {
        row[`y${y}`] = results[i]?.lines[idx]?.currentPeriod ?? 0;
      });
      return row;
    });

    const columns: ColumnDef[] = [
      { key: "label", header: "Bezeichnung", width: 50 },
      ...years.map<ColumnDef>((y) => ({
        key: `y${y}`,
        header: `${y} (EUR)`,
        width: 18,
        format: "currency",
      })),
    ];

    const buffer = await generateExcel(
      rows,
      columns,
      `BWA ${startYear}-${endYear}`,
    );

    const filename = `BWA_MultiYear_${startYear}-${endYear}.xlsx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "BWA-Multi-Year-Excel-Export fehlgeschlagen");
    return apiError("PROCESS_FAILED", 500, {
      message: "BWA-Multi-Year-Excel-Export fehlgeschlagen",
    });
  }
}
