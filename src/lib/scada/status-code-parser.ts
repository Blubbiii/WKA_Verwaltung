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
 */

import * as XLSX from "xlsx";

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
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse an Enercon ServiceOrderDocuments XLSX buffer into status codes.
 */
export function parseStatusCodeXlsx(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("XLSX enthält kein Arbeitsblatt");
  }

  const sheet = workbook.Sheets[sheetName];
  // Convert to array of arrays (each row = string[])
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: true,
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

    const colA = String(cols[0] ?? "").trim();
    const colB = String(cols[1] ?? "").trim();
    const colC = String(cols[2] ?? "").trim();
    const colD = String(cols[3] ?? "").trim();
    const colG = String(cols[6] ?? "").trim();

    // Main code group header: col B has $N (col A is empty)
    if (!colA && colB.startsWith("$")) {
      const parsed = parseInt(colB.substring(1), 10);
      if (!isNaN(parsed)) {
        currentMainCode = parsed;
        currentParentLabel = colC || null;
      }
      continue;
    }

    // Sub code entry: col A has $N
    if (colA.startsWith("$")) {
      const subCode = parseInt(colA.substring(1), 10);
      if (isNaN(subCode)) continue;

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
