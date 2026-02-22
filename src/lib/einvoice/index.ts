/**
 * E-Invoice Module (XRechnung / ZUGFeRD)
 *
 * German e-invoicing support required since 2025 for B2B invoices.
 * Supports XRechnung 3.0 (UBL 2.1) and ZUGFeRD 2.2 (CII) formats.
 */

export {
  generateXRechnungXml,
  mapTaxTypeToCategory,
  mapUnitCode,
  type XRechnungInvoiceData,
  type XRechnungParty,
  type XRechnungLineItem,
} from "./xrechnung-generator";

export {
  generateZugferdXml,
} from "./zugferd-generator";

export {
  validateXRechnungXml,
  validateXRechnungData,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
} from "./xrechnung-validator";

export {
  buildXRechnungDataFromInvoice,
} from "./invoice-mapper";
