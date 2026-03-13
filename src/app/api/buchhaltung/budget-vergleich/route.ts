import { NextRequest, NextResponse } from "next/server";
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
      return NextResponse.json({ error: "budgetId ist erforderlich" }, { status: 400 });
    }

    const fromMonth = searchParams.get("fromMonth") ? parseInt(searchParams.get("fromMonth")!) : undefined;
    const toMonth = searchParams.get("toMonth") ? parseInt(searchParams.get("toMonth")!) : undefined;

    const result = await generateBudgetComparison(check.tenantId!, budgetId, fromMonth, toMonth);

    if (!result) {
      return NextResponse.json({ error: "Budget nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error({ err: error }, "Error generating Budget-Vergleich");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
