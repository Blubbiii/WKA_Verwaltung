/**
 * Invoice Mapper
 *
 * Maps Prisma Invoice model data (with relations) to XRechnungInvoiceData
 * for XML generation.
 */

import type {
  XRechnungInvoiceData,
  XRechnungParty,
  XRechnungLineItem,
} from "./xrechnung-generator";
import { mapTaxTypeToCategory, mapUnitCode } from "./xrechnung-generator";

// ============================================================================
// TYPES for Prisma Invoice with relations (as returned by API)
// ============================================================================

interface InvoiceWithRelations {
  id: string;
  invoiceType: string; // "INVOICE" | "CREDIT_NOTE"
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date | null;
  currency: string;
  netAmount: unknown; // Prisma Decimal
  taxAmount: unknown; // Prisma Decimal | null
  grossAmount: unknown; // Prisma Decimal
  recipientName: string | null;
  recipientAddress: string | null;
  paymentReference: string | null;
  serviceStartDate: Date | null;
  serviceEndDate: Date | null;
  notes: string | null;
  leitwegId?: string | null;
  items: Array<{
    id: string;
    position: number;
    description: string;
    quantity: unknown; // Prisma Decimal
    unit: string | null;
    unitPrice: unknown; // Prisma Decimal
    netAmount: unknown; // Prisma Decimal
    taxType: string;
    taxRate: unknown; // Prisma Decimal
    taxAmount: unknown; // Prisma Decimal
    grossAmount: unknown; // Prisma Decimal
  }>;
  tenant: {
    name: string;
    address: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    bankName: string | null;
    iban: string | null;
    bic: string | null;
    taxId: string | null;
    vatId: string | null;
  };
  fund?: {
    name: string;
  } | null;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Convert Prisma Decimal or number to a plain number
 */
function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return Number(value);
}

/**
 * Parse a multi-line address string into structured parts
 * Expected formats:
 *   "Street\nPLZ City"
 *   "Street\nPLZ City\nCountry"
 *   "Street, PLZ City"
 */
function parseAddress(address: string | null): {
  street: string | null;
  postalCode: string | null;
  city: string | null;
} {
  if (!address) {
    return { street: null, postalCode: null, city: null };
  }

  // Split by newline or comma
  const lines = address.split(/[\n,]/).map((l) => l.trim()).filter(Boolean);

  if (lines.length === 0) {
    return { street: null, postalCode: null, city: null };
  }

  const street = lines[0] || null;

  // Try to extract PLZ + City from second line
  if (lines.length >= 2) {
    const plzCityMatch = lines[1].match(/^(\d{4,5})\s+(.+)$/);
    if (plzCityMatch) {
      return {
        street,
        postalCode: plzCityMatch[1],
        city: plzCityMatch[2],
      };
    }
    return { street, postalCode: null, city: lines[1] };
  }

  return { street, postalCode: null, city: null };
}

/**
 * Parse the tenant address (single string field)
 */
function parseTenantAddress(address: string | null): {
  street: string | null;
  postalCode: string | null;
  city: string | null;
} {
  return parseAddress(address);
}

// ============================================================================
// MAIN MAPPER
// ============================================================================

/**
 * Build XRechnungInvoiceData from a Prisma Invoice with full relations.
 *
 * This maps all relevant invoice data to the format expected by the
 * XRechnung and ZUGFeRD XML generators.
 */
export function buildXRechnungDataFromInvoice(
  invoice: InvoiceWithRelations,
  options?: { taxExemptNote?: string }
): XRechnungInvoiceData {
  const tenant = invoice.tenant;
  const tenantAddress = parseTenantAddress(tenant.address);
  const recipientAddress = parseAddress(invoice.recipientAddress);

  // Build supplier party from tenant data
  const supplier: XRechnungParty = {
    name: tenant.name,
    street: tenantAddress.street,
    postalCode: tenantAddress.postalCode,
    city: tenantAddress.city,
    countryCode: "DE",
    taxId: tenant.taxId,
    vatId: tenant.vatId,
    email: tenant.contactEmail,
    phone: tenant.contactPhone,
  };

  // Build customer party from recipient data
  const customer: XRechnungParty = {
    name: invoice.recipientName || "Unbekannter Empfänger",
    street: recipientAddress.street,
    postalCode: recipientAddress.postalCode,
    city: recipientAddress.city,
    countryCode: "DE",
    taxId: null, // Customer tax ID not stored in current model
    vatId: null,
    email: null,
    phone: null,
  };

  // Map invoice line items
  const lines: XRechnungLineItem[] = invoice.items.map((item) => {
    const taxCat = mapTaxTypeToCategory(item.taxType);
    return {
      id: String(item.position),
      description: item.description,
      quantity: toNumber(item.quantity),
      unit: mapUnitCode(item.unit),
      unitPrice: toNumber(item.unitPrice),
      netAmount: toNumber(item.netAmount),
      taxCategoryId: taxCat.id,
      taxPercent: toNumber(item.taxRate),
    };
  });

  // Determine invoice type code
  const invoiceTypeCode = invoice.invoiceType === "CREDIT_NOTE" ? "381" : "380";

  // Build payment account from tenant bank data
  const paymentAccount =
    tenant.iban
      ? {
          iban: tenant.iban,
          bic: tenant.bic,
          bankName: tenant.bankName,
        }
      : null;

  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: new Date(invoice.invoiceDate),
    dueDate: invoice.dueDate ? new Date(invoice.dueDate) : null,
    invoiceTypeCode: invoiceTypeCode as "380" | "381",
    currency: invoice.currency || "EUR",
    buyerReference: invoice.leitwegId || null,

    supplier,
    customer,

    paymentMeansCode: "58", // SEPA credit transfer
    paymentId: invoice.paymentReference,
    paymentAccount,

    servicePeriodStart: invoice.serviceStartDate ? new Date(invoice.serviceStartDate) : null,
    servicePeriodEnd: invoice.serviceEndDate ? new Date(invoice.serviceEndDate) : null,

    lines,

    netAmount: toNumber(invoice.netAmount),
    taxAmount: toNumber(invoice.taxAmount),
    grossAmount: toNumber(invoice.grossAmount),

    notes: invoice.notes,
    taxExemptNote: options?.taxExemptNote,
  };
}
