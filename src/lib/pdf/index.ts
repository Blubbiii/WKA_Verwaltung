/**
 * PDF-Generierung Modul
 *
 * Dieses Modul bietet Funktionen zur Erstellung von PDF-Dokumenten
 * fuer Rechnungen, Gutschriften und andere Geschaeftsdokumente.
 */

// Generatoren
export {
  generateInvoicePdf,
  generateInvoicePdfBase64,
  type InvoicePdfOptions,
} from "./generators/invoicePdf";
export { generateVoteResultPdf, generateVoteResultPdfBase64 } from "./generators/voteResultPdf";
export { generateAccessReportPdf, generateAccessReportPdfBase64 } from "./generators/accessReportPdf";
export { generatePermissionMatrixPdf, generatePermissionMatrixPdfBase64 } from "./generators/permissionMatrixPdf";
export { generateAuditLogPdf, generateAuditLogPdfBase64 } from "./generators/auditLogPdf";
export {
  generateMonthlyReportPdf,
  generateMonthlyReportPdfBase64,
  getMonthlyReportFilename,
} from "./generators/monthlyReportPdf";
export {
  generateAnnualReportPdf,
  generateAnnualReportPdfBase64,
  getAnnualReportFilename,
} from "./generators/annualReportPdf";

// Template Resolution
export {
  resolveTemplate,
  resolveLetterhead,
  resolveTemplateAndLetterhead,
  type ResolvedTemplate,
  type ResolvedLetterhead,
} from "./utils/templateResolver";

// Formatierungsfunktionen
export {
  formatCurrency,
  formatNumber,
  formatDate,
  formatPercent,
  formatPeriod,
  formatAddress,
  formatSenderLine,
  calculateTotals,
} from "./utils/formatters";

// Template-Komponenten (fuer erweiterte Anpassungen)
export { BaseDocument } from "./templates/BaseDocument";
export { InvoiceTemplate } from "./templates/InvoiceTemplate";
export { VoteResultTemplate, type VoteResultPdfData } from "./templates/VoteResultTemplate";
export { AccessReportTemplate, type AccessReportPdfData } from "./templates/AccessReportTemplate";
export { PermissionMatrixTemplate, type PermissionMatrixPdfData } from "./templates/PermissionMatrixTemplate";
export { AuditLogTemplate, type AuditLogPdfData } from "./templates/AuditLogTemplate";
export { MonthlyReportTemplate, type MonthlyReportData } from "./templates/MonthlyReportTemplate";
export { AnnualReportTemplate, type AnnualReportData } from "./templates/AnnualReportTemplate";
export { Header } from "./templates/components/Header";
export { RecipientBlock } from "./templates/components/RecipientBlock";
export { ItemsTable } from "./templates/components/ItemsTable";
export { Footer, PageNumber } from "./templates/components/Footer";
export { Watermark } from "./templates/components/Watermark";

// Watermark Utilities
export {
  type WatermarkType,
  type WatermarkConfig,
  type WatermarkProps,
  type WatermarkOptions,
  getWatermarkConfig,
  getWatermarkTypes,
  shouldShowWatermark,
  parseWatermarkParam,
  getWatermarkLabel,
} from "./utils/watermark";
