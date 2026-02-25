/**
 * Create Invoice from Management Billing
 *
 * POST - Generate an invoice in the provider tenant from a calculated billing
 *
 * Core logic is in @/lib/management-billing/invoice-creator to allow reuse
 * by the combined calculate-and-invoice endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { createInvoiceFromBilling } from "@/lib/management-billing/invoice-creator";
import { apiLogger as logger } from "@/lib/logger";

async function checkFeatureEnabled(tenantId?: string | null): Promise<NextResponse | null> {
  const enabled = await getConfigBoolean("management-billing.enabled", tenantId, false);
  if (!enabled) {
    return NextResponse.json({ error: "Feature nicht aktiviert" }, { status: 404 });
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
      return NextResponse.json(
        { error: "Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    if (
      check.tenantId &&
      billing.stakeholder.stakeholderTenantId !== check.tenantId
    ) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
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
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json(
      { error: `Fehler beim Erstellen der Rechnung: ${message}` },
      { status: 500 }
    );
  }
}
