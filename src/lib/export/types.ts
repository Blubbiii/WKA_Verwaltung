/**
 * Export Utilities - Type Definitions
 *
 * Shared types for Excel and CSV export functionality.
 */

/**
 * Supported data formats for column values
 */
export type ColumnFormat = 'text' | 'number' | 'date' | 'currency' | 'percentage';

/**
 * Column definition for export
 */
export interface ColumnDef {
  /** Object key to extract value from */
  key: string;
  /** Column header text */
  header: string;
  /** Column width in characters (Excel only) */
  width?: number;
  /** Data format for the column */
  format?: ColumnFormat;
  /** Custom value transformer */
  transform?: (value: unknown, row: Record<string, unknown>) => unknown;
}

/**
 * Export format options
 */
export type ExportFormat = 'xlsx' | 'csv';

/**
 * Generic export options
 */
export interface ExportOptions {
  /** Sheet name for Excel export */
  sheetName?: string;
  /** Include UTF-8 BOM for CSV (Excel compatibility) */
  includeBom?: boolean;
  /** Date format string */
  dateFormat?: string;
  /** Currency symbol */
  currencySymbol?: string;
  /** Decimal separator */
  decimalSeparator?: string;
  /** Thousands separator */
  thousandsSeparator?: string;
}

/**
 * Export result with metadata
 */
export interface ExportResult {
  /** File content as Buffer (Excel) or string (CSV) */
  content: Buffer | string;
  /** Suggested filename */
  filename: string;
  /** MIME type */
  mimeType: string;
  /** Number of rows exported */
  rowCount: number;
}

/**
 * Supported export entity types
 */
export type ExportEntityType =
  | 'shareholders'
  | 'parks'
  | 'turbines'
  | 'invoices'
  | 'contracts'
  | 'persons'
  | 'funds'
  | 'leases'
  | 'plots';

/**
 * Filter parameters for export queries
 */
export interface ExportFilters {
  fundId?: string;
  parkId?: string;
  tenantId: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
}
