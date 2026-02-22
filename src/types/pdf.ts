// PDF System Types fuer WindparkManager

export type DocumentType = "INVOICE" | "CREDIT_NOTE" | "CONTRACT" | "SETTLEMENT_REPORT";

export type PageSize = "A4" | "LETTER";
export type PageOrientation = "portrait" | "landscape";
export type LogoPosition = "top-left" | "top-center" | "top-right";
export type RecipientPosition = "left" | "right";
export type MetadataPosition = "right-column" | "below-header";

// Layout-Konfiguration fuer DocumentTemplate.layout
export interface DocumentTemplateLayout {
  // Seitenformat
  pageSize: PageSize;
  orientation: PageOrientation;

  // Sichtbarkeit und Position der Sektionen
  sections: {
    header: {
      showLogo: boolean;
      showCompanyName: boolean;
      showCompanyAddress: boolean;
    };
    recipient: {
      position: RecipientPosition;
      showWindow: boolean; // DIN 5008 Fensterumschlag
      windowOffsetTop: number; // mm vom oberen Rand
    };
    metadata: {
      showInvoiceNumber: boolean;
      showDate: boolean;
      showDueDate: boolean;
      showServicePeriod: boolean;
      showCustomerNumber: boolean;
      showPaymentReference: boolean;
      position: MetadataPosition;
    };
    items: {
      showPosition: boolean;
      showQuantity: boolean;
      showUnit: boolean;
      showUnitPrice: boolean;
      showTaxRate: boolean;
      showTaxAmount: boolean;
      showGrossAmount: boolean;
      groupByTaxRate: boolean;
    };
    totals: {
      showNetTotal: boolean;
      showTaxBreakdown: boolean;
      showGrossTotal: boolean;
    };
    footer: {
      showBankDetails: boolean;
      showTaxDisclaimer: boolean;
      showPaymentTerms: boolean;
      customText: string;
    };
  };

  // Typografie
  fonts: {
    heading: string;
    body: string;
    mono: string;
  };

  // Lokalisierung
  locale: "de-DE" | "en-US";
  dateFormat: string;
  currencyFormat: string;

  // Steuer-spezifisch (deutsches Recht)
  taxExemptDisclaimer: string; // "Steuerfrei gem. §4 Nr.12 UStG"
}

// Firmeninfo fuer Letterhead.companyInfo
export interface LetterheadCompanyInfo {
  name: string;
  legalForm?: string; // GmbH, AG, KG, etc.
  address: {
    street: string;
    postalCode: string;
    city: string;
    country?: string;
  };
  contact: {
    phone?: string;
    fax?: string;
    email?: string;
    website?: string;
  };
  bankDetails?: {
    bankName: string;
    iban: string;
    bic?: string;
  };
  taxInfo?: {
    taxId?: string; // Steuernummer
    vatId?: string; // USt-IdNr.
  };
  registration?: {
    court?: string; // Amtsgericht
    registerNumber?: string; // HRB 12345
  };
  management?: string[]; // Geschaeftsfuehrer
}

// Default Layout-Konfiguration
export const DEFAULT_DOCUMENT_LAYOUT: DocumentTemplateLayout = {
  pageSize: "A4",
  orientation: "portrait",
  sections: {
    header: {
      showLogo: true,
      showCompanyName: true,
      showCompanyAddress: false,
    },
    recipient: {
      position: "left",
      showWindow: true,
      windowOffsetTop: 45,
    },
    metadata: {
      showInvoiceNumber: true,
      showDate: true,
      showDueDate: true,
      showServicePeriod: true,
      showCustomerNumber: false,
      showPaymentReference: true,
      position: "right-column",
    },
    items: {
      showPosition: true,
      showQuantity: true,
      showUnit: true,
      showUnitPrice: true,
      showTaxRate: true,
      showTaxAmount: false,
      showGrossAmount: true,
      groupByTaxRate: false,
    },
    totals: {
      showNetTotal: true,
      showTaxBreakdown: true,
      showGrossTotal: true,
    },
    footer: {
      showBankDetails: true,
      showTaxDisclaimer: true,
      showPaymentTerms: true,
      customText: "",
    },
  },
  fonts: {
    heading: "Inter",
    body: "Inter",
    mono: "JetBrains Mono",
  },
  locale: "de-DE",
  dateFormat: "dd.MM.yyyy",
  currencyFormat: "EUR",
  taxExemptDisclaimer: "Steuerfrei gem. §4 Nr.12 UStG (Vermietung und Verpachtung von Grundstuecken)",
};

// Default Letterhead Company Info
export const DEFAULT_COMPANY_INFO: LetterheadCompanyInfo = {
  name: "",
  address: {
    street: "",
    postalCode: "",
    city: "",
    country: "Deutschland",
  },
  contact: {},
};

// PDF Generation Options
export interface PdfGenerationOptions {
  download?: boolean; // true = Download, false = Inline anzeigen
  filename?: string;
  watermark?: string; // z.B. "ENTWURF" fuer Draft-Rechnungen
}

// Invoice Data fuer PDF Template
export interface InvoicePdfData {
  // Rechnung
  invoiceNumber: string;
  invoiceType: "INVOICE" | "CREDIT_NOTE";
  invoiceDate: Date;
  dueDate: Date | null;
  status: "DRAFT" | "SENT" | "PAID" | "CANCELLED";

  // Empfaenger
  recipientName: string;
  recipientAddress: string | null;

  // Leistungszeitraum
  serviceStartDate: Date | null;
  serviceEndDate: Date | null;

  // Referenzen
  paymentReference: string | null;
  internalReference: string | null;

  // Positionen
  items: InvoiceItemPdfData[];

  // Summen
  netAmount: number;
  taxAmount: number;
  taxRate: number;
  grossAmount: number;

  // Notizen
  notes: string | null;

  // Konfigurierbarer Zahlungstext (aus Tenant-Einstellungen)
  paymentText: string | null;

  // Skonto (early payment discount)
  skontoPercent?: number | null;
  skontoDays?: number | null;
  skontoDeadline?: Date | null;
  skontoAmount?: number | null;
  skontoPaid?: boolean;

  // Storno-Info
  cancelledInvoiceNumber?: string;
  cancelReason?: string;

  // Korrektur-Info (Teilstorno / Rechnungskorrektur)
  correctionOfInvoiceNumber?: string;
  correctionType?: "FULL_CANCEL" | "PARTIAL_CANCEL" | "CORRECTION";
  correctionReason?: string;

  // Mandantendaten (fuer Briefkopf/Bankverbindung)
  tenant?: {
    name: string | null;
    bankName: string | null;
    iban: string | null;
    bic: string | null;
  };

  // Settlement-Details (fuer detaillierte Gutschrift-PDFs)
  settlementDetails?: SettlementPdfDetails;
}

// ===========================================
// SETTLEMENT PDF TYPES (Detaillierte Gutschrift)
// ===========================================

/** Revenue table entry (Ertragsuebersicht) for settlement credit note */
export interface RevenueTableEntry {
  category: string;        // e.g. "WnK290S-----09"
  rateCtPerKwh: number;   // e.g. 9.4310
  productionKwh: number;  // e.g. 4497213.2
  revenueEur: number;     // e.g. 424132.18
}

/** Calculation summary showing transparent breakdown */
export interface CalculationSummary {
  totalRevenueEur: number;
  revenuePhasePercentage: number;    // e.g. 5.0%
  calculatedAnnualFee: number;       // Rechnerisches Jahresnutzungsentgelt
  minimumPerContract: number;        // Minimum gemaess Vertrag
  actualAnnualFee: number;           // Tatsaechliches (MAX)
  weaSharePercentage: number;        // e.g. 10%
  weaShareAmount: number;
  weaSharePerUnit: number;           // EUR/WKA
  weaCount: number;
  poolSharePercentage: number;       // e.g. 90%
  poolShareAmount: number;
  poolSharePerHa: number;            // EUR/ha
  poolTotalHa: number;
  parkName: string;
  year: number;
}

/** Per-turbine production summary for Anlage */
export interface TurbineProductionEntry {
  designation: string;              // "WEA 1", "E-115/3"
  productionKwh: number;           // Jahresproduktion kWh (Summe 12 Monate)
  operatingHours: number | null;   // Betriebsstunden gesamt
  availabilityPct: number | null;  // Durchschnittliche Verfuegbarkeit %
}

/** Detailed fee position entry for Anlage (positive fees + negative advance deductions) */
export interface FeePositionEntry {
  description: string;
  netAmount: number;        // positive for fees, negative for advance deductions
  taxType: "STANDARD" | "EXEMPT";
}

/** Full settlement details stored on Invoice.calculationDetails */
export interface SettlementPdfDetails {
  type: "ADVANCE" | "FINAL";
  subtitle?: string;                           // "Nutzungsentgelt / WP Barenburg / 2025"
  introText?: string;                          // "gemaess den Ihnen vorliegenden Vertraegen..."
  revenueTable?: RevenueTableEntry[];          // Optional: Einspeisung-Tabelle
  revenueTableTotal?: number;
  calculationSummary?: CalculationSummary;     // Berechnungsuebersicht
  feePositions?: FeePositionEntry[];           // Positionsaufstellung: volle Gebuehren + Vorschuss-Verrechnungen
  turbineProductions?: TurbineProductionEntry[];  // Pro-WEA Produktionsdaten (fuer Anlage)
}

export interface InvoiceItemPdfData {
  position: number;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  netAmount: number;
  taxType: "STANDARD" | "REDUCED" | "EXEMPT";
  taxRate: number;
  taxAmount: number;
  grossAmount: number;
}
