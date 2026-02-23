/**
 * XRechnung XML Generator (UBL 2.1)
 *
 * Generates XRechnung 3.0 compliant XML invoices according to:
 * - EN 16931 (European e-invoicing standard)
 * - XRechnung 3.0 (German CIUS - Core Invoice Usage Specification)
 * - UBL 2.1 syntax (OASIS Universal Business Language)
 *
 * Required by German law since 2025 for B2B invoices.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface XRechnungInvoiceData {
  // Invoice header
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date | null;
  invoiceTypeCode: "380" | "381"; // 380 = Invoice, 381 = Credit Note
  currency: string; // ISO 4217, default "EUR"
  buyerReference: string | null; // Leitweg-ID or PO number

  // Supplier (seller) party
  supplier: XRechnungParty;

  // Customer (buyer) party
  customer: XRechnungParty;

  // Payment details
  paymentMeansCode: string; // 58 = SEPA credit transfer
  paymentId: string | null; // Verwendungszweck
  paymentAccount: {
    iban: string | null;
    bic: string | null;
    bankName: string | null;
  } | null;

  // Service period
  servicePeriodStart: Date | null;
  servicePeriodEnd: Date | null;

  // Line items
  lines: XRechnungLineItem[];

  // Totals (will be computed from lines if not provided)
  netAmount: number;
  taxAmount: number;
  grossAmount: number;

  // Notes
  notes: string | null;

  // Tax exempt disclaimer text (loaded from tenant settings)
  taxExemptNote?: string;
}

export interface XRechnungParty {
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string; // ISO 3166-1 alpha-2, default "DE"
  taxId: string | null; // Steuernummer (e.g. "12/345/67890")
  vatId: string | null; // USt-IdNr. (e.g. "DE123456789")
  email: string | null;
  phone: string | null;
}

export interface XRechnungLineItem {
  id: string; // Line item ID (position number)
  description: string;
  quantity: number;
  unit: string; // UN/ECE Recommendation 20 code (e.g. "C62" = piece)
  unitPrice: number;
  netAmount: number;
  taxCategoryId: string; // "S" = Standard, "AA" = Reduced, "E" = Exempt
  taxPercent: number; // 19.00, 7.00, 0.00
}

// ============================================================================
// TAX CATEGORY MAPPING
// ============================================================================

/**
 * Map internal tax type to XRechnung tax category
 */
export function mapTaxTypeToCategory(taxType: string): { id: string; percent: number } {
  switch (taxType) {
    case "STANDARD":
      return { id: "S", percent: 19.0 };
    case "REDUCED":
      return { id: "AA", percent: 7.0 };
    case "EXEMPT":
      return { id: "E", percent: 0.0 };
    default:
      return { id: "S", percent: 19.0 };
  }
}

/**
 * Map unit string to UN/ECE Recommendation 20 unit code
 */
export function mapUnitCode(unit: string | null): string {
  if (!unit) return "C62"; // One (piece/unit)
  const lower = unit.toLowerCase();
  switch (lower) {
    case "stueck":
    case "stk":
    case "stk.":
    case "st.":
    case "piece":
      return "C62"; // One (piece)
    case "pauschal":
    case "pausch.":
    case "flat":
      return "LS"; // Lump sum
    case "m2":
    case "m\u00B2":
    case "qm":
      return "MTK"; // Square metre
    case "ha":
    case "hektar":
      return "HAR"; // Hectare
    case "kwh":
      return "KWH"; // Kilowatt hour
    case "mwh":
      return "MWH"; // Megawatt hour
    case "monat":
    case "monate":
    case "month":
      return "MON"; // Month
    case "jahr":
    case "year":
      return "ANN"; // Year
    case "tag":
    case "tage":
    case "day":
      return "DAY"; // Day
    case "stunde":
    case "stunden":
    case "hour":
      return "HUR"; // Hour
    case "km":
    case "kilometer":
      return "KMT"; // Kilometre
    case "m":
    case "meter":
      return "MTR"; // Metre
    default:
      return "C62"; // Default to piece
  }
}

// ============================================================================
// XML GENERATION
// ============================================================================

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Format a Date to ISO 8601 date string (YYYY-MM-DD)
 */
function formatDate(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format a number to 2 decimal places for XML output
 */
function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Format a number to a given number of decimal places
 */
function formatDecimal(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

/**
 * Generate a party (supplier or customer) XML block
 */
function generatePartyXml(party: XRechnungParty, role: "supplier" | "customer"): string {
  const partyTag = role === "supplier"
    ? "cac:AccountingSupplierParty"
    : "cac:AccountingCustomerParty";

  // Build tax scheme identification
  let taxSchemeXml = "";
  if (party.vatId) {
    taxSchemeXml += `
        <cac:PartyTaxScheme>
          <cbc:CompanyID>${escapeXml(party.vatId)}</cbc:CompanyID>
          <cac:TaxScheme>
            <cbc:ID>VAT</cbc:ID>
          </cac:TaxScheme>
        </cac:PartyTaxScheme>`;
  }
  if (party.taxId) {
    taxSchemeXml += `
        <cac:PartyTaxScheme>
          <cbc:CompanyID>${escapeXml(party.taxId)}</cbc:CompanyID>
          <cac:TaxScheme>
            <cbc:ID>FC</cbc:ID>
          </cac:TaxScheme>
        </cac:PartyTaxScheme>`;
  }

  // Contact information (optional)
  let contactXml = "";
  if (party.email || party.phone) {
    contactXml = `
        <cac:Contact>${party.phone ? `
          <cbc:Telephone>${escapeXml(party.phone)}</cbc:Telephone>` : ""}${party.email ? `
          <cbc:ElectronicMail>${escapeXml(party.email)}</cbc:ElectronicMail>` : ""}
        </cac:Contact>`;
  }

  return `
    <${partyTag}>
      <cac:Party>
        <cac:PartyName>
          <cbc:Name>${escapeXml(party.name)}</cbc:Name>
        </cac:PartyName>
        <cac:PostalAddress>
          <cbc:StreetName>${escapeXml(party.street || "")}</cbc:StreetName>
          <cbc:CityName>${escapeXml(party.city || "")}</cbc:CityName>
          <cbc:PostalZone>${escapeXml(party.postalCode || "")}</cbc:PostalZone>
          <cac:Country>
            <cbc:IdentificationCode>${escapeXml(party.countryCode)}</cbc:IdentificationCode>
          </cac:Country>
        </cac:PostalAddress>${taxSchemeXml}
        <cac:PartyLegalEntity>
          <cbc:RegistrationName>${escapeXml(party.name)}</cbc:RegistrationName>
        </cac:PartyLegalEntity>${contactXml}
      </cac:Party>
    </${partyTag}>`;
}

/**
 * Group line items by tax category for TaxTotal generation
 */
function groupByTaxCategory(lines: XRechnungLineItem[]): Map<string, { taxableAmount: number; taxAmount: number; taxPercent: number; categoryId: string }> {
  const groups = new Map<string, { taxableAmount: number; taxAmount: number; taxPercent: number; categoryId: string }>();

  for (const line of lines) {
    const key = `${line.taxCategoryId}-${line.taxPercent}`;
    const existing = groups.get(key);
    const lineTax = line.netAmount * (line.taxPercent / 100);

    if (existing) {
      existing.taxableAmount += line.netAmount;
      existing.taxAmount += lineTax;
    } else {
      groups.set(key, {
        taxableAmount: line.netAmount,
        taxAmount: lineTax,
        taxPercent: line.taxPercent,
        categoryId: line.taxCategoryId,
      });
    }
  }

  return groups;
}

/**
 * Generate the TaxTotal XML section
 */
function generateTaxTotalXml(lines: XRechnungLineItem[], totalTaxAmount: number, currency: string, taxExemptNote?: string): string {
  const groups = groupByTaxCategory(lines);
  const subtotals: string[] = [];

  for (const [, group] of groups) {
    // Determine tax exemption reason for exempt categories
    let exemptReasonXml = "";
    if (group.categoryId === "E") {
      const exemptNote = taxExemptNote || "Steuerfrei gem. \u00a74 Nr.12 UStG";
      exemptReasonXml = `
          <cbc:TaxExemptionReasonCode>vatex-eu-132-1f</cbc:TaxExemptionReasonCode>
          <cbc:TaxExemptionReason>${escapeXml(exemptNote)}</cbc:TaxExemptionReason>`;
    }

    subtotals.push(`
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="${currency}">${formatAmount(group.taxableAmount)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="${currency}">${formatAmount(group.taxAmount)}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:ID>${group.categoryId}</cbc:ID>
            <cbc:Percent>${formatDecimal(group.taxPercent, 2)}</cbc:Percent>${exemptReasonXml}
            <cac:TaxScheme>
              <cbc:ID>VAT</cbc:ID>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>`);
  }

  return `
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${currency}">${formatAmount(totalTaxAmount)}</cbc:TaxAmount>${subtotals.join("")}
    </cac:TaxTotal>`;
}

/**
 * Generate an InvoiceLine XML block
 */
function generateLineItemXml(line: XRechnungLineItem, currency: string): string {
  return `
    <cac:InvoiceLine>
      <cbc:ID>${escapeXml(line.id)}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${escapeXml(line.unit)}">${formatDecimal(line.quantity, 4)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${currency}">${formatAmount(line.netAmount)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Name>${escapeXml(line.description)}</cbc:Name>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>${line.taxCategoryId}</cbc:ID>
          <cbc:Percent>${formatDecimal(line.taxPercent, 2)}</cbc:Percent>
          <cac:TaxScheme>
            <cbc:ID>VAT</cbc:ID>
          </cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${currency}">${formatAmount(line.unitPrice)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`;
}

/**
 * Generate a complete XRechnung 3.0 UBL 2.1 Invoice XML document
 */
export function generateXRechnungXml(data: XRechnungInvoiceData): string {
  const currency = data.currency || "EUR";

  // Buyer reference (required for XRechnung - use Leitweg-ID or invoice number as fallback)
  const buyerReference = data.buyerReference || data.invoiceNumber;

  // Payment means section
  let paymentMeansXml = `
    <cac:PaymentMeans>
      <cbc:PaymentMeansCode>${escapeXml(data.paymentMeansCode || "58")}</cbc:PaymentMeansCode>`;

  if (data.paymentId) {
    paymentMeansXml += `
      <cbc:PaymentID>${escapeXml(data.paymentId)}</cbc:PaymentID>`;
  }

  if (data.paymentAccount?.iban) {
    paymentMeansXml += `
      <cac:PayeeFinancialAccount>
        <cbc:ID>${escapeXml(data.paymentAccount.iban)}</cbc:ID>`;

    if (data.paymentAccount.bankName) {
      paymentMeansXml += `
        <cbc:Name>${escapeXml(data.paymentAccount.bankName)}</cbc:Name>`;
    }

    if (data.paymentAccount.bic) {
      paymentMeansXml += `
        <cac:FinancialInstitutionBranch>
          <cbc:ID>${escapeXml(data.paymentAccount.bic)}</cbc:ID>
        </cac:FinancialInstitutionBranch>`;
    }

    paymentMeansXml += `
      </cac:PayeeFinancialAccount>`;
  }

  paymentMeansXml += `
    </cac:PaymentMeans>`;

  // Payment terms section
  let paymentTermsXml = "";
  if (data.dueDate) {
    const daysUntilDue = Math.max(0, Math.round((new Date(data.dueDate).getTime() - new Date(data.invoiceDate).getTime()) / (1000 * 60 * 60 * 24)));
    paymentTermsXml = `
    <cac:PaymentTerms>
      <cbc:Note>Zahlbar innerhalb von ${daysUntilDue} Tagen</cbc:Note>
    </cac:PaymentTerms>`;
  }

  // Note section
  let noteXml = "";
  if (data.notes) {
    noteXml = `
  <cbc:Note>${escapeXml(data.notes)}</cbc:Note>`;
  }

  // Invoice period (service period)
  let invoicePeriodXml = "";
  if (data.servicePeriodStart && data.servicePeriodEnd) {
    invoicePeriodXml = `
    <cac:InvoicePeriod>
      <cbc:StartDate>${formatDate(data.servicePeriodStart)}</cbc:StartDate>
      <cbc:EndDate>${formatDate(data.servicePeriodEnd)}</cbc:EndDate>
    </cac:InvoicePeriod>`;
  }

  // Due date
  let dueDateXml = "";
  if (data.dueDate) {
    dueDateXml = `
  <cbc:DueDate>${formatDate(data.dueDate)}</cbc:DueDate>`;
  }

  // Tax total
  const taxTotalXml = generateTaxTotalXml(data.lines, data.taxAmount, currency, data.taxExemptNote);

  // Line items
  const lineItemsXml = data.lines.map((line) => generateLineItemXml(line, currency)).join("");

  // Supplier and customer parties
  const supplierXml = generatePartyXml(data.supplier, "supplier");
  const customerXml = generatePartyXml(data.customer, "customer");

  // Assemble the full XML document
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(data.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${formatDate(data.invoiceDate)}</cbc:IssueDate>${dueDateXml}
  <cbc:InvoiceTypeCode>${data.invoiceTypeCode}</cbc:InvoiceTypeCode>${noteXml}
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${escapeXml(buyerReference)}</cbc:BuyerReference>${invoicePeriodXml}${supplierXml}${customerXml}${paymentMeansXml}${paymentTermsXml}${taxTotalXml}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${formatAmount(data.netAmount)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${formatAmount(data.netAmount)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${formatAmount(data.grossAmount)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${formatAmount(data.grossAmount)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lineItemsXml}
</Invoice>`;

  return xml;
}
