/**
 * Shared invoice creation logic for Management Billing.
 *
 * Extracted from the create-invoice API route so it can be reused by
 * the combined calculate-and-invoice endpoint without duplicating code.
 */

import { prisma } from "@/lib/prisma";
import { getClientFundDetails } from "./cross-tenant-access";
import { apiLogger as logger } from "@/lib/logger";

export interface CreateInvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
  grossAmount: number;
}

/**
 * Create an invoice from a calculated ManagementBilling record.
 *
 * This function encapsulates the full invoice creation flow:
 *  1. Load billing with stakeholder data
 *  2. Verify status is CALCULATED and no invoice exists yet
 *  3. Resolve park name and recipient fund details (cross-tenant)
 *  4. Generate invoice number from tenant sequence
 *  5. Create Invoice with one line item
 *  6. Update billing status to INVOICED
 *
 * @param billingId - The ID of the ManagementBilling record
 * @param userId    - The authenticated user who triggers the creation
 */
export async function createInvoiceFromBilling(
  billingId: string,
  userId: string
): Promise<CreateInvoiceResult> {
  // 1. Load billing with stakeholder
  const billing = await prisma.managementBilling.findUnique({
    where: { id: billingId },
    include: {
      stakeholder: {
        include: {
          stakeholderTenant: true,
        },
      },
    },
  });

  if (!billing) {
    throw new Error("Abrechnung nicht gefunden");
  }

  if (billing.status !== "CALCULATED") {
    throw new Error(
      `Abrechnung hat Status "${billing.status}", erwartet "CALCULATED"`
    );
  }

  if (billing.invoiceId) {
    throw new Error("Rechnung wurde bereits erstellt");
  }

  // 2. Get park name
  const park = await prisma.park.findFirst({
    where: {
      id: billing.stakeholder.parkId,
      tenantId: billing.stakeholder.parkTenantId,
    },
    select: { name: true },
  });

  // 3. Get recipient fund details (cross-tenant)
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

  // 4. Determine description based on stakeholder role
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

  // 5. Generate invoice number using existing sequence
  const sequence = await prisma.invoiceNumberSequence.findFirst({
    where: { tenantId: providerTenantId, type: "INVOICE" },
  });

  let invoiceNumber: string;
  if (sequence) {
    const currentYear = new Date().getFullYear();
    const nextNum =
      sequence.currentYear < currentYear ? 1 : sequence.nextNumber;

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

  // 6. Create the invoice in the provider tenant
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: providerTenantId,
      invoiceType: "INVOICE",
      invoiceNumber,
      invoiceDate: new Date(),
      dueDate: new Date(
        Date.now() +
          ((
            billing.stakeholder.stakeholderTenant.settings as Record<
              string,
              unknown
            >
          )?.paymentTermDays as number ?? 14) *
            86400000
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
      createdById: userId,
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

  // 7. Update billing with invoice reference and set status to INVOICED
  await prisma.managementBilling.update({
    where: { id: billingId },
    data: {
      status: "INVOICED",
      invoiceId: invoice.id,
    },
  });

  logger.info(
    { billingId, invoiceId: invoice.id, invoiceNumber },
    "[Management-Billing] Invoice created from billing"
  );

  return {
    invoiceId: invoice.id,
    invoiceNumber,
    grossAmount: Number(billing.feeAmountGrossEur),
  };
}
