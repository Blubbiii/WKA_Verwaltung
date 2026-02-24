/**
 * Create Invoice from Management Billing
 *
 * POST - Generate an invoice in the provider tenant from a calculated billing
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { getConfigBoolean } from "@/lib/config";
import { getClientFundDetails } from "@/lib/management-billing/cross-tenant-access";
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

    // Load billing with stakeholder
    const billing = await prisma.managementBilling.findUnique({
      where: { id },
      include: {
        stakeholder: {
          include: {
            stakeholderTenant: true,
          },
        },
      },
    });

    if (!billing) {
      return NextResponse.json(
        { error: "Abrechnung nicht gefunden" },
        { status: 404 }
      );
    }

    // Access control
    if (
      check.tenantId &&
      billing.stakeholder.stakeholderTenantId !== check.tenantId
    ) {
      return NextResponse.json({ error: "Keine Berechtigung" }, { status: 403 });
    }

    if (billing.status !== "CALCULATED") {
      return NextResponse.json(
        {
          error: `Abrechnung hat Status "${billing.status}", erwartet "CALCULATED"`,
        },
        { status: 400 }
      );
    }

    if (billing.invoiceId) {
      return NextResponse.json(
        { error: "Rechnung wurde bereits erstellt" },
        { status: 409 }
      );
    }

    // Get park name
    const park = await prisma.park.findFirst({
      where: {
        id: billing.stakeholder.parkId,
        tenantId: billing.stakeholder.parkTenantId,
      },
      select: { name: true },
    });

    // Get recipient fund details (cross-tenant)
    // For BF billings, we bill each visible fund or the first one
    const details = billing.calculationDetails as
      | Array<{ fundId: string; fundName: string }>
      | null;

    let recipientName = "Betreibergesellschaft";
    let recipientAddress = "";

    if (details && details.length > 0) {
      const fundDetail = await getClientFundDetails(
        billing.stakeholderId,
        details[0].fundId
      );
      if (fundDetail) {
        recipientName = fundDetail.name;
        const parts = [
          fundDetail.street,
          fundDetail.houseNumber,
          [fundDetail.postalCode, fundDetail.city].filter(Boolean).join(" "),
        ].filter(Boolean);
        recipientAddress = parts.join(", ");
      } else {
        recipientName = details[0].fundName;
      }
    }

    const providerTenantId = billing.stakeholder.stakeholderTenantId;

    // Determine the description based on role
    const roleLabel =
      billing.stakeholder.role === "TECHNICAL_BF"
        ? "technischen Betriebsführung"
        : billing.stakeholder.role === "COMMERCIAL_BF"
          ? "kaufmaennischen Betreuung"
          : "Betriebsführung";

    const periodLabel = billing.month
      ? `${String(billing.month).padStart(2, "0")}/${billing.year}`
      : `${billing.year}`;

    const parkName = park?.name || "Windpark";
    const feePercent = Number(billing.feePercentageUsed);
    const baseRevenue = Number(billing.baseRevenueEur);

    // Generate invoice number using existing sequence
    const sequence = await prisma.invoiceNumberSequence.findFirst({
      where: { tenantId: providerTenantId, type: "INVOICE" },
    });

    let invoiceNumber: string;
    if (sequence) {
      const currentYear = new Date().getFullYear();
      const nextNum = sequence.currentYear < currentYear ? 1 : sequence.nextNumber;

      invoiceNumber = sequence.format
        .replace("{YEAR}", String(currentYear))
        .replace("{NUMBER}", String(nextNum).padStart(sequence.digitCount, "0"));

      await prisma.invoiceNumberSequence.update({
        where: { id: sequence.id },
        data: {
          nextNumber: nextNum + 1,
          currentYear: currentYear,
        },
      });
    } else {
      // Fallback: simple numbering
      const count = await prisma.invoice.count({
        where: { tenantId: providerTenantId },
      });
      invoiceNumber = `RE-${billing.year}-${String(count + 1).padStart(4, "0")}`;
    }

    // Create the invoice in the provider tenant
    const invoice = await prisma.invoice.create({
      data: {
        tenantId: providerTenantId,
        invoiceType: "INVOICE",
        invoiceNumber,
        invoiceDate: new Date(),
        dueDate: new Date(
          Date.now() +
            ((billing.stakeholder.stakeholderTenant.settings as Record<string, unknown>)
              ?.paymentTermDays as number ?? 14) * 86400000
        ),
        recipientType: "fund",
        recipientName,
        recipientAddress,
        netAmount: billing.feeAmountNetEur,
        taxRate: billing.taxRate,
        taxAmount: billing.taxAmountEur,
        grossAmount: billing.feeAmountGrossEur,
        currency: "EUR",
        status: "DRAFT",
        serviceStartDate: billing.month
          ? new Date(billing.year, billing.month - 1, 1)
          : new Date(billing.year, 0, 1),
        serviceEndDate: billing.month
          ? new Date(billing.year, billing.month, 0)
          : new Date(billing.year, 11, 31),
        notes: `Betriebsführung - ${parkName} - ${periodLabel} (Leistungszeitraum)`,
        createdById: check.userId!,
        items: {
          create: [
            {
              position: 1,
              description: `Kosten der ${roleLabel} über ${feePercent.toFixed(2).replace(".", ",")} % Ihrer oben genannten Einspeisevergütung`,
              quantity: 1,
              unit: "pauschal",
              unitPrice: billing.feeAmountNetEur,
              netAmount: billing.feeAmountNetEur,
              taxType: billing.stakeholder.taxType || "STANDARD",
              taxRate: billing.taxRate,
              taxAmount: billing.taxAmountEur,
              grossAmount: billing.feeAmountGrossEur,
            },
          ],
        },
      },
    });

    // Update billing with invoice reference
    await prisma.managementBilling.update({
      where: { id },
      data: {
        status: "INVOICED",
        invoiceId: invoice.id,
      },
    });

    logger.info(
      { billingId: id, invoiceId: invoice.id, invoiceNumber },
      "[Management-Billing] Invoice created from billing"
    );

    return NextResponse.json({
      invoiceId: invoice.id,
      invoiceNumber,
      grossAmount: Number(billing.feeAmountGrossEur),
    });
  } catch (error) {
    logger.error(
      { err: error },
      "[Management-Billing] Create invoice error"
    );
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Rechnung" },
      { status: 500 }
    );
  }
}
