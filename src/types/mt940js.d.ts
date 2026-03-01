/**
 * Type declarations for mt940js.
 * MT940 is the SWIFT standard for bank statement files.
 */
declare module "mt940js" {
  export interface Mt940Transaction {
    /** Booking/value date */
    date: Date;
    /** Entry date (same day or next banking day) */
    entryDate: Date;
    /**
     * Signed amount: positive = credit (incoming), negative = debit (outgoing).
     * The sign is derived from the C/D indicator in the :61: tag.
     */
    amount: number;
    /** ISO-4217 currency code (from the statement header) */
    currency: string;
    /** Customer reference from :61: tag */
    reference: string;
    /** Bank reference from :61: tag */
    bankReference: string;
    /** Transaction type code (e.g. "NMSC", "NSTO") */
    transactionType: string;
    /** Funds code (e.g. "" for standard C/D, "R" for reversal) */
    fundsCode: string;
    /** Whether this is a reversal entry (RC/RD indicator) */
    isReversal: boolean;
    /** Structured or unstructured booking text from :86: tag */
    details: string;
    /** Additional details from :86: continuation lines */
    extraDetails: string;
  }

  export interface Mt940Statement {
    transactionReference: string;
    relatedReference: string;
    accountIdentification: string;
    number: { statement: string; sequence: string; section: string };
    statementDate: Date;
    openingBalanceDate: Date;
    closingBalanceDate: Date;
    /** ISO-4217 currency from the opening balance tag */
    currency: string;
    openingBalance: number;
    closingBalance: number;
    closingAvailableBalance: number;
    forwardAvailableBalance: number;
    transactions: Mt940Transaction[];
  }

  export class Parser {
    /**
     * Parse one or more MT940 statement blocks from a raw text string.
     * Multiple statements are separated by a "-" line.
     */
    parse(text: string): Mt940Statement[];

    /**
     * Register a post-parse middleware function.
     * Useful for custom field extraction.
     */
    usePostParse(fn: (statement: Mt940Statement) => Mt940Statement): void;
  }

  /** Helper utilities (date parsing, amount parsing, etc.) */
  export const Helpers: Record<string, unknown>;
}
