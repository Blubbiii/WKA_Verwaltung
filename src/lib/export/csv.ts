/**
 * CSV Export Utility
 *
 * Generates CSV files with proper escaping and UTF-8 BOM for Excel compatibility.
 */

import type { ColumnDef, ExportOptions, ColumnFormat } from './types';

/**
 * Default export options for CSV
 */
const DEFAULT_OPTIONS: ExportOptions = {
  includeBom: true,
  dateFormat: 'DD.MM.YYYY',
  currencySymbol: 'EUR',
  decimalSeparator: ',',
  thousandsSeparator: '.',
};

/**
 * UTF-8 BOM (Byte Order Mark)
 * Required for Excel to correctly interpret UTF-8 encoded CSV files
 */
const UTF8_BOM = '\uFEFF';

/**
 * CSV field delimiter
 */
const DELIMITER = ';'; // Semicolon is common in German locales

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, part: string) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[part];
  }, obj);
}

/**
 * Escape a CSV field value
 *
 * Rules:
 * - If the value contains quotes, double them
 * - If the value contains delimiter, newline, or quotes, wrap in quotes
 *
 * @param value - The value to escape
 * @returns Escaped string ready for CSV
 */
/**
 * Characters that could trigger formula execution in spreadsheet applications
 */
const FORMULA_CHARS = ['=', '+', '-', '@', '\t', '\r'];

function escapeField(value: string): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  // Prevent CSV formula injection by prefixing dangerous characters with a single quote
  if (FORMULA_CHARS.some(c => stringValue.startsWith(c))) {
    return "'" + stringValue;
  }

  // Check if escaping is needed
  const needsEscaping =
    stringValue.includes('"') ||
    stringValue.includes(DELIMITER) ||
    stringValue.includes('\n') ||
    stringValue.includes('\r');

  if (needsEscaping) {
    // Double any existing quotes and wrap in quotes
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }

  return stringValue;
}

/**
 * Format a date according to the specified format
 */
function formatDate(date: Date, format: string): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return format
    .replace('DD', day)
    .replace('MM', month)
    .replace('YYYY', String(year))
    .replace('YY', String(year).slice(-2));
}

/**
 * Format a number with German locale (comma as decimal separator)
 */
function formatNumber(
  value: number,
  decimalPlaces: number = 2,
  options: ExportOptions
): string {
  const parts = value.toFixed(decimalPlaces).split('.');
  const integerPart = parts[0].replace(
    /\B(?=(\d{3})+(?!\d))/g,
    options.thousandsSeparator || '.'
  );
  const decimalPart = parts[1];

  return decimalPart
    ? `${integerPart}${options.decimalSeparator || ','}${decimalPart}`
    : integerPart;
}

/**
 * Format a value based on column format type for CSV output
 */
function formatValue(
  value: unknown,
  format: ColumnFormat | undefined,
  options: ExportOptions
): string {
  if (value === null || value === undefined) {
    return '';
  }

  // Handle Decimal objects from Prisma
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    value = (value as { toNumber: () => number }).toNumber();
  }

  switch (format) {
    case 'date':
      if (value instanceof Date) {
        return formatDate(value, options.dateFormat || 'DD.MM.YYYY');
      }
      if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return formatDate(date, options.dateFormat || 'DD.MM.YYYY');
        }
      }
      return String(value);

    case 'number':
      if (typeof value === 'number') {
        return formatNumber(value, 2, options);
      }
      const num = parseFloat(String(value));
      return isNaN(num) ? String(value) : formatNumber(num, 2, options);

    case 'currency':
      if (typeof value === 'number') {
        return `${formatNumber(value, 2, options)} ${options.currencySymbol || 'EUR'}`;
      }
      const currencyNum = parseFloat(String(value));
      if (!isNaN(currencyNum)) {
        return `${formatNumber(currencyNum, 2, options)} ${options.currencySymbol || 'EUR'}`;
      }
      return String(value);

    case 'percentage':
      if (typeof value === 'number') {
        return `${formatNumber(value, 2, options)}%`;
      }
      const pctNum = parseFloat(String(value));
      if (!isNaN(pctNum)) {
        return `${formatNumber(pctNum, 2, options)}%`;
      }
      return String(value);

    case 'text':
    default:
      // Handle objects/arrays by converting to JSON string
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
  }
}

/**
 * Generate a CSV string from data
 *
 * @param data - Array of data objects to export
 * @param columns - Column definitions
 * @param options - Export options
 * @returns CSV string with optional UTF-8 BOM
 */
export function generateCsv(
  data: Record<string, unknown>[],
  columns: ColumnDef[],
  options?: ExportOptions
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Build header row
  const headerRow = columns.map((col) => escapeField(col.header)).join(DELIMITER);

  // Build data rows
  const dataRows = data.map((row) => {
    return columns
      .map((col) => {
        let value = getNestedValue(row, col.key);

        // Apply custom transformer if provided
        if (col.transform) {
          value = col.transform(value, row);
        }

        const formattedValue = formatValue(value, col.format, opts);
        return escapeField(formattedValue);
      })
      .join(DELIMITER);
  });

  // Combine all rows
  const csvContent = [headerRow, ...dataRows].join('\r\n');

  // Add UTF-8 BOM if requested (for Excel compatibility)
  if (opts.includeBom) {
    return UTF8_BOM + csvContent;
  }

  return csvContent;
}

/**
 * Generate CSV for download (with proper encoding)
 *
 * @param data - Array of data objects to export
 * @param columns - Column definitions
 * @param options - Export options
 * @returns Buffer containing the CSV file
 */
export function generateCsvBuffer(
  data: Record<string, unknown>[],
  columns: ColumnDef[],
  options?: ExportOptions
): Buffer {
  const csvString = generateCsv(data, columns, options);
  return Buffer.from(csvString, 'utf-8');
}

/**
 * Parse CSV string into array of objects
 * Useful for import functionality
 *
 * @param csv - CSV string to parse
 * @param hasHeader - Whether the first row is a header
 * @returns Array of parsed objects
 */
export function parseCsv(
  csv: string,
  hasHeader: boolean = true
): Record<string, unknown>[] {
  // Remove BOM if present
  const cleanCsv = csv.replace(/^\uFEFF/, '');

  // Split into lines
  const lines = cleanCsv.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length === 0) {
    return [];
  }

  // Parse a single line respecting quoted fields
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          field += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === DELIMITER && !inQuotes) {
        // End of field
        fields.push(field);
        field = '';
      } else {
        field += char;
      }
    }

    // Add last field
    fields.push(field);

    return fields;
  };

  if (hasHeader) {
    const headers = parseLine(lines[0]);
    return lines.slice(1).map((line) => {
      const values = parseLine(line);
      const obj: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || null;
      });
      return obj;
    });
  }

  // Without headers, return arrays as-is with numeric keys
  return lines.map((line) => {
    const values = parseLine(line);
    const obj: Record<string, unknown> = {};
    values.forEach((value, index) => {
      obj[String(index)] = value;
    });
    return obj;
  });
}
