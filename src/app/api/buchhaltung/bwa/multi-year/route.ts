/**
 * GET /api/buchhaltung/bwa/multi-year?startYear=2022&endYear=2026
 *
 * RA-1: Mehrjahres-Trend BWA (3-5 Jahre nebeneinander, jeweils Vollyear).
 * Lädt parallel mehrere `generateBwa()`-Calls (per-Periode-Cache greift).
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateBwa, type BwaLine } from "@/lib/accounting/reports/bwa";

const MAX_YEARS = 5;

interface MultiYearRow {
  label: string;
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

    const results = await Promise.all(
      years.map((y) =>
        generateBwa(
          check.tenantId!,
          new Date(y, 0, 1),
          new Date(y, 11, 31, 23, 59, 59),
        ),
      ),
    );

    const template: BwaLine[] = results[0]?.lines ?? [];
    const rows: MultiYearRow[] = template.map((line, idx) => ({
      label: line.label,
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
      data: { years, rows, netIncomeByYear },
    });
  } catch (error) {
    logger.error({ err: error }, "Error generating multi-year BWA");
    return apiError("INTERNAL_ERROR", 500, {
      message: "Interner Serverfehler",
    });
  }
}
