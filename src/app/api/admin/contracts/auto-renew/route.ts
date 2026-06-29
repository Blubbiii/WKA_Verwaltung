/**
 * API Route: /api/admin/contracts/auto-renew
 *
 * POST: Trigger automatic contract renewal check.
 *
 * Finds contracts with autoRenewal=true that are expiring within 30 days
 * and creates renewal drafts. Safe to call multiple times (idempotent).
 *
 * Permission: contracts:create
 */

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { processAutoRenewals } from "@/lib/contracts/auto-renewal";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

export async function POST() {
  try {
    const check = await requirePermission(PERMISSIONS.CONTRACTS_CREATE);
    if (!check.authorized) return check.error;

    logger.info(
      { tenantId: check.tenantId, userId: check.userId },
      "Auto-renewal triggered"
    );

    const result = await processAutoRenewals(check.tenantId);

    const success = result.errors.length === 0;

    return NextResponse.json({
      success,
      message: success
        ? `${result.renewalsCreated} Verlängerung(en) erstellt (${result.processed} geprüft).`
        : `${result.renewalsCreated} Verlängerung(en) erstellt, ${result.errors.length} Fehler.`,
      ...result,
    });
  } catch (error) {
    logger.error({ err: error }, "Error processing auto-renewals");

    const errorMessage =
      error instanceof Error ? error.message : "Unbekannter Fehler";

    return apiError("INTERNAL_ERROR", 500, {
      message: errorMessage || "Fehler bei der automatischen Vertragsverlängerung.",
      details: { processed: 0, renewalsCreated: 0, errors: [] },
    });
  }
}
