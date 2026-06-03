/**
 * GET /api/buchhaltung/guv/multi-year?startYear=2022&endYear=2026
 *
 * RA-1: Mehrjahres-Trend GuV (3-5 Jahre nebeneinander).
 * Lädt parallel mehrere `generateGuv()`-Calls (per-Jahr-Cache greift).
 *
 * Response shape:
 * {
 *   data: {
 *     years: [2022, 2023, 2024, 2025, 2026],
 *     rows: [
 *       { position, label, isSummary, indent, values: [{year, amount}, ...] }
 *     ],
 *     netIncomeByYear: [{year, amount}, ...]
 *   }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateGuv, type GuvLine } from "@/lib/accounting/reports/guv";

const MAX_YEARS = 5;

interface MultiYearRow {
  position: number;
  label: string;
  isSummary?: boolean;
  indent?: number;
  values: { year: number; amount: number }[];
}

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const startYearStr = searchParams.get("startYear");
    const endYearStr = searchParams.get("endYear");

    const currentYear = new Date().getFullYear();
    const startYear = startYearStr ? parseInt(startYearStr, 10) : currentYear - 2;
    const endYear = endYearStr ? parseInt(endYearStr, 10) : currentYear;

    if (
      !Number.isFinite(startYear) ||
      !Number.isFinite(endYear) ||
      startYear > endYear ||
      startYear < 1900 ||
      endYear > 2200
    ) {
      return apiError("VALIDATION_FAILED", 400, {
        message: "Ungültige Jahresangabe (startYear/endYear)",
      });
    }

    if (endYear - startYear + 1 > MAX_YEARS) {
      return apiError("VALIDATION_FAILED", 400, {
        message: `Maximal ${MAX_YEARS} Jahre erlaubt`,
      });
    }

    const years: number[] = [];
    for (let y = startYear; y <= endYear; y++) years.push(y);

    // Parallele Calls — Reports sind via getCachedReport pro Periode gecached.
    const results = await Promise.all(
      years.map((y) =>
        generateGuv(
          check.tenantId!,
          new Date(y, 0, 1),
          new Date(y, 11, 31, 23, 59, 59),
        ),
      ),
    );

    // Pivot: 1 Zeile pro Position, N Spalten pro Jahr.
    // Wir verwenden die Lines-Struktur des ersten Jahres als Template,
    // da generateGuv für jedes Jahr dieselben Positionen erzeugt.
    const template: GuvLine[] = results[0]?.lines ?? [];
    const rows: MultiYearRow[] = template.map((line, idx) => ({
      position: line.position,
      label: line.label,
      isSummary: line.isSummary,
      indent: line.indent,
      values: years.map((y, i) => ({
        year: y,
        amount: results[i]?.lines[idx]?.currentPeriod ?? 0,
      })),
    }));

    const netIncomeByYear = years.map((y, i) => ({
      year: y,
      amount: results[i]?.netIncome ?? 0,
    }));

    return NextResponse.json({
      data: {
        years,
        rows,
        netIncomeByYear,
      },
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating multi-year GuV");
    return apiError("INTERNAL_ERROR", 500, {
      message: "Interner Serverfehler",
    });
  }
}
