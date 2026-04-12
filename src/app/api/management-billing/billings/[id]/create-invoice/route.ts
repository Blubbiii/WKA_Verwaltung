/**
 * Create Invoice from Management Billing
 *
 * POST - Generate an invoice in the provider tenant from a calculated billing
 *
 * Core logic is in @/lib/management-billing/invoice-creator to allow reuse
 * by the combined calculate-and-invoice endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { createInvoiceFromBilling } from "@/lib/management-billing/invoice-creator";
import { apiLogger as logger } from "@/lib/logger";

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return apiError("FEATURE_DISABLED", 404, { message: "Feature nicht aktiviert" });
  }
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission("management-billing:invoice");
    if (!check.authorized) return check.error;

    const featureCheck = await checkFeatureEnabled(check.tenantId);
    if (featureCheck) return featureCheck;

    const { id } = await params;

    // Verify billing exists and belongs to caller's tenant
    const billing = await prisma.managementBilling.findUnique({
      where: { id },
      include: {
        stakeholder: {
          select: { stakeholderTenantId: true },
        },
      },
    });

    if (!billing) {
      return apiError("NOT_FOUND", 404, { message: "Abrechnung nicht gefunden" });
    }

    if (
      !check.tenantId ||
      billing.stakeholder.stakeholderTenantId !== check.tenantId
    ) {
      return apiError("FORBIDDEN", 403, { message: "Keine Berechtigung" });
    }

    // Delegate to shared invoice creation logic
    const result = await createInvoiceFromBilling(id, check.userId!);

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler";
    logger.error(
      { err: error },
      "[Management-Billing] Create invoice error"
    );

    // Return specific status codes for known validation errors
    if (
      message.includes("Status") ||
      message.includes("bereits erstellt")
    ) {
      return apiError("BAD_REQUEST", 400, { message });
    }

    return apiError("CREATE_FAILED", 500, {
      message: `Fehler beim Erstellen der Rechnung: ${message}`,
    });
  }
}
