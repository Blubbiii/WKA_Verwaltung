/**
 * XRechnung XML Structural Validator
 *
 * Performs basic structural validation of generated XRechnung XML:
 * - Checks required elements are present
 * - Validates tax calculations
 * - Checks Leitweg-ID format (if provided)
 *
 * Note: This is NOT a full schema validation against the XRechnung XSD.
 * For production use, consider validating against the official KoSIT validator.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Check if an XML string contains a specific element
 */
function hasElement(xml: string, elementName: string): boolean {
  // Check for both self-closing and regular tags
  const regex = new RegExp(`<${elementName}[\\s/>]`, "s");
  return regex.test(xml);
}

/**
 * Extract the text content of the first occurrence of an element
 */
function getElementValue(xml: string, elementName: string): string | null {
  const regex = new RegExp(`<${elementName}[^>]*>([^<]*)</${elementName}>`, "s");
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Extract all occurrences of an element's text content
 */
function getAllElementValues(xml: string, elementName: string): string[] {
  const regex = new RegExp(`<${elementName}[^>]*>([^<]*)</${elementName}>`, "gs");
  const values: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    values.push(match[1].trim());
  }
  return values;
}

/**
 * Validate Leitweg-ID format
 * Format: PPPP-XXXXX-YY (rough pattern)
 * P = Prefix (2-12 chars), X = routing number, Y = check digits
 */
function isValidLeitwegId(id: string): boolean {
  // Leitweg-ID: Coarse-Prefix - Fein-Prefix - Pruefziffer
  // Pattern: at least two segments separated by dashes
  const pattern = /^\d{2,12}-[\w\d]{1,30}-\d{2}$/;
  return pattern.test(id);
}

// ============================================================================
// MAIN VALIDATION
// ============================================================================

/**
 * Validate an XRechnung XML document structure
 */
export function validateXRechnungXml(xml: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // ---- 1. Basic XML structure ----
  if (!xml.startsWith("<?xml")) {
    errors.push({
      code: "XML_DECLARATION",
      message: "XML-Deklaration fehlt",
    });
  }

  if (!xml.includes('xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"')) {
    errors.push({
      code: "NAMESPACE_MISSING",
      message: "UBL Invoice Namespace fehlt",
    });
  }

  // ---- 2. Required elements (BT-* Business Terms from EN 16931) ----

  // BT-1: Invoice number
  const invoiceId = getElementValue(xml, "cbc:ID");
  if (!invoiceId) {
    errors.push({
      code: "BT1_MISSING",
      message: "Rechnungsnummer (cbc:ID) fehlt",
      field: "cbc:ID",
    });
  }

  // BT-2: Issue date
  if (!hasElement(xml, "cbc:IssueDate")) {
    errors.push({
      code: "BT2_MISSING",
      message: "Rechnungsdatum (cbc:IssueDate) fehlt",
      field: "cbc:IssueDate",
    });
  }

  // BT-3: Invoice type code
  const typeCode = getElementValue(xml, "cbc:InvoiceTypeCode");
  if (!typeCode) {
    errors.push({
      code: "BT3_MISSING",
      message: "Rechnungstyp-Code (cbc:InvoiceTypeCode) fehlt",
      field: "cbc:InvoiceTypeCode",
    });
  } else if (!["380", "381", "384", "389", "751"].includes(typeCode)) {
    errors.push({
      code: "BT3_INVALID",
      message: `Ungueltiger Rechnungstyp-Code: ${typeCode}. Erlaubt: 380 (Rechnung), 381 (Gutschrift)`,
      field: "cbc:InvoiceTypeCode",
    });
  }

  // BT-5: Document currency
  const currencyCode = getElementValue(xml, "cbc:DocumentCurrencyCode");
  if (!currencyCode) {
    errors.push({
      code: "BT5_MISSING",
      message: "Waehrungscode (cbc:DocumentCurrencyCode) fehlt",
      field: "cbc:DocumentCurrencyCode",
    });
  }

  // BT-10: Buyer reference (required for XRechnung)
  const buyerRef = getElementValue(xml, "cbc:BuyerReference");
  if (!buyerRef) {
    errors.push({
      code: "BT10_MISSING",
      message: "Kaeufer-Referenz (cbc:BuyerReference) fehlt - fuer XRechnung Pflicht",
      field: "cbc:BuyerReference",
    });
  }

  // BT-24: CustomizationID (XRechnung specification identifier)
  const customizationId = getElementValue(xml, "cbc:CustomizationID");
  if (!customizationId) {
    errors.push({
      code: "BT24_MISSING",
      message: "XRechnung Spezifikations-ID (cbc:CustomizationID) fehlt",
      field: "cbc:CustomizationID",
    });
  } else if (!customizationId.includes("xrechnung")) {
    warnings.push({
      code: "BT24_NOT_XRECHNUNG",
      message: "CustomizationID verweist nicht auf XRechnung-Standard",
      field: "cbc:CustomizationID",
    });
  }

  // BT-25: ProfileID
  if (!hasElement(xml, "cbc:ProfileID")) {
    warnings.push({
      code: "BT25_MISSING",
      message: "Prozess-ID (cbc:ProfileID) fehlt",
      field: "cbc:ProfileID",
    });
  }

  // ---- 3. Party validation ----

  // Supplier party (BG-4)
  if (!hasElement(xml, "cac:AccountingSupplierParty")) {
    errors.push({
      code: "BG4_MISSING",
      message: "Verkaeuferdaten (cac:AccountingSupplierParty) fehlen",
      field: "cac:AccountingSupplierParty",
    });
  }

  // Customer party (BG-7)
  if (!hasElement(xml, "cac:AccountingCustomerParty")) {
    errors.push({
      code: "BG7_MISSING",
      message: "Kaeuferdaten (cac:AccountingCustomerParty) fehlen",
      field: "cac:AccountingCustomerParty",
    });
  }

  // ---- 4. Monetary totals ----

  // LegalMonetaryTotal
  if (!hasElement(xml, "cac:LegalMonetaryTotal")) {
    errors.push({
      code: "BG22_MISSING",
      message: "Gesamtbetraege (cac:LegalMonetaryTotal) fehlen",
      field: "cac:LegalMonetaryTotal",
    });
  }

  // Tax total
  if (!hasElement(xml, "cac:TaxTotal")) {
    errors.push({
      code: "BG23_MISSING",
      message: "Steuersumme (cac:TaxTotal) fehlt",
      field: "cac:TaxTotal",
    });
  }

  // ---- 5. Line items ----

  if (!hasElement(xml, "cac:InvoiceLine")) {
    errors.push({
      code: "BG25_MISSING",
      message: "Keine Rechnungspositionen (cac:InvoiceLine) vorhanden",
      field: "cac:InvoiceLine",
    });
  }

  // ---- 6. Tax calculation validation ----

  // Extract amounts for validation
  const taxExclusiveAmounts = getAllElementValues(xml, "cbc:TaxExclusiveAmount");
  const taxInclusiveAmounts = getAllElementValues(xml, "cbc:TaxInclusiveAmount");
  const taxAmounts = getAllElementValues(xml, "cbc:TaxAmount");
  const lineExtensionAmounts = getAllElementValues(xml, "cbc:LineExtensionAmount");

  if (taxExclusiveAmounts.length > 0 && taxInclusiveAmounts.length > 0 && taxAmounts.length > 0) {
    const netTotal = parseFloat(taxExclusiveAmounts[0]);
    const grossTotal = parseFloat(taxInclusiveAmounts[0]);
    const taxTotal = parseFloat(taxAmounts[0]);

    // Check: net + tax = gross (with 1 cent tolerance for rounding)
    const calculatedGross = netTotal + taxTotal;
    if (Math.abs(calculatedGross - grossTotal) > 0.01) {
      errors.push({
        code: "CALC_TOTAL_MISMATCH",
        message: `Berechnungsfehler: Netto (${netTotal}) + Steuer (${taxTotal}) = ${calculatedGross}, aber Brutto ist ${grossTotal}`,
      });
    }

    // Check: sum of line extension amounts = net total
    // Only check LineExtensionAmount within InvoiceLine blocks (skip the one in LegalMonetaryTotal)
    // The first LineExtensionAmount in LegalMonetaryTotal is the total
    if (lineExtensionAmounts.length > 1) {
      // lineExtensionAmounts[0] is in LegalMonetaryTotal, rest are in InvoiceLine
      const lineAmounts = lineExtensionAmounts.slice(1);
      const lineSum = lineAmounts.reduce((sum, val) => sum + parseFloat(val), 0);
      if (Math.abs(lineSum - netTotal) > 0.01) {
        warnings.push({
          code: "CALC_LINE_SUM_MISMATCH",
          message: `Summe der Positionen (${lineSum.toFixed(2)}) weicht vom Nettobetrag (${netTotal.toFixed(2)}) ab`,
        });
      }
    }
  }

  // ---- 7. Leitweg-ID validation (if present) ----

  if (buyerRef && buyerRef.includes("-")) {
    if (!isValidLeitwegId(buyerRef)) {
      warnings.push({
        code: "LEITWEG_ID_FORMAT",
        message: `Leitweg-ID "${buyerRef}" entspricht nicht dem erwarteten Format (PPPP-XXXXX-YY)`,
        field: "cbc:BuyerReference",
      });
    }
  }

  // ---- 8. Payment means ----

  if (!hasElement(xml, "cac:PaymentMeans")) {
    warnings.push({
      code: "BG16_MISSING",
      message: "Zahlungsinformationen (cac:PaymentMeans) fehlen",
      field: "cac:PaymentMeans",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate XRechnung input data before XML generation
 */
export function validateXRechnungData(data: {
  invoiceNumber?: string;
  invoiceDate?: Date | null;
  supplierName?: string;
  customerName?: string;
  lines?: Array<{ description?: string; netAmount?: number }>;
  netAmount?: number;
  grossAmount?: number;
  taxAmount?: number;
}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!data.invoiceNumber) {
    errors.push({
      code: "DATA_NO_NUMBER",
      message: "Rechnungsnummer ist erforderlich",
      field: "invoiceNumber",
    });
  }

  if (!data.invoiceDate) {
    errors.push({
      code: "DATA_NO_DATE",
      message: "Rechnungsdatum ist erforderlich",
      field: "invoiceDate",
    });
  }

  if (!data.supplierName) {
    errors.push({
      code: "DATA_NO_SUPPLIER",
      message: "Verkaeufername (Tenant) ist erforderlich",
      field: "supplier.name",
    });
  }

  if (!data.customerName) {
    errors.push({
      code: "DATA_NO_CUSTOMER",
      message: "Empfaengername ist erforderlich",
      field: "customer.name",
    });
  }

  if (!data.lines || data.lines.length === 0) {
    errors.push({
      code: "DATA_NO_LINES",
      message: "Mindestens eine Rechnungsposition ist erforderlich",
      field: "lines",
    });
  }

  if (data.netAmount !== undefined && data.taxAmount !== undefined && data.grossAmount !== undefined) {
    const calculated = data.netAmount + data.taxAmount;
    if (Math.abs(calculated - data.grossAmount) > 0.01) {
      errors.push({
        code: "DATA_CALC_ERROR",
        message: `Berechnungsfehler: Netto (${data.netAmount}) + Steuer (${data.taxAmount}) != Brutto (${data.grossAmount})`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
