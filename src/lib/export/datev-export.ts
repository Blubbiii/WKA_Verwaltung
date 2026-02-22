/**
 * DATEV Export Utility
 *
 * Generates DATEV-compatible CSV files (Buchungsstapel format) for importing
 * booking entries (Buchungssaetze) into DATEV accounting software.
 *
 * Format specification:
 * - EXTF format version 510, category 21 (Buchungsstapel)
 * - Semicolon delimiter (German standard)
 * - UTF-8 with BOM encoding (modern DATEV accepts this)
 * - German number format (comma as decimal separator)
 * - Date format: DDMM (no year, no separator)
 *
 * @see https://developer.datev.de/datev/platform/en/dtvf/formate
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * DATEV export options
 */
export interface DatevExportOptions {
  /** Consultant number (Beraternummer) - DATEV field */
  consultantNumber?: string;
  /** Client number (Mandantennummer) - DATEV field */
  clientNumber?: string;
  /** Fiscal year start date */
  fiscalYearStart: Date;
  /** Fiscal year end date */
  fiscalYearEnd: Date;
  /** Company/entity name for the export header */
  companyName?: string;
  /** Default revenue account (Erloeskonto) for wind power revenue */
  defaultRevenueAccount?: string;
  /** Default debtor account number start (Debitorennummernkreis) */
  defaultDebtorStart?: number;
  /** Default creditor account number start (Kreditorennummernkreis) */
  defaultCreditorStart?: number;
}

/**
 * A single DATEV booking entry (Buchungssatz)
 */
export interface DatevBookingEntry {
  /** Amount without sign (Umsatz) */
  amount: number;
  /** Debit or Credit: "S" = Soll/debit, "H" = Haben/credit */
  debitCredit: "S" | "H";
  /** Currency code */
  currency: string;
  /** Account number (Konto - Debitor/Kreditor) */
  account: string;
  /** Counter account (Gegenkonto) */
  counterAccount: string;
  /** Tax key (BU-Schluessel): 0 = no tax, 9 = 19% USt, 8 = 7% USt */
  taxKey: string;
  /** Document date (Belegdatum) */
  documentDate: Date;
  /** Document number / invoice number (Belegfeld 1) */
  documentNumber: string;
  /** Booking text (Buchungstext) - max 60 chars */
  bookingText: string;
  /** Tax rate in percent (e.g. 19.00, 7.00, 0.00) */
  taxRate?: number;
  /** Cost center 1 (Kostenstelle 1) */
  costCenter1?: string;
  /** Cost center 2 (Kostenstelle 2) */
  costCenter2?: string;
}

/**
 * Input invoice data for DATEV conversion
 */
export interface DatevInvoiceData {
  id: string;
  invoiceNumber: string;
  invoiceType: "INVOICE" | "CREDIT_NOTE";
  invoiceDate: Date | string;
  recipientName: string | null;
  netAmount: number;
  taxRate: number;
  taxAmount: number;
  grossAmount: number;
  currency: string;
  status: string;
  fund?: { id: string; name: string } | null;
  park?: { id: string; name: string } | null;
  shareholder?: {
    id: string;
    shareholderNumber?: string | null;
    person?: {
      firstName: string | null;
      lastName: string | null;
      companyName: string | null;
    } | null;
  } | null;
  items?: DatevInvoiceItemData[];
  datevBuchungsschluessel?: string | null;
}

/**
 * Input invoice item data for DATEV conversion
 */
export interface DatevInvoiceItemData {
  description: string;
  netAmount: number;
  taxType: "STANDARD" | "REDUCED" | "EXEMPT";
  taxRate: number;
  taxAmount: number;
  grossAmount: number;
  datevKonto?: string | null;
  datevGegenkonto?: string | null;
  datevKostenstelle?: string | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** UTF-8 BOM for file encoding */
const UTF8_BOM = "\uFEFF";

/** Semicolon delimiter (German CSV standard, required by DATEV) */
const DELIMITER = ";";

/** Line ending (CRLF required by DATEV) */
const LINE_ENDING = "\r\n";

/** DATEV format version */
const DATEV_FORMAT_VERSION = 510;

/** DATEV format category for Buchungsstapel */
const DATEV_FORMAT_CATEGORY = 21;

/** DATEV format name */
const DATEV_FORMAT_NAME = "Buchungsstapel";

/** DATEV data category version */
const DATEV_DATA_CATEGORY_VERSION = 12;

/** Maximum length for Buchungstext field */
const MAX_BOOKING_TEXT_LENGTH = 60;

/** Maximum length for Belegfeld 1 */
const MAX_DOCUMENT_NUMBER_LENGTH = 36;

/**
 * Tax key mapping (BU-Schluessel)
 * Key "0" or empty = no tax / manually entered
 * Key "9" = 19% Umsatzsteuer
 * Key "8" = 7% Umsatzsteuer (reduced rate)
 */
const TAX_KEY_MAP: Record<string, string> = {
  STANDARD: "9",  // 19% USt
  REDUCED: "8",   // 7% USt
  EXEMPT: "0",    // 0% / tax exempt
};

/** Default account numbers */
const DEFAULT_ACCOUNTS = {
  /** Revenue from wind power (Erloese Stromlieferung) */
  revenueWindPower: "8400",
  /** General revenue account */
  generalRevenue: "8000",
  /** Debtor accounts start */
  debtorStart: 10000,
  /** Creditor accounts start */
  creditorStart: 70000,
};

// ============================================================================
// DATEV COLUMN HEADERS (Row 2 of the file)
// ============================================================================

/**
 * DATEV Buchungsstapel column headers
 * These are the official DATEV column names (116 columns total in full spec,
 * we only populate the essential ones)
 */
const DATEV_COLUMNS = [
  "Umsatz (ohne Soll/Haben-Kz)",      // 1  - Amount
  "Soll/Haben-Kennzeichen",            // 2  - S or H
  "WKZ Umsatz",                        // 3  - Currency
  "Kurs",                              // 4  - Exchange rate
  "Basis-Umsatz",                      // 5  - Base amount (foreign currency)
  "WKZ Basis-Umsatz",                  // 6  - Base currency
  "Konto",                             // 7  - Account
  "Gegenkonto (ohne BU-Schluessel)",   // 8  - Counter account
  "BU-Schluessel",                     // 9  - Tax key
  "Belegdatum",                        // 10 - Document date (DDMM)
  "Belegfeld 1",                       // 11 - Document number
  "Belegfeld 2",                       // 12 - Document field 2
  "Skonto",                            // 13 - Cash discount
  "Buchungstext",                      // 14 - Booking text
  "Postensperre",                      // 15 - Item lock
  "Diverse Adressnummer",              // 16 - Misc address number
  "Geschaeftspartnerbank",             // 17 - Business partner bank
  "Sachverhalt",                       // 18 - Facts
  "Zinssperre",                        // 19 - Interest lock
  "Beleglink",                         // 20 - Document link
  "Beleginfo - Art 1",                 // 21
  "Beleginfo - Inhalt 1",             // 22
  "Beleginfo - Art 2",                 // 23
  "Beleginfo - Inhalt 2",             // 24
  "Beleginfo - Art 3",                 // 25
  "Beleginfo - Inhalt 3",             // 26
  "Beleginfo - Art 4",                 // 27
  "Beleginfo - Inhalt 4",             // 28
  "Beleginfo - Art 5",                 // 29
  "Beleginfo - Inhalt 5",             // 30
  "Beleginfo - Art 6",                 // 31
  "Beleginfo - Inhalt 6",             // 32
  "Beleginfo - Art 7",                 // 33
  "Beleginfo - Inhalt 7",             // 34
  "Beleginfo - Art 8",                 // 35
  "Beleginfo - Inhalt 8",             // 36
  "KOST1 - Kostenstelle",             // 37 - Cost center 1
  "KOST2 - Kostenstelle",             // 38 - Cost center 2
  "Kost-Menge",                        // 39
  "EU-Land u. UStID",                  // 40
  "EU-Steuersatz",                     // 41
  "Abw. Versteuerungsart",             // 42
  "Sachverhalt L+L",                   // 43
  "Funktionsergaenzung L+L",           // 44
  "BU 49 Hauptfunktionstyp",           // 45
  "BU 49 Hauptfunktionsnummer",        // 46
  "BU 49 Funktionsergaenzung",         // 47
  "Zusatzinformation - Art 1",         // 48
  "Zusatzinformation - Inhalt 1",      // 49
  "Zusatzinformation - Art 2",         // 50
  "Zusatzinformation - Inhalt 2",      // 51
  "Zusatzinformation - Art 3",         // 52
  "Zusatzinformation - Inhalt 3",      // 53
  "Zusatzinformation - Art 4",         // 54
  "Zusatzinformation - Inhalt 4",      // 55
  "Zusatzinformation - Art 5",         // 56
  "Zusatzinformation - Inhalt 5",      // 57
  "Zusatzinformation - Art 6",         // 58
  "Zusatzinformation - Inhalt 6",      // 59
  "Zusatzinformation - Art 7",         // 60
  "Zusatzinformation - Inhalt 7",      // 61
  "Zusatzinformation - Art 8",         // 62
  "Zusatzinformation - Inhalt 8",      // 63
  "Zusatzinformation - Art 9",         // 64
  "Zusatzinformation - Inhalt 9",      // 65
  "Zusatzinformation - Art 10",        // 66
  "Zusatzinformation - Inhalt 10",     // 67
  "Zusatzinformation - Art 11",        // 68
  "Zusatzinformation - Inhalt 11",     // 69
  "Zusatzinformation - Art 12",        // 70
  "Zusatzinformation - Inhalt 12",     // 71
  "Zusatzinformation - Art 13",        // 72
  "Zusatzinformation - Inhalt 13",     // 73
  "Zusatzinformation - Art 14",        // 74
  "Zusatzinformation - Inhalt 14",     // 75
  "Zusatzinformation - Art 15",        // 76
  "Zusatzinformation - Inhalt 15",     // 77
  "Zusatzinformation - Art 16",        // 78
  "Zusatzinformation - Inhalt 16",     // 79
  "Zusatzinformation - Art 17",        // 80
  "Zusatzinformation - Inhalt 17",     // 81
  "Zusatzinformation - Art 18",        // 82
  "Zusatzinformation - Inhalt 18",     // 83
  "Zusatzinformation - Art 19",        // 84
  "Zusatzinformation - Inhalt 19",     // 85
  "Zusatzinformation - Art 20",        // 86
  "Zusatzinformation - Inhalt 20",     // 87
  "Stueck",                            // 88
  "Gewicht",                           // 89
  "Zahlweise",                         // 90
  "Forderungsart",                     // 91
  "Veranlagungsjahr",                  // 92
  "Zugeordnete Faelligkeit",           // 93
  "Skontotyp",                         // 94
  "Auftragsnummer",                    // 95
  "Buchungstyp",                       // 96
  "USt-Schluessel (Anzahlungen)",      // 97
  "EU-Land (Anzahlungen)",             // 98
  "Sachverhalt L+L (Anzahlungen)",     // 99
  "EU-Steuersatz (Anzahlungen)",       // 100
  "Erloeskonto (Anzahlungen)",         // 101
  "Herkunft-Kz",                       // 102
  "Buchungs GUID",                     // 103
  "KOST-Datum",                        // 104
  "SEPA-Mandatsreferenz",              // 105
  "Skontosperre",                      // 106
  "Gesellschaftername",                // 107
  "Beteiligtennummer",                 // 108
  "Identifikationsnummer",             // 109
  "Zeichnernummer",                    // 110
  "Postensperre bis",                  // 111
  "Bezeichnung SoBil-Sachverhalt",     // 112
  "Kennzeichen SoBil-Buchung",         // 113
  "Festschreibung",                    // 114
  "Leistungsdatum",                    // 115
  "Datum Zuord. Steuerperiode",        // 116
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format a number in German locale for DATEV (comma as decimal separator, no thousands separator)
 * DATEV expects amounts without thousands separators.
 */
function formatDatevAmount(amount: number): string {
  // Round to 2 decimal places
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const parts = rounded.toFixed(2).split(".");
  return `${parts[0]},${parts[1]}`;
}

/**
 * Format a date as DDMM (DATEV Belegdatum format - no year, no separator)
 */
function formatDatevDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}${month}`;
}

/**
 * Format a date as YYYYMMDD for the DATEV header
 */
function formatDatevHeaderDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Escape and quote a DATEV field value.
 * Text fields in DATEV are enclosed in double quotes.
 * Internal double quotes are doubled.
 */
function quoteDatevField(value: string): string {
  if (!value) return '""';
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Truncate a string to a maximum length
 */
function truncate(value: string, maxLength: number): string {
  if (!value) return "";
  return value.length > maxLength ? value.substring(0, maxLength) : value;
}

/**
 * Get a deterministic account number for a shareholder/entity
 * Uses the shareholder number or a hash of the ID
 */
function getDebtorAccount(
  shareholder: DatevInvoiceData["shareholder"],
  startNumber: number
): string {
  if (shareholder?.shareholderNumber) {
    // Try to extract a numeric part from the shareholder number
    const numPart = shareholder.shareholderNumber.replace(/\D/g, "");
    if (numPart) {
      return String(startNumber + parseInt(numPart, 10));
    }
  }

  // Fallback: Use a simple hash of the ID
  if (shareholder?.id) {
    let hash = 0;
    for (let i = 0; i < shareholder.id.length; i++) {
      const char = shareholder.id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return String(startNumber + Math.abs(hash % 9000) + 1);
  }

  return String(startNumber + 1);
}

/**
 * Get the recipient display name from invoice data
 */
function getRecipientName(invoice: DatevInvoiceData): string {
  if (invoice.recipientName) return invoice.recipientName;
  if (invoice.shareholder?.person) {
    const p = invoice.shareholder.person;
    if (p.companyName) return p.companyName;
    return [p.firstName, p.lastName].filter(Boolean).join(" ") || "Unbekannt";
  }
  return "Unbekannt";
}

// ============================================================================
// MAIN EXPORT FUNCTIONS
// ============================================================================

/**
 * Convert an invoice to one or more DATEV booking entries.
 *
 * Strategy:
 * - If invoice has items with individual DATEV accounts, create one entry per item
 * - Otherwise, create a single entry for the gross amount
 * - INVOICE type: Debit (S) on debtor account, credit (H) on revenue account
 * - CREDIT_NOTE type: Credit (H) on debtor account, debit (S) on revenue account
 */
export function invoiceToBookingEntries(
  invoice: DatevInvoiceData,
  options: DatevExportOptions
): DatevBookingEntry[] {
  const entries: DatevBookingEntry[] = [];
  const debtorAccount = getDebtorAccount(
    invoice.shareholder,
    options.defaultDebtorStart ?? DEFAULT_ACCOUNTS.debtorStart
  );
  const defaultRevenue = options.defaultRevenueAccount ?? DEFAULT_ACCOUNTS.revenueWindPower;
  const recipientName = getRecipientName(invoice);

  // Determine debit/credit direction based on invoice type
  // INVOICE: We receive money -> Debit debtor, Credit revenue
  // CREDIT_NOTE: We pay money -> Credit debtor, Debit revenue
  const isInvoice = invoice.invoiceType === "INVOICE";

  // Check if we have item-level DATEV accounts
  const hasItemAccounts = invoice.items?.some(
    (item) => item.datevKonto || item.datevGegenkonto
  );

  if (hasItemAccounts && invoice.items && invoice.items.length > 0) {
    // Create one booking entry per item
    for (const item of invoice.items) {
      if (item.grossAmount === 0) continue;

      const account = item.datevGegenkonto || debtorAccount;
      const counterAccount = item.datevKonto || defaultRevenue;
      const taxKey = TAX_KEY_MAP[item.taxType] || "0";

      entries.push({
        amount: Math.abs(item.grossAmount),
        debitCredit: isInvoice ? "S" : "H",
        currency: invoice.currency || "EUR",
        account,
        counterAccount,
        taxKey,
        documentDate: typeof invoice.invoiceDate === "string"
          ? new Date(invoice.invoiceDate)
          : invoice.invoiceDate,
        documentNumber: truncate(invoice.invoiceNumber, MAX_DOCUMENT_NUMBER_LENGTH),
        bookingText: truncate(
          `${recipientName} - ${item.description}`,
          MAX_BOOKING_TEXT_LENGTH
        ),
        taxRate: item.taxRate,
        costCenter1: item.datevKostenstelle || undefined,
      });
    }
  } else {
    // Single entry for the whole invoice (gross amount)
    const taxKey = invoice.datevBuchungsschluessel
      || (invoice.taxRate >= 19 ? "9" : invoice.taxRate >= 7 ? "8" : "0");

    entries.push({
      amount: Math.abs(
        typeof invoice.grossAmount === "number"
          ? invoice.grossAmount
          : parseFloat(String(invoice.grossAmount))
      ),
      debitCredit: isInvoice ? "S" : "H",
      currency: invoice.currency || "EUR",
      account: debtorAccount,
      counterAccount: defaultRevenue,
      taxKey,
      documentDate: typeof invoice.invoiceDate === "string"
        ? new Date(invoice.invoiceDate)
        : invoice.invoiceDate,
      documentNumber: truncate(invoice.invoiceNumber, MAX_DOCUMENT_NUMBER_LENGTH),
      bookingText: truncate(
        `${invoice.invoiceType === "CREDIT_NOTE" ? "Gutschrift" : "Rechnung"} ${invoice.invoiceNumber} ${recipientName}`,
        MAX_BOOKING_TEXT_LENGTH
      ),
      taxRate: typeof invoice.taxRate === "number"
        ? invoice.taxRate
        : parseFloat(String(invoice.taxRate)),
    });
  }

  return entries;
}

/**
 * Generate the DATEV header row (row 1).
 *
 * Format: "EXTF";510;21;"Buchungsstapel";12;1;YYYYMMDD;4;YYYYMMDD;YYYYMMDD;consultant;company;...
 */
function generateDatevHeader(options: DatevExportOptions): string {
  const now = new Date();
  const creationDate = formatDatevHeaderDate(now);
  const fiscalStart = formatDatevHeaderDate(options.fiscalYearStart);
  const fiscalEnd = formatDatevHeaderDate(options.fiscalYearEnd);
  const consultantNumber = options.consultantNumber || "";
  const clientNumber = options.clientNumber || "";
  const companyName = options.companyName || "WPM Export";

  // DATEV header fields (separated by semicolons)
  const headerFields = [
    '"EXTF"',                              // 1  - Format identifier
    String(DATEV_FORMAT_VERSION),          // 2  - Format version
    String(DATEV_FORMAT_CATEGORY),         // 3  - Category (21 = Buchungsstapel)
    quoteDatevField(DATEV_FORMAT_NAME),    // 4  - Format name
    String(DATEV_DATA_CATEGORY_VERSION),   // 5  - Data category version
    "1",                                   // 6  - Created by (1 = external program)
    creationDate,                          // 7  - Creation date
    "4",                                   // 8  - Import/export target (4 = FIBU)
    fiscalStart,                           // 9  - Fiscal year start
    "4",                                   // 10 - Account length
    fiscalStart,                           // 11 - Fiscal year start (Datum von)
    fiscalEnd,                             // 12 - Fiscal year end (Datum bis)
    quoteDatevField(consultantNumber),     // 13 - Consultant number
    quoteDatevField(clientNumber),         // 14 - Client number
    quoteDatevField(companyName),          // 15 - Company name
    "",                                    // 16 - Reserved
    "0",                                   // 17 - Dictation key
    "",                                    // 18 - Reserved
    "",                                    // 19 - Reserved
    "",                                    // 20 - Reserved
    "",                                    // 21 - Reserved
    "",                                    // 22 - Reserved
    "",                                    // 23 - Reserved
    "",                                    // 24 - Reserved
    "",                                    // 25 - Reserved
    "",                                    // 26 - Application info
    "",                                    // 27 - Application info
  ];

  return headerFields.join(DELIMITER);
}

/**
 * Generate the DATEV column header row (row 2)
 */
function generateDatevColumnHeaders(): string {
  return DATEV_COLUMNS.map((col) => quoteDatevField(col)).join(DELIMITER);
}

/**
 * Convert a single booking entry to a DATEV CSV row
 */
function bookingEntryToRow(entry: DatevBookingEntry): string {
  // Build the row with all 116 columns (most empty)
  const fields: string[] = new Array(DATEV_COLUMNS.length).fill("");

  // Column 1: Umsatz (Amount) - German number format, no quotes
  fields[0] = formatDatevAmount(entry.amount);

  // Column 2: Soll/Haben-Kennzeichen
  fields[1] = quoteDatevField(entry.debitCredit);

  // Column 3: WKZ Umsatz (Currency)
  fields[2] = quoteDatevField(entry.currency);

  // Column 4-6: Exchange rate fields (empty for EUR)
  // fields[3], fields[4], fields[5] remain empty

  // Column 7: Konto (Account)
  fields[6] = entry.account;

  // Column 8: Gegenkonto (Counter account, without BU-Schluessel)
  fields[7] = entry.counterAccount;

  // Column 9: BU-Schluessel (Tax key)
  fields[8] = entry.taxKey || "";

  // Column 10: Belegdatum (Document date in DDMM format)
  fields[9] = formatDatevDate(entry.documentDate);

  // Column 11: Belegfeld 1 (Document number / Invoice number)
  fields[10] = quoteDatevField(entry.documentNumber);

  // Column 12: Belegfeld 2 (empty)
  // fields[11] remains empty

  // Column 13: Skonto (empty)
  // fields[12] remains empty

  // Column 14: Buchungstext
  fields[13] = quoteDatevField(entry.bookingText);

  // Column 37: KOST1 - Kostenstelle
  if (entry.costCenter1) {
    fields[36] = quoteDatevField(entry.costCenter1);
  }

  // Column 38: KOST2 - Kostenstelle
  if (entry.costCenter2) {
    fields[37] = quoteDatevField(entry.costCenter2);
  }

  // Column 114: Festschreibung (0 = not locked)
  fields[113] = "0";

  return fields.join(DELIMITER);
}

/**
 * Generate a complete DATEV Buchungsstapel CSV string.
 *
 * @param invoices - Array of invoice data to export
 * @param options - DATEV export configuration
 * @returns Complete DATEV CSV string (UTF-8 with BOM)
 */
export function generateDatevExport(
  invoices: DatevInvoiceData[],
  options: DatevExportOptions
): string {
  // Convert all invoices to booking entries
  const allEntries: DatevBookingEntry[] = [];
  for (const invoice of invoices) {
    const entries = invoiceToBookingEntries(invoice, options);
    allEntries.push(...entries);
  }

  // Build the complete CSV
  const rows: string[] = [];

  // Row 1: DATEV header
  rows.push(generateDatevHeader(options));

  // Row 2: Column headers
  rows.push(generateDatevColumnHeaders());

  // Data rows
  for (const entry of allEntries) {
    rows.push(bookingEntryToRow(entry));
  }

  // Join with CRLF and prepend UTF-8 BOM
  return UTF8_BOM + rows.join(LINE_ENDING) + LINE_ENDING;
}

/**
 * Generate DATEV export as a Buffer (for file download)
 *
 * @param invoices - Array of invoice data to export
 * @param options - DATEV export configuration
 * @returns Buffer containing the DATEV CSV file
 */
export function generateDatevExportBuffer(
  invoices: DatevInvoiceData[],
  options: DatevExportOptions
): Buffer {
  const csvString = generateDatevExport(invoices, options);
  return Buffer.from(csvString, "utf-8");
}

/**
 * Generate a suggested filename for the DATEV export
 *
 * @param from - Start date of the export period
 * @param to - End date of the export period
 * @returns Filename string
 */
export function generateDatevFilename(from: Date, to: Date): string {
  const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`;
  const toStr = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}`;
  return `EXTF_Buchungen_${fromStr}_${toStr}.csv`;
}
