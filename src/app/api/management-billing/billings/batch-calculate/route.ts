/**
 * Batch Calculate Management Billings
 *
 * POST - Calculate billings for all active stakeholders for a given period
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { apiLogger as logger } from "@/lib/logger";

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return NextResponse.json({ error: "Feature nicht aktiviert" }, { status: 404 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission("management-billing:calculate");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const body = await request.json();
    const { year, month } = body;

    if (!year) {
      return NextResponse.json(
        { error: "year ist erforderlich" },
        { status: 400 }
      );
    }

    const parsedYear = parseInt(year, 10);
    const parsedMonth =
      month !== undefined && month !== null ? parseInt(month, 10) : null;

    // Find all active stakeholders with billing enabled
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      isActive: true,
      billingEnabled: true,
    };

    // Non-superadmin: only own tenant's stakeholders
    if (check.tenantId) {
      where.stakeholderTenantId = check.tenantId;
    }

    const stakeholders = await prisma.parkStakeholder.findMany({ where });

    const { calculateAndSaveBilling } = await import(
      "@/lib/management-billing/calculator"
    );

    type BatchResult = {
      stakeholderId: string;
      billingId: string | null;
      success: boolean;
      error?: string;
      feeAmountNet?: number;
    };

    // Simple concurrency limiter to avoid overwhelming the database
    async function parallelLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
      const results: PromiseSettledResult<T>[] = [];
      const executing: Promise<void>[] = [];
      for (const task of tasks) {
        const p = task().then(
          (value) => { results.push({ status: "fulfilled", value }); },
          (reason) => { results.push({ status: "rejected", reason }); }
        ).then(() => { executing.splice(executing.indexOf(p), 1); });
        executing.push(p);
        if (executing.length >= limit) await Promise.race(executing);
      }
      await Promise.all(executing);
      return results;
    }

    const tasks = stakeholders.map((stakeholder) => async (): Promise<BatchResult> => {
      try {
        const { id, result } = await calculateAndSaveBilling({
          stakeholderId: stakeholder.id,
          year: parsedYear,
          month: parsedMonth,
        });
        return {
          stakeholderId: stakeholder.id,
          billingId: id,
          success: true,
          feeAmountNet: result.feeAmountNet,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
        return {
          stakeholderId: stakeholder.id,
          billingId: null,
          success: false,
          error: msg,
        };
      }
    });

    const settled = await parallelLimit(tasks, 5);
    const results = settled
      .filter((r): r is PromiseSettledResult<BatchResult> & { status: "fulfilled" } => r.status === "fulfilled")
      .map((r) => r.value);

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    logger.info(
      { year: parsedYear, month: parsedMonth, successCount, failCount },
      "[Management-Billing] Batch calculation completed"
    );

    return NextResponse.json({
      totalProcessed: results.length,
      successCount,
      failCount,
      results,
    });
  } catch (error) {
    logger.error({ err: error }, "[Management-Billing] Batch calculate error");
    return NextResponse.json(
      { error: "Fehler bei der Batch-Berechnung" },
      { status: 500 }
    );
  }
}
