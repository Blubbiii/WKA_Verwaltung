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

    const results: Array<{
      stakeholderId: string;
      billingId: string | null;
      success: boolean;
      error?: string;
      feeAmountNet?: number;
    }> = [];

    for (const stakeholder of stakeholders) {
      try {
        const { id, result } = await calculateAndSaveBilling({
          stakeholderId: stakeholder.id,
          year: parsedYear,
          month: parsedMonth,
        });
        results.push({
          stakeholderId: stakeholder.id,
          billingId: id,
          success: true,
          feeAmountNet: result.feeAmountNet,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
        results.push({
          stakeholderId: stakeholder.id,
          billingId: null,
          success: false,
          error: msg,
        });
      }
    }

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
