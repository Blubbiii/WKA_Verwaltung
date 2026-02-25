/**
 * Combined Calculate + Invoice Endpoint for Management Billing
 *
 * POST - Calculate a billing and immediately create an invoice in one step.
 * This avoids the two-request round-trip of POST /billings then POST /billings/:id/create-invoice.
 *
 * Required permission: management-billing:calculate
 * Body: { stakeholderId: string, year: number, month?: number }
 * Returns: { billingId, invoiceId, invoiceNumber, grossAmount }
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { createInvoiceFromBilling } from "@/lib/management-billing/invoice-creator";
import { apiLogger as logger } from "@/lib/logger";

async function checkFeatureEnabled(
  tenantId?: string | null
): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean(
    "management-billing.enabled",
    tenantId,
    false
  );
  if (!enabled) {
    return NextResponse.json(
      { error: "Feature nicht aktiviert" },
      { status: 404 }
    );
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
    const { stakeholderId, year, month } = body;

    if (!stakeholderId || !year) {
      return NextResponse.json(
        { error: "stakeholderId und year sind erforderlich" },
        { status: 400 }
      );
    }

    // Verify stakeholder exists and belongs to user's tenant
    const stakeholder = await prisma.parkStakeholder.findUnique({
      where: { id: stakeholderId },
    });

    if (!stakeholder) {
      return NextResponse.json(
        { error: "Stakeholder nicht gefunden" },
        { status: 404 }
      );
    }

    if (check.tenantId && stakeholder.stakeholderTenantId !== check.tenantId) {
      return NextResponse.json(
        { error: "Keine Berechtigung" },
        { status: 403 }
      );
    }

    if (!stakeholder.billingEnabled) {
      return NextResponse.json(
        { error: "Abrechnung für diesen Stakeholder nicht aktiviert" },
        { status: 400 }
      );
    }

    // Step 1: Calculate and save the billing
    const { calculateAndSaveBilling } = await import(
      "@/lib/management-billing/calculator"
    );

    const { id: billingId, result } = await calculateAndSaveBilling({
      stakeholderId,
      year: parseInt(year, 10),
      month: month !== undefined && month !== null ? parseInt(month, 10) : null,
    });

    logger.info(
      { billingId, stakeholderId, year, month },
      "[Management-Billing] Billing calculated (combined flow)"
    );

    // Step 2: Create the invoice from the freshly calculated billing
    const invoiceResult = await createInvoiceFromBilling(
      billingId,
      check.userId!
    );

    logger.info(
      {
        billingId,
        invoiceId: invoiceResult.invoiceId,
        invoiceNumber: invoiceResult.invoiceNumber,
      },
      "[Management-Billing] Invoice created (combined flow)"
    );

    return NextResponse.json(
      {
        billingId,
        invoiceId: invoiceResult.invoiceId,
        invoiceNumber: invoiceResult.invoiceNumber,
        grossAmount: invoiceResult.grossAmount,
      },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter Fehler";
    logger.error(
      { err: error },
      "[Management-Billing] Calculate-and-invoice error"
    );
    return NextResponse.json(
      { error: `Fehler bei Berechnung und Rechnungserstellung: ${message}` },
      { status: 500 }
    );
  }
}
