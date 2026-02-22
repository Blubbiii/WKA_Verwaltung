// Invoice Template Types for WYSIWYG Editor
// Defines the block-based layout schema for customizable invoice templates

// ============================================
// Block Types
// ============================================

export type TemplateBlockType =
  | "HEADER"
  | "SENDER_ADDRESS"
  | "RECIPIENT_ADDRESS"
  | "INVOICE_META"
  | "POSITIONS_TABLE"
  | "SUBTOTAL"
  | "TAX_SUMMARY"
  | "TOTAL"
  | "PAYMENT_INFO"
  | "BANK_DETAILS"
  | "NOTES"
  | "FOOTER"
  | "CUSTOM_TEXT"
  | "SPACER"
  | "DIVIDER";

// ============================================
// Block Style
// ============================================

export interface BlockStyle {
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  textAlign?: "left" | "center" | "right";
  marginTop?: number;
  marginBottom?: number;
  padding?: number;
  backgroundColor?: string;
  borderBottom?: string;
  color?: string;
}

// ============================================
// Block Configs (per block type)
// ============================================

export interface HeaderBlockConfig {
  showLogo: boolean;
  showCompanyName: boolean;
  showCompanyAddress: boolean;
}

export interface SenderAddressBlockConfig {
  compact: boolean; // Single-line "Firma - Str. - PLZ Ort" vs multi-line
}

export interface RecipientAddressBlockConfig {
  showWindow: boolean; // DIN 5008 envelope window
}

export interface InvoiceMetaBlockConfig {
  showInvoiceNumber: boolean;
  showDate: boolean;
  showDueDate: boolean;
  showServicePeriod: boolean;
  showCustomerNumber: boolean;
  showPaymentReference: boolean;
}

export interface PositionsTableBlockConfig {
  showPosition: boolean;
  showQuantity: boolean;
  showUnit: boolean;
  showUnitPrice: boolean;
  showTaxRate: boolean;
  showNetAmount: boolean;
  showGrossAmount: boolean;
}

export interface SubtotalBlockConfig {
  showNetTotal: boolean;
}

export interface TaxSummaryBlockConfig {
  showTaxBreakdown: boolean;
}

export interface TotalBlockConfig {
  showGrossTotal: boolean;
  highlight: boolean; // Background highlight for total
}

export interface PaymentInfoBlockConfig {
  showPaymentTerms: boolean;
  showSkonto: boolean;
}

export interface BankDetailsBlockConfig {
  showBankName: boolean;
  showIban: boolean;
  showBic: boolean;
}

export interface NotesBlockConfig {
  defaultText: string;
}

export interface FooterBlockConfig {
  showTaxDisclaimer: boolean;
  customText: string;
}

export interface CustomTextBlockConfig {
  text: string; // Supports {{mergeField}} variables
}

export interface SpacerBlockConfig {
  height: number; // px
}

export interface DividerBlockConfig {
  thickness: number; // px
  color: string;
}

// Union of all block configs
export type BlockConfig =
  | HeaderBlockConfig
  | SenderAddressBlockConfig
  | RecipientAddressBlockConfig
  | InvoiceMetaBlockConfig
  | PositionsTableBlockConfig
  | SubtotalBlockConfig
  | TaxSummaryBlockConfig
  | TotalBlockConfig
  | PaymentInfoBlockConfig
  | BankDetailsBlockConfig
  | NotesBlockConfig
  | FooterBlockConfig
  | CustomTextBlockConfig
  | SpacerBlockConfig
  | DividerBlockConfig;

// ============================================
// Template Block
// ============================================

export interface TemplateBlock {
  id: string;
  type: TemplateBlockType;
  order: number;
  visible: boolean;
  config: Record<string, unknown>;
  style?: BlockStyle;
}

// ============================================
// Template Layout
// ============================================

export interface TemplateLayout {
  blocks: TemplateBlock[];
  pageSize: "A4" | "LETTER";
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  defaultFont: string;
  defaultFontSize: number;
  primaryColor: string;
  accentColor: string;
}

// ============================================
// Invoice Template (API model)
// ============================================

export interface InvoiceTemplate {
  id: string;
  tenantId: string;
  name: string;
  isDefault: boolean;
  layout: TemplateLayout;
  headerHtml: string | null;
  footerHtml: string | null;
  styles: Record<string, unknown> | null;
  variables: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Block Palette Definition (for sidebar)
// ============================================

export interface BlockPaletteItem {
  type: TemplateBlockType;
  label: string;
  description: string;
  category: "layout" | "content" | "financial" | "custom";
  icon: string; // Lucide icon name
  defaultConfig: Record<string, unknown>;
  defaultStyle?: BlockStyle;
}

// ============================================
// Merge Variables per block type
// ============================================

export const MERGE_VARIABLES: Record<string, { key: string; label: string }[]> = {
  HEADER: [
    { key: "{{companyName}}", label: "Firmenname" },
    { key: "{{companyLogo}}", label: "Firmenlogo" },
    { key: "{{companyAddress}}", label: "Firmenadresse" },
  ],
  SENDER_ADDRESS: [
    { key: "{{senderName}}", label: "Absendername" },
    { key: "{{senderStreet}}", label: "Absenderstrasse" },
    { key: "{{senderCity}}", label: "Absenderort" },
  ],
  RECIPIENT_ADDRESS: [
    { key: "{{recipientName}}", label: "Empfaengername" },
    { key: "{{recipientStreet}}", label: "Empfaengerstrasse" },
    { key: "{{recipientCity}}", label: "Empfaengerort" },
  ],
  INVOICE_META: [
    { key: "{{invoiceNumber}}", label: "Rechnungsnummer" },
    { key: "{{invoiceDate}}", label: "Rechnungsdatum" },
    { key: "{{dueDate}}", label: "Faelligkeitsdatum" },
    { key: "{{customerNumber}}", label: "Kundennummer" },
    { key: "{{servicePeriod}}", label: "Leistungszeitraum" },
  ],
  PAYMENT_INFO: [
    { key: "{{paymentTerms}}", label: "Zahlungsbedingungen" },
    { key: "{{skontoPeriod}}", label: "Skonto-Frist" },
    { key: "{{skontoPercent}}", label: "Skonto-Prozent" },
  ],
  BANK_DETAILS: [
    { key: "{{bankName}}", label: "Bankname" },
    { key: "{{iban}}", label: "IBAN" },
    { key: "{{bic}}", label: "BIC" },
  ],
  NOTES: [
    { key: "{{notes}}", label: "Notizen" },
  ],
  CUSTOM_TEXT: [
    { key: "{{companyName}}", label: "Firmenname" },
    { key: "{{invoiceNumber}}", label: "Rechnungsnummer" },
    { key: "{{invoiceDate}}", label: "Rechnungsdatum" },
    { key: "{{recipientName}}", label: "Empfaengername" },
    { key: "{{dueDate}}", label: "Faelligkeitsdatum" },
  ],
};
