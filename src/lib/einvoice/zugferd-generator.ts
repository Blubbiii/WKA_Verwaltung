/**
 * ZUGFeRD 2.2 Generator (COMFORT Profile)
 *
 * Generates ZUGFeRD 2.2 COMFORT profile XML in Cross-Industry Invoice (CII) format.
 *
 * ZUGFeRD embeds structured invoice data (XML) into a PDF/A-3 document.
 * Since true PDF/A-3 embedding requires specialized libraries (like pdf-lib with
 * specific extensions), this module provides:
 *
 * 1. CII XML generation (factur-x.xml) - the structured data component
 * 2. Metadata that marks the invoice as ZUGFeRD-compatible
 *
 * The XML is provided as a separate downloadable file alongside the PDF.
 *
 * Standards:
 * - ZUGFeRD 2.2 (based on EN 16931, CII D16B syntax)
 * - Factur-X 1.0 (French-German joint standard, same as ZUGFeRD 2.2)
 */

import type { XRechnungInvoiceData, XRechnungLineItem } from "./xrechnung-generator";

// ============================================================================
// XML HELPERS
// ============================================================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDate(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}${month}${day}`; // CII uses YYYYMMDD format
}

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

// ============================================================================
// CII TAX CATEGORY MAPPING
// ============================================================================

/**
 * Map XRechnung/UBL tax category to CII category code
 * CII uses the same UNCL 5305 codes as UBL
 */
function mapTaxCategoryToCII(categoryId: string): string {
  switch (categoryId) {
    case "S":
      return "S"; // Standard rate
    case "AA":
      return "AA"; // Lower rate (reduced)
    case "E":
      return "E"; // Exempt from tax
    default:
      return "S";
  }
}

// ============================================================================
// CII DOCUMENT TYPE CODE MAPPING
// ============================================================================

function mapInvoiceTypeCode(code: string): string {
  // CII uses same UNTDID 1001 codes as UBL
  return code; // "380" for Invoice, "381" for Credit Note
}

// ============================================================================
// CII XML GENERATION (COMFORT PROFILE)
// ============================================================================

/**
 * Group lines by tax category for CII TradeTax elements
 */
function groupLinesByTax(lines: XRechnungLineItem[]): Map<string, { basisAmount: number; calculatedAmount: number; percent: number; categoryCode: string }> {
  const groups = new Map<string, { basisAmount: number; calculatedAmount: number; percent: number; categoryCode: string }>();

  for (const line of lines) {
    const key = `${line.taxCategoryId}-${line.taxPercent}`;
    const existing = groups.get(key);
    const lineTax = line.netAmount * (line.taxPercent / 100);

    if (existing) {
      existing.basisAmount += line.netAmount;
      existing.calculatedAmount += lineTax;
    } else {
      groups.set(key, {
        basisAmount: line.netAmount,
        calculatedAmount: lineTax,
        percent: line.taxPercent,
        categoryCode: mapTaxCategoryToCII(line.taxCategoryId),
      });
    }
  }

  return groups;
}

/**
 * Generate ZUGFeRD 2.2 COMFORT profile XML (CII format)
 *
 * Uses the same XRechnungInvoiceData input type for consistency.
 */
export function generateZugferdXml(data: XRechnungInvoiceData): string {
  const taxGroups = groupLinesByTax(data.lines);

  // Build trade tax entries
  let tradeTaxEntries = "";
  for (const [, group] of taxGroups) {
    let exemptionXml = "";
    if (group.categoryCode === "E") {
      const exemptNote = data.taxExemptNote || "Steuerfrei gem. \u00a74 Nr.12 UStG";
      exemptionXml = `
            <ram:ExemptionReason>${escapeXml(exemptNote)}</ram:ExemptionReason>`;
    }
    tradeTaxEntries += `
          <ram:ApplicableTradeTax>
            <ram:CalculatedAmount>${formatAmount(group.calculatedAmount)}</ram:CalculatedAmount>
            <ram:TypeCode>VAT</ram:TypeCode>${exemptionXml}
            <ram:BasisAmount>${formatAmount(group.basisAmount)}</ram:BasisAmount>
            <ram:CategoryCode>${group.categoryCode}</ram:CategoryCode>
            <ram:RateApplicablePercent>${group.percent.toFixed(2)}</ram:RateApplicablePercent>
          </ram:ApplicableTradeTax>`;
  }

  // Build line items
  let lineItemsXml = "";
  for (const line of data.lines) {
    lineItemsXml += `
      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument>
          <ram:LineID>${escapeXml(line.id)}</ram:LineID>
        </ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct>
          <ram:Name>${escapeXml(line.description)}</ram:Name>
        </ram:SpecifiedTradeProduct>
        <ram:SpecifiedLineTradeAgreement>
          <ram:NetPriceProductTradePrice>
            <ram:ChargeAmount>${formatAmount(line.unitPrice)}</ram:ChargeAmount>
          </ram:NetPriceProductTradePrice>
        </ram:SpecifiedLineTradeAgreement>
        <ram:SpecifiedLineTradeDelivery>
          <ram:BilledQuantity unitCode="${escapeXml(line.unit)}">${line.quantity.toFixed(4)}</ram:BilledQuantity>
        </ram:SpecifiedLineTradeDelivery>
        <ram:SpecifiedLineTradeSettlement>
          <ram:ApplicableTradeTax>
            <ram:TypeCode>VAT</ram:TypeCode>
            <ram:CategoryCode>${mapTaxCategoryToCII(line.taxCategoryId)}</ram:CategoryCode>
            <ram:RateApplicablePercent>${line.taxPercent.toFixed(2)}</ram:RateApplicablePercent>
          </ram:ApplicableTradeTax>
          <ram:SpecifiedTradeSettlementLineMonetarySummation>
            <ram:LineTotalAmount>${formatAmount(line.netAmount)}</ram:LineTotalAmount>
          </ram:SpecifiedTradeSettlementLineMonetarySummation>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>`;
  }

  // Supplier tax registration
  let supplierTaxXml = "";
  if (data.supplier.vatId) {
    supplierTaxXml += `
            <ram:SpecifiedTaxRegistration>
              <ram:ID schemeID="VA">${escapeXml(data.supplier.vatId)}</ram:ID>
            </ram:SpecifiedTaxRegistration>`;
  }
  if (data.supplier.taxId) {
    supplierTaxXml += `
            <ram:SpecifiedTaxRegistration>
              <ram:ID schemeID="FC">${escapeXml(data.supplier.taxId)}</ram:ID>
            </ram:SpecifiedTaxRegistration>`;
  }

  // Customer tax registration
  let customerTaxXml = "";
  if (data.customer.vatId) {
    customerTaxXml += `
            <ram:SpecifiedTaxRegistration>
              <ram:ID schemeID="VA">${escapeXml(data.customer.vatId)}</ram:ID>
            </ram:SpecifiedTaxRegistration>`;
  }

  // Payment means
  let paymentMeansXml = `
          <ram:SpecifiedTradeSettlementPaymentMeans>
            <ram:TypeCode>${escapeXml(data.paymentMeansCode || "58")}</ram:TypeCode>`;
  if (data.paymentAccount?.iban) {
    paymentMeansXml += `
            <ram:PayeePartyCreditorFinancialAccount>
              <ram:IBANID>${escapeXml(data.paymentAccount.iban)}</ram:IBANID>`;
    if (data.paymentAccount.bankName) {
      paymentMeansXml += `
              <ram:AccountName>${escapeXml(data.paymentAccount.bankName)}</ram:AccountName>`;
    }
    paymentMeansXml += `
            </ram:PayeePartyCreditorFinancialAccount>`;
    if (data.paymentAccount.bic) {
      paymentMeansXml += `
            <ram:PayeeSpecifiedCreditorFinancialInstitution>
              <ram:BICID>${escapeXml(data.paymentAccount.bic)}</ram:BICID>
            </ram:PayeeSpecifiedCreditorFinancialInstitution>`;
    }
  }
  paymentMeansXml += `
          </ram:SpecifiedTradeSettlementPaymentMeans>`;

  // Billing period
  let billingPeriodXml = "";
  if (data.servicePeriodStart && data.servicePeriodEnd) {
    billingPeriodXml = `
          <ram:BillingSpecifiedPeriod>
            <ram:StartDateTime>
              <udt:DateTimeString format="102">${formatDate(data.servicePeriodStart)}</udt:DateTimeString>
            </ram:StartDateTime>
            <ram:EndDateTime>
              <udt:DateTimeString format="102">${formatDate(data.servicePeriodEnd)}</udt:DateTimeString>
            </ram:EndDateTime>
          </ram:BillingSpecifiedPeriod>`;
  }

  // Payment terms
  let paymentTermsXml = "";
  if (data.dueDate) {
    paymentTermsXml = `
          <ram:SpecifiedTradePaymentTerms>
            <ram:DueDateDateTime>
              <udt:DateTimeString format="102">${formatDate(data.dueDate)}</udt:DateTimeString>
            </ram:DueDateDateTime>
          </ram:SpecifiedTradePaymentTerms>`;
  }

  // Note
  let noteXml = "";
  if (data.notes) {
    noteXml = `
      <ram:IncludedNote>
        <ram:Content>${escapeXml(data.notes)}</ram:Content>
      </ram:IncludedNote>`;
  }

  // Buyer reference (Leitweg-ID or fallback)
  const buyerReference = data.buyerReference || data.invoiceNumber;

  // Assemble the complete CII XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
                          xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
                          xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"
                          xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#conformant#urn:zugferd.de:2p2:comfort</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${escapeXml(data.invoiceNumber)}</ram:ID>
    <ram:TypeCode>${mapInvoiceTypeCode(data.invoiceTypeCode)}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${formatDate(data.invoiceDate)}</udt:DateTimeString>
    </ram:IssueDateTime>${noteXml}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${escapeXml(buyerReference)}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>${escapeXml(data.supplier.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(data.supplier.postalCode || "")}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(data.supplier.street || "")}</ram:LineOne>
          <ram:CityName>${escapeXml(data.supplier.city || "")}</ram:CityName>
          <ram:CountryID>${escapeXml(data.supplier.countryCode)}</ram:CountryID>
        </ram:PostalTradeAddress>${data.supplier.email ? `
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${escapeXml(data.supplier.email)}</ram:URIID>
        </ram:URIUniversalCommunication>` : ""}${supplierTaxXml}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${escapeXml(data.customer.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(data.customer.postalCode || "")}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(data.customer.street || "")}</ram:LineOne>
          <ram:CityName>${escapeXml(data.customer.city || "")}</ram:CityName>
          <ram:CountryID>${escapeXml(data.customer.countryCode)}</ram:CountryID>
        </ram:PostalTradeAddress>${customerTaxXml}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${escapeXml(data.currency || "EUR")}</ram:InvoiceCurrencyCode>${paymentMeansXml}${tradeTaxEntries}${billingPeriodXml}${paymentTermsXml}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${formatAmount(data.netAmount)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${formatAmount(data.netAmount)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${escapeXml(data.currency || "EUR")}">${formatAmount(data.taxAmount)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${formatAmount(data.grossAmount)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${formatAmount(data.grossAmount)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>${lineItemsXml}
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

  return xml;
}
