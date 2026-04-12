/**
 * Batch Calculate Management Billings
 *
 * POST - Calculate billings for all active stakeholders for a given period
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { Prisma } from "@prisma/client";
import { apiLogger as logger } from "@/lib/logger";
import { z } from "zod";

const batchCalculateSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12).nullish(),
});

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return apiError("FEATURE_DISABLED", 404, { message: "Feature nicht aktiviert" });
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
    const parsed = batchCalculateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("VALIDATION_FAILED", 400, { message: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors });
    }

    const parsedYear = parsed.data.year;
    const parsedMonth = parsed.data.month ?? null;

    // Find all active stakeholders with billing enabled
    const where: Prisma.ParkStakeholderWhereInput = {
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
    return apiError("INTERNAL_ERROR", 500, { message: "Fehler bei der Batch-Berechnung" });
  }
}
