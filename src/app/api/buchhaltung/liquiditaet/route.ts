import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateLiquidityForecast } from "@/lib/accounting/reports/liquidity";

// GET /api/buchhaltung/liquiditaet?months=12&granularity=monthly&startingBalance=0&budgetId=xxx
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const months = parseInt(searchParams.get("months") || "12", 10);
    const granularity = (searchParams.get("granularity") || "monthly") as "weekly" | "monthly";
    const startingBalance = parseFloat(searchParams.get("startingBalance") || "0");
    const budgetId = searchParams.get("budgetId") || undefined;

    const startDate = new Date();
    startDate.setDate(1); // Start from 1st of current month
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months);
    endDate.setDate(0); // Last day of final month
    endDate.setHours(23, 59, 59);

    const result = await generateLiquidityForecast(
      check.tenantId!,
      startDate,
      endDate,
      granularity,
      startingBalance,
      budgetId
    );

    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error({ err: error }, "Error generating liquidity forecast");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}
