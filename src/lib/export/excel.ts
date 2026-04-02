/**
 * Excel Export Utility
 *
 * Generates XLSX files with proper formatting, headers, and data types.
 * Uses the exceljs library for Excel generation (actively maintained).
 */

import ExcelJS from 'exceljs';
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
  _options: ExportOptions
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
 * Get ExcelJS number format string for column type
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
 * Apply header row styling to a worksheet row
 */
function styleHeaderRow(row: ExcelJS.Row, colCount: number): void {
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    cell.alignment = { horizontal: 'center' };
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
export async function generateExcel(
  data: Record<string, unknown>[],
  columns: ColumnDef[],
  sheetName?: string,
  options?: ExportOptions
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const finalSheetName = sheetName || opts.sheetName || 'Export';

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(finalSheetName);

  // Set column widths
  worksheet.columns = columns.map((col) => ({
    width: col.width || Math.max(col.header.length, 15),
  }));

  // Add header row
  const headerRow = worksheet.addRow(columns.map((col) => col.header));
  styleHeaderRow(headerRow, columns.length);

  // Add data rows
  for (const rowData of data) {
    const rowValues = columns.map((col) => {
      let value = getNestedValue(rowData, col.key);
      if (col.transform) {
        value = col.transform(value, rowData);
      }
      return formatValue(value, col.format, opts);
    });

    const row = worksheet.addRow(rowValues);

    // Apply number formats per cell
    columns.forEach((col, colIdx) => {
      const numFmt = getNumberFormat(col.format);
      if (numFmt) {
        const cell = row.getCell(colIdx + 1);
        cell.numFmt = numFmt;
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Generate Excel with multiple sheets
 *
 * @param sheets - Array of { name, data, columns } objects
 * @param options - Export options
 * @returns Buffer containing the XLSX file
 */
export async function generateExcelMultiSheet(
  sheets: Array<{
    name: string;
    data: Record<string, unknown>[];
    columns: ColumnDef[];
  }>,
  options?: ExportOptions
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const workbook = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);

    // Set column widths
    worksheet.columns = sheet.columns.map((col) => ({
      width: col.width || Math.max(col.header.length, 15),
    }));

    // Add header row
    const headerRow = worksheet.addRow(sheet.columns.map((col) => col.header));
    styleHeaderRow(headerRow, sheet.columns.length);

    // Add data rows
    for (const rowData of sheet.data) {
      const rowValues = sheet.columns.map((col) => {
        let value = getNestedValue(rowData, col.key);
        if (col.transform) {
          value = col.transform(value, rowData);
        }
        return formatValue(value, col.format, opts);
      });

      const row = worksheet.addRow(rowValues);

      // Apply number formats per cell
      sheet.columns.forEach((col, colIdx) => {
        const numFmt = getNumberFormat(col.format);
        if (numFmt) {
          const cell = row.getCell(colIdx + 1);
          cell.numFmt = numFmt;
        }
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
