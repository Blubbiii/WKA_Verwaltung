// Default invoice template layout and block palette definitions

import type {
  TemplateLayout,
  TemplateBlock,
  BlockPaletteItem,
} from "./template-types";

// ============================================
// ID Generator
// ============================================

let counter = 0;

export function generateBlockId(): string {
  counter += 1;
  return `block_${Date.now()}_${counter}`;
}

// ============================================
// Default Blocks (standard invoice layout)
// ============================================

export function createDefaultBlocks(): TemplateBlock[] {
  return [
    {
      id: generateBlockId(),
      type: "HEADER",
      order: 0,
      visible: true,
      config: {
        showLogo: true,
        showCompanyName: true,
        showCompanyAddress: false,
      },
      style: { marginBottom: 8 },
    },
    {
      id: generateBlockId(),
      type: "SENDER_ADDRESS",
      order: 1,
      visible: true,
      config: { compact: true },
      style: { fontSize: 8, marginBottom: 4 },
    },
    {
      id: generateBlockId(),
      type: "RECIPIENT_ADDRESS",
      order: 2,
      visible: true,
      config: { showWindow: true },
      style: { marginBottom: 16 },
    },
    {
      id: generateBlockId(),
      type: "INVOICE_META",
      order: 3,
      visible: true,
      config: {
        showInvoiceNumber: true,
        showDate: true,
        showDueDate: true,
        showServicePeriod: true,
        showCustomerNumber: false,
        showPaymentReference: true,
      },
      style: { marginBottom: 16 },
    },
    {
      id: generateBlockId(),
      type: "POSITIONS_TABLE",
      order: 4,
      visible: true,
      config: {
        showPosition: true,
        showQuantity: true,
        showUnit: true,
        showUnitPrice: true,
        showTaxRate: true,
        showNetAmount: true,
        showGrossAmount: false,
      },
      style: { marginBottom: 8 },
    },
    {
      id: generateBlockId(),
      type: "SUBTOTAL",
      order: 5,
      visible: true,
      config: { showNetTotal: true },
      style: { marginBottom: 4 },
    },
    {
      id: generateBlockId(),
      type: "TAX_SUMMARY",
      order: 6,
      visible: true,
      config: { showTaxBreakdown: true },
      style: { marginBottom: 4 },
    },
    {
      id: generateBlockId(),
      type: "TOTAL",
      order: 7,
      visible: true,
      config: { showGrossTotal: true, highlight: true },
      style: {
        fontWeight: "bold",
        fontSize: 14,
        marginBottom: 16,
        backgroundColor: "#f8f9fa",
        padding: 8,
      },
    },
    {
      id: generateBlockId(),
      type: "PAYMENT_INFO",
      order: 8,
      visible: true,
      config: { showPaymentTerms: true, showSkonto: true },
      style: { marginBottom: 12 },
    },
    {
      id: generateBlockId(),
      type: "BANK_DETAILS",
      order: 9,
      visible: true,
      config: { showBankName: true, showIban: true, showBic: true },
      style: { marginBottom: 12 },
    },
    {
      id: generateBlockId(),
      type: "NOTES",
      order: 10,
      visible: false,
      config: { defaultText: "" },
      style: { marginBottom: 8 },
    },
    {
      id: generateBlockId(),
      type: "FOOTER",
      order: 11,
      visible: true,
      config: {
        showTaxDisclaimer: true,
        customText: "",
      },
      style: { fontSize: 8, marginTop: 16 },
    },
  ];
}

// ============================================
// Default Template Layout
// ============================================

export function createDefaultLayout(): TemplateLayout {
  return {
    blocks: createDefaultBlocks(),
    pageSize: "A4",
    margins: { top: 45, right: 20, bottom: 30, left: 25 },
    defaultFont: "Inter",
    defaultFontSize: 10,
    primaryColor: "#1a1a1a",
    accentColor: "#335E99",
  };
}

// ============================================
// Block Palette (available blocks for drag & drop)
// ============================================

export const BLOCK_PALETTE: BlockPaletteItem[] = [
  // Layout blocks
  {
    type: "HEADER",
    label: "Kopfzeile",
    description: "Logo und Firmenname",
    category: "layout",
    icon: "LayoutTemplate",
    defaultConfig: { showLogo: true, showCompanyName: true, showCompanyAddress: false },
  },
  {
    type: "SENDER_ADDRESS",
    label: "Absender",
    description: "Kompakte Absenderzeile",
    category: "layout",
    icon: "MapPin",
    defaultConfig: { compact: true },
    defaultStyle: { fontSize: 8 },
  },
  {
    type: "RECIPIENT_ADDRESS",
    label: "Empfänger",
    description: "Empfängeradresse (DIN 5008)",
    category: "layout",
    icon: "User",
    defaultConfig: { showWindow: true },
  },
  {
    type: "SPACER",
    label: "Abstand",
    description: "Vertikaler Leerraum",
    category: "layout",
    icon: "MoveVertical",
    defaultConfig: { height: 24 },
  },
  {
    type: "DIVIDER",
    label: "Trennlinie",
    description: "Horizontale Trennlinie",
    category: "layout",
    icon: "Minus",
    defaultConfig: { thickness: 1, color: "#e5e7eb" },
  },

  // Content blocks
  {
    type: "INVOICE_META",
    label: "Rechnungsdaten",
    description: "Nr., Datum, Fälligkeit",
    category: "content",
    icon: "FileText",
    defaultConfig: {
      showInvoiceNumber: true,
      showDate: true,
      showDueDate: true,
      showServicePeriod: true,
      showCustomerNumber: false,
      showPaymentReference: true,
    },
  },
  {
    type: "NOTES",
    label: "Notizen",
    description: "Freitextfeld für Bemerkungen",
    category: "content",
    icon: "StickyNote",
    defaultConfig: { defaultText: "" },
  },
  {
    type: "CUSTOM_TEXT",
    label: "Eigener Text",
    description: "Freier Text mit Platzhaltern",
    category: "custom",
    icon: "Type",
    defaultConfig: { text: "" },
  },

  // Financial blocks
  {
    type: "POSITIONS_TABLE",
    label: "Positionstabelle",
    description: "Rechnungspositionen mit Spalten",
    category: "financial",
    icon: "Table",
    defaultConfig: {
      showPosition: true,
      showQuantity: true,
      showUnit: true,
      showUnitPrice: true,
      showTaxRate: true,
      showNetAmount: true,
      showGrossAmount: false,
    },
  },
  {
    type: "SUBTOTAL",
    label: "Zwischensumme",
    description: "Nettosumme aller Positionen",
    category: "financial",
    icon: "Calculator",
    defaultConfig: { showNetTotal: true },
  },
  {
    type: "TAX_SUMMARY",
    label: "Steuerübersicht",
    description: "MwSt-Aufstellung nach Saetzen",
    category: "financial",
    icon: "Percent",
    defaultConfig: { showTaxBreakdown: true },
  },
  {
    type: "TOTAL",
    label: "Gesamtbetrag",
    description: "Bruttosumme (Endbetrag)",
    category: "financial",
    icon: "BadgeEuro",
    defaultConfig: { showGrossTotal: true, highlight: true },
    defaultStyle: { fontWeight: "bold", backgroundColor: "#f8f9fa", padding: 8 },
  },
  {
    type: "PAYMENT_INFO",
    label: "Zahlungsinformationen",
    description: "Zahlungsbedingungen und Skonto",
    category: "financial",
    icon: "CreditCard",
    defaultConfig: { showPaymentTerms: true, showSkonto: true },
  },
  {
    type: "BANK_DETAILS",
    label: "Bankverbindung",
    description: "IBAN, BIC, Bankname",
    category: "financial",
    icon: "Landmark",
    defaultConfig: { showBankName: true, showIban: true, showBic: true },
  },
  {
    type: "FOOTER",
    label: "Fusszeile",
    description: "Steuerhinweis und Schlusstext",
    category: "layout",
    icon: "AlignEndHorizontal",
    defaultConfig: { showTaxDisclaimer: true, customText: "" },
    defaultStyle: { fontSize: 8 },
  },
];

// ============================================
// Category Labels (German)
// ============================================

export const CATEGORY_LABELS: Record<string, string> = {
  layout: "Layout",
  content: "Inhalt",
  financial: "Finanzen",
  custom: "Benutzerdefiniert",
};

// ============================================
// Block Type Labels (German)
// ============================================

export const BLOCK_TYPE_LABELS: Record<string, string> = {
  HEADER: "Kopfzeile",
  SENDER_ADDRESS: "Absender",
  RECIPIENT_ADDRESS: "Empfänger",
  INVOICE_META: "Rechnungsdaten",
  POSITIONS_TABLE: "Positionstabelle",
  SUBTOTAL: "Zwischensumme",
  TAX_SUMMARY: "Steuerübersicht",
  TOTAL: "Gesamtbetrag",
  PAYMENT_INFO: "Zahlungsinformationen",
  BANK_DETAILS: "Bankverbindung",
  NOTES: "Notizen",
  FOOTER: "Fusszeile",
  CUSTOM_TEXT: "Eigener Text",
  SPACER: "Abstand",
  DIVIDER: "Trennlinie",
};

// ============================================
// Sample data for live preview
// ============================================

export const SAMPLE_INVOICE_DATA = {
  companyName: "Windpark Nordheide GmbH & Co. KG",
  companyLogo: "",
  companyAddress: "Am Windpark 12, 21271 Hanstedt",
  senderName: "Windpark Nordheide GmbH & Co. KG",
  senderStreet: "Am Windpark 12",
  senderCity: "21271 Hanstedt",
  recipientName: "Stadtwerke Hamburg Energie GmbH",
  recipientStreet: "Überseering 12",
  recipientCity: "22297 Hamburg",
  invoiceNumber: "RE-2026-00042",
  invoiceDate: "12.02.2026",
  dueDate: "14.03.2026",
  customerNumber: "KD-10042",
  servicePeriod: "01.01.2026 - 31.01.2026",
  paymentReference: "WPN-2026-01",
  positions: [
    {
      pos: 1,
      description: "Stromeinspeisung Januar 2026 - WEA 01",
      quantity: 245800,
      unit: "kWh",
      unitPrice: 0.0892,
      taxRate: 19,
      netAmount: 21925.36,
    },
    {
      pos: 2,
      description: "Stromeinspeisung Januar 2026 - WEA 02",
      quantity: 231400,
      unit: "kWh",
      unitPrice: 0.0892,
      taxRate: 19,
      netAmount: 20640.88,
    },
    {
      pos: 3,
      description: "Direktvermarktungszuschlag",
      quantity: 1,
      unit: "psch.",
      unitPrice: 1250.0,
      taxRate: 19,
      netAmount: 1250.0,
    },
  ],
  netTotal: 43816.24,
  taxRate: 19,
  taxAmount: 8325.09,
  grossTotal: 52141.33,
  paymentTerms: "Zahlbar innerhalb von 30 Tagen nach Rechnungsdatum.",
  skontoPeriod: "14 Tage",
  skontoPercent: "2%",
  bankName: "Sparkasse Harburg-Buxtehude",
  iban: "DE89 3704 0044 0532 0130 00",
  bic: "COBADEFFXXX",
  notes: "",
  taxDisclaimer: "",
};
