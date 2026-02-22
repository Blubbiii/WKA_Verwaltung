/**
 * Excel Export Utility
 *
 * Generates XLSX files with proper formatting, headers, and data types.
 * Uses the xlsx library (SheetJS) for Excel generation.
 */

import * as XLSX from 'xlsx';
import type { ColumnDef, ExportOptions, ColumnFormat } from './types';

/**
 * Default export options
 */
const DEFAULT_OPTIONS: ExportOptions = {
  sheetName: 'Export',
  dateFormat: 'DD.MM.YYYY',
  currencySymbol: 'EUR',
  decimalSeparator: ',',
  thousandsSeparator: '.',
};

/**
 * Get nested value from object using dot notation
 * e.g., getNestedValue(obj, 'person.firstName') => obj.person.firstName
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, part: string) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[part];
  }, obj);
}

/**
 * Format a value based on column format type
 */
function formatValue(
  value: unknown,
  format: ColumnFormat | undefined,
  options: ExportOptions
): string | number | Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  switch (format) {
    case 'date':
      if (value instanceof Date) {
        return value;
      }
      if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
      return String(value);

    case 'number':
      if (typeof value === 'number') {
        return value;
      }
      const num = parseFloat(String(value));
      return isNaN(num) ? String(value) : num;

    case 'currency':
      if (typeof value === 'number') {
        return value;
      }
      // Handle Decimal objects from Prisma
      if (typeof value === 'object' && value !== null && 'toNumber' in value) {
        return (value as { toNumber: () => number }).toNumber();
      }
      const currencyNum = parseFloat(String(value));
      return isNaN(currencyNum) ? String(value) : currencyNum;

    case 'percentage':
      if (typeof value === 'number') {
        return value / 100; // Excel expects percentage as decimal
      }
      // Handle Decimal objects from Prisma
      if (typeof value === 'object' && value !== null && 'toNumber' in value) {
        return (value as { toNumber: () => number }).toNumber() / 100;
      }
      const pctNum = parseFloat(String(value));
      return isNaN(pctNum) ? String(value) : pctNum / 100;

    case 'text':
    default:
      // Handle Decimal objects from Prisma
      if (typeof value === 'object' && value !== null && 'toNumber' in value) {
        return (value as { toNumber: () => number }).toNumber();
      }
      // Handle objects/arrays by converting to JSON string
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
  }
}

/**
 * Get Excel number format string for column type
 */
function getNumberFormat(format: ColumnFormat | undefined): string | undefined {
  switch (format) {
    case 'date':
      return 'DD.MM.YYYY';
    case 'currency':
      return '#,##0.00 "EUR"';
    case 'percentage':
      return '0.00%';
    case 'number':
      return '#,##0.00';
    default:
      return undefined;
  }
}

/**
 * Generate an Excel workbook from data
 *
 * @param data - Array of data objects to export
 * @param columns - Column definitions
 * @param sheetName - Name of the worksheet
 * @param options - Export options
 * @returns Buffer containing the XLSX file
 */
export function generateExcel(
  data: Record<string, unknown>[],
  columns: ColumnDef[],
  sheetName?: string,
  options?: ExportOptions
): Buffer {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const finalSheetName = sheetName || opts.sheetName || 'Export';

  // Create workbook and worksheet
  const workbook = XLSX.utils.book_new();

  // Build header row
  const headers = columns.map((col) => col.header);

  // Build data rows
  const rows: (string | number | Date | null)[][] = data.map((row) => {
    return columns.map((col) => {
      let value = getNestedValue(row, col.key);

      // Apply custom transformer if provided
      if (col.transform) {
        value = col.transform(value, row);
      }

      return formatValue(value, col.format, opts);
    });
  });

  // Combine headers and data
  const worksheetData = [headers, ...rows];

  // Create worksheet from array
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Set column widths
  const colWidths: XLSX.ColInfo[] = columns.map((col) => ({
    wch: col.width || Math.max(col.header.length, 15),
  }));
  worksheet['!cols'] = colWidths;

  // Apply cell formatting
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

  // Style header row (bold)
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!worksheet[cellRef]) continue;

    worksheet[cellRef].s = {
      font: { bold: true },
      fill: { fgColor: { rgb: 'E0E0E0' } },
      alignment: { horizontal: 'center' },
    };
  }

  // Apply number formats to data cells
  for (let row = 1; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      if (!worksheet[cellRef]) continue;

      const columnDef = columns[col];
      const numberFormat = getNumberFormat(columnDef?.format);

      if (numberFormat) {
        worksheet[cellRef].z = numberFormat;
      }
    }
  }

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, finalSheetName);

  // Generate buffer
  const excelBuffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
    bookSST: false,
  });

  return Buffer.from(excelBuffer);
}

/**
 * Generate Excel with multiple sheets
 *
 * @param sheets - Array of { name, data, columns } objects
 * @param options - Export options
 * @returns Buffer containing the XLSX file
 */
export function generateExcelMultiSheet(
  sheets: Array<{
    name: string;
    data: Record<string, unknown>[];
    columns: ColumnDef[];
  }>,
  options?: ExportOptions
): Buffer {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    // Build header row
    const headers = sheet.columns.map((col) => col.header);

    // Build data rows
    const rows: (string | number | Date | null)[][] = sheet.data.map((row) => {
      return sheet.columns.map((col) => {
        let value = getNestedValue(row, col.key);

        if (col.transform) {
          value = col.transform(value, row);
        }

        return formatValue(value, col.format, opts);
      });
    });

    // Combine headers and data
    const worksheetData = [headers, ...rows];

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // Set column widths
    const colWidths: XLSX.ColInfo[] = sheet.columns.map((col) => ({
      wch: col.width || Math.max(col.header.length, 15),
    }));
    worksheet['!cols'] = colWidths;

    // Apply header styling
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
      if (!worksheet[cellRef]) continue;

      worksheet[cellRef].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: 'E0E0E0' } },
        alignment: { horizontal: 'center' },
      };
    }

    // Apply number formats
    for (let row = 1; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        if (!worksheet[cellRef]) continue;

        const columnDef = sheet.columns[col];
        const numberFormat = getNumberFormat(columnDef?.format);

        if (numberFormat) {
          worksheet[cellRef].z = numberFormat;
        }
      }
    }

    // Add to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }

  const excelBuffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
    bookSST: false,
  });

  return Buffer.from(excelBuffer);
}
