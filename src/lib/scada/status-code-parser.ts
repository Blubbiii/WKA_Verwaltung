/**
 * Parser for Enercon ServiceOrderDocuments XLSX files.
 *
 * These files contain hierarchical status/warning code lists per controller type.
 * Format (CSV representation of XLSX):
 *
 *   Row 3:  "Tx = Zeitschlüssel,,,,,,,Steuerungstyp,,,,CS82"  ← controller type in col 12 (L)
 *   Row 7+: ",$0,,,,,,,,,"        ← main code group header (col B = $N, col C = label)
 *           "$0,,,Anlage in Betrieb,,,T1,,,,,"  ← sub code entry (col A = $N, col D = desc, col G = T1-T6/W/I)
 *
 * Time keys T1-T6 map to IEC 61400-26-2 availability categories.
 *
 * Uses exceljs instead of xlsx (xlsx is unmaintained and has known vulnerabilities).
 */

import ExcelJS from "exceljs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedStatusCode {
  mainCode: number;
  subCode: number;
  description: string;
  parentLabel: string | null;
  timeKey: string | null; // T1-T6 or null
  messageType: string; // "S", "W", "I"
  codeType: string; // "STATUS", "WARNING", "INFO"
}

export interface ParseResult {
  controllerType: string | null;
  codes: ParsedStatusCode[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get cell value as raw (number or string) */
function cellRaw(cell: ExcelJS.Cell | undefined): string | number | null {
  if (!cell || cell.value === null || cell.value === undefined) return null;
  if (typeof cell.value === "number") return cell.value;
  if (typeof cell.value === "object" && "result" in cell.value) {
    return cell.value.result as string | number;
  }
  return String(cell.value);
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse an Enercon ServiceOrderDocuments XLSX buffer into status codes.
 */
export async function parseStatusCodeXlsx(buffer: Buffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("XLSX enthält kein Arbeitsblatt");
  }

  // Convert sheet to array of arrays (each row = values[])
  const rows: (string | number | null)[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values: (string | number | null)[] = [];
    for (let c = 1; c <= 12; c++) {
      values.push(cellRaw(row.getCell(c)));
    }
    rows.push(values);
  });

  // Try to extract controller type — search first 10 rows for a CS-pattern
  let controllerType: string | null = null;
  // Primary: row 3 (index 2), col 12 (index 11) — standard Enercon format
  if (rows.length >= 3) {
    const val = rows[2]?.[11];
    if (val) controllerType = String(val).trim();
  }
  // Fallback: scan first 10 rows for "CS" pattern (e.g. "CS82", "CS66", "CS101")
  if (!controllerType) {
    const csPattern = /\bCS\d{2,3}\b/;
    for (let r = 0; r < Math.min(10, rows.length); r++) {
      for (let c = 0; c < (rows[r]?.length ?? 0); c++) {
        const cell = String(rows[r]?.[c] ?? "").trim();
        const match = csPattern.exec(cell);
        if (match) {
          controllerType = match[0];
          break;
        }
      }
      if (controllerType) break;
    }
  }

  const codes: ParsedStatusCode[] = [];
  let currentMainCode = 0;
  let currentParentLabel: string | null = null;

  // Skip header rows (0-5), start parsing from row index 6
  for (let i = 6; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols || cols.length === 0) continue;

    const rawA = cols[0];
    const rawB = cols[1];
    const colC = String(cols[2] ?? "").trim();
    const colD = String(cols[3] ?? "").trim();
    const colG = String(cols[6] ?? "").trim();

    // Main code group header: col A is empty, col B is a number (plain integer format)
    // Also support legacy $N format: col A empty, col B starts with "$"
    if (rawA === "" || rawA === null || rawA === undefined) {
      const colB = String(rawB ?? "").trim();
      let parsed: number;
      if (typeof rawB === "number") {
        parsed = rawB;
      } else if (colB.startsWith("$")) {
        parsed = parseInt(colB.substring(1), 10);
      } else {
        parsed = parseInt(colB, 10);
      }
      if (!isNaN(parsed)) {
        currentMainCode = parsed;
        currentParentLabel = colC || null;
      }
      continue;
    }

    // Sub code entry: col A is a number (plain integer) or starts with "$"
    let subCode: number;
    if (typeof rawA === "number") {
      subCode = rawA;
    } else {
      const colA = String(rawA).trim();
      if (colA.startsWith("$")) {
        subCode = parseInt(colA.substring(1), 10);
      } else {
        subCode = parseInt(colA, 10);
      }
    }
    if (!isNaN(subCode)) {

      const description = colD;
      const typeIndicator = colG.toUpperCase();

      // Determine message type and time key
      let messageType: string;
      let timeKey: string | null;
      let codeType: string;

      if (/^T[1-6]$/.test(typeIndicator)) {
        messageType = "S";
        timeKey = typeIndicator;
        codeType = "STATUS";
      } else if (typeIndicator === "W") {
        messageType = "W";
        timeKey = null;
        codeType = "WARNING";
      } else if (typeIndicator === "I") {
        messageType = "I";
        timeKey = null;
        codeType = "INFO";
      } else {
        if (!typeIndicator && !description) continue;
        messageType = "S";
        timeKey = null;
        codeType = "STATUS";
      }

      // Skip entries without description (pure separator lines)
      if (!description) continue;

      codes.push({
        mainCode: currentMainCode,
        subCode,
        description,
        parentLabel: currentParentLabel,
        timeKey,
        messageType,
        codeType,
      });
    }
  }

  return { controllerType, codes };
}
