import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { generateBudgetComparison } from "@/lib/accounting/reports/budget-comparison";

// GET /api/buchhaltung/budget-vergleich?budgetId=xxx&fromMonth=1&toMonth=12
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("accounting:read");
    if (!check.authorized) return check.error;

    const { searchParams } = new URL(request.url);
    const budgetId = searchParams.get("budgetId");

    if (!budgetId) {
      return apiError("BAD_REQUEST", 400, { message: "budgetId ist erforderlich" });
    }

    const fromMonth = searchParams.get("fromMonth") ? parseInt(searchParams.get("fromMonth")!) : undefined;
    const toMonth = searchParams.get("toMonth") ? parseInt(searchParams.get("toMonth")!) : undefined;

    const result = await generateBudgetComparison(check.tenantId!, budgetId, fromMonth, toMonth);

    if (!result) {
      return apiError("NOT_FOUND", 404, { message: "Budget nicht gefunden" });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error({ err: error }, "Error generating Budget-Vergleich");
    return apiError("INTERNAL_ERROR", 500, { message: "Interner Serverfehler" });
  }
}
