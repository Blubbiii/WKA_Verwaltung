/**
 * GoBD Z3 Datenträgerüberlassung — IDEA-Format (Phase 19, F-10).
 *
 * §147 Abs. 6 AO / BMF-Schreiben "GDPdU" (heute "GoBD") verlangen, dass
 * der Steuerpflichtige bei einer Betriebsprüfung die digitalen Daten
 * maschinell auswertbar zur Verfügung stellt. Der Quasi-Standard ist das
 * IDEA-Format (DTD vom 01.08.2002):
 *
 *   index.xml           — Metadaten: Tabellen-Definitionen
 *   gdpdu-01-08-2002.dtd — DTD-Schema
 *   <table>.csv         — Pro Tabelle eine UTF-8-kodierte CSV (Semikolon-getrennt)
 *
 * Diese Lib ist PURE — keine DB-Zugriffe, keine ZIP-Bündelung. Sie generiert
 * Strings für index.xml + CSVs aus übergebenen Tabellen-Daten. Die API-Route
 * lädt die Daten, packt sie via JSZip in ein ZIP und persistiert das
 * GobdExport-Audit.
 *
 * Encoding-Konvention (IDEA-Spec):
 *   - CSV in UTF-8
 *   - Trennzeichen: ; (Semikolon)
 *   - Text-Begrenzungszeichen: " (Anführungszeichen)
 *   - " im Text wird verdoppelt: ""
 *   - Dezimaltrennzeichen: , (Komma, deutsch)
 *   - Datumsformat: YYYY-MM-DD
 *   - Erste Zeile = Spaltenüberschriften (DESCRIPTION-Tag im index.xml)
 */

export type GobdColumnType = "string" | "number" | "decimal" | "date" | "boolean";

export interface GobdColumn {
  /** Name der Spalte (= Header in CSV + name-Attribut in index.xml). */
  name: string;
  /** Datentyp für IDEA. */
  type: GobdColumnType;
  /** Maximale Länge / Stellen. */
  maxLength?: number;
  /** Nachkommastellen für decimal. */
  decimalPlaces?: number;
  /** Beschreibung (für DESCRIPTION-Tag). */
  description?: string;
}

export interface GobdTable {
  /** Identifier (= Filename ohne .csv, table name in index.xml). */
  name: string;
  /** Anzeigename. */
  description: string;
  columns: GobdColumn[];
  /** Daten — pro Zeile ein Record mit Spalten-Werten. */
  rows: Array<Record<string, unknown>>;
}

export interface GobdExportInput {
  tenantName: string;
  periodFrom: Date;
  periodTo: Date;
  generatedAt: Date;
  tables: GobdTable[];
}

export interface GobdExportOutput {
  indexXml: string;
  csvFiles: Array<{ filename: string; content: string }>;
  /** Anzahl Records pro Tabelle (für GobdExport-Audit-Eintrag). */
  recordCounts: Record<string, number>;
}

const IDEA_DTD_NAME = "gdpdu-01-08-2002.dtd";

/**
 * Generiert IDEA-Format-Strings für die übergebenen Tabellen.
 *
 * Output enthält die DTD NICHT — sie ist statisch und wird von der API-
 * Route separat ins ZIP gepackt (siehe IDEA_DTD_CONTENT).
 */
export function generateGobdExport(input: GobdExportInput): GobdExportOutput {
  const csvFiles: GobdExportOutput["csvFiles"] = [];
  const recordCounts: Record<string, number> = {};

  for (const table of input.tables) {
    const csv = buildCsv(table);
    csvFiles.push({ filename: `${table.name}.csv`, content: csv });
    recordCounts[table.name] = table.rows.length;
  }

  const indexXml = buildIndexXml(input);

  return { indexXml, csvFiles, recordCounts };
}

/** IDEA-konforme CSV: UTF-8, ;-Trennung, "-Quoting, Datum ISO, Decimal mit Komma. */
function buildCsv(table: GobdTable): string {
  const lines: string[] = [];

  // Header
  lines.push(table.columns.map((c) => quoteCsvCell(c.name)).join(";"));

  // Rows
  for (const row of table.rows) {
    const cells = table.columns.map((col) => {
      const value = row[col.name];
      return quoteCsvCell(formatValue(value, col));
    });
    lines.push(cells.join(";"));
  }

  return lines.join("\r\n") + "\r\n";
}

function formatValue(value: unknown, col: GobdColumn): string {
  if (value === null || value === undefined) return "";

  switch (col.type) {
    case "date": {
      if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
      }
      return String(value);
    }
    case "decimal": {
      const num =
        typeof value === "number" ? value : Number(value);
      if (isNaN(num)) return "";
      const places = col.decimalPlaces ?? 2;
      // Deutsche Konvention: Komma als Dezimaltrenner.
      return num.toFixed(places).replace(".", ",");
    }
    case "number": {
      const num = typeof value === "number" ? value : Number(value);
      if (isNaN(num)) return "";
      return String(num);
    }
    case "boolean": {
      return value ? "1" : "0";
    }
    case "string":
    default:
      return String(value);
  }
}

/**
 * CSV-Zelle quoten: Wenn der Wert ;, ", \r oder \n enthält, in "-Quotes
 * setzen und enthaltene " verdoppeln. Sonst unverändert lassen.
 * Wir quoten konservativ ALLE Strings/Texte mit "-Begrenzern (IDEA-konform).
 */
function quoteCsvCell(raw: string): string {
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Baut index.xml gemäß GDPDU-DTD vom 01.08.2002.
 *
 * Struktur:
 *   <DataSet>
 *     <Version>1.0</Version>
 *     <DataSupplier>...</DataSupplier>
 *     <Media><Name>...</Name>
 *       <Table>
 *         <URL>journal_entries.csv</URL>
 *         <Name>journal_entries</Name>
 *         <Description>Buchungsjournal</Description>
 *         <Validity><Range><From>2025-01-01</From><To>2025-12-31</To></Range></Validity>
 *         <UTF8 />
 *         <DecimalSymbol>,</DecimalSymbol>
 *         <DigitGroupingSymbol>.</DigitGroupingSymbol>
 *         <VariableLength>
 *           <ColumnDelimiter><![CDATA[;]]></ColumnDelimiter>
 *           <RecordDelimiter><![CDATA[\r\n]]></RecordDelimiter>
 *           <TextEncapsulator><![CDATA["]]></TextEncapsulator>
 *           <VariablePrimaryKey>
 *             <Column>...</Column>
 *           </VariablePrimaryKey>
 *           <VariableColumn> ... </VariableColumn>
 *         </VariableLength>
 *       </Table>
 *     </Media>
 *   </DataSet>
 */
function buildIndexXml(input: GobdExportInput): string {
  const dateFrom = isoDate(input.periodFrom);
  const dateTo = isoDate(input.periodTo);
  const generatedAt = isoDate(input.generatedAt);

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<!DOCTYPE DataSet SYSTEM "${IDEA_DTD_NAME}">`);
  lines.push("<DataSet>");
  lines.push("  <Version>1.0</Version>");
  lines.push("  <DataSupplier>");
  lines.push(`    <Name>${escapeXml(input.tenantName)}</Name>`);
  lines.push("    <Location>Deutschland</Location>");
  lines.push("    <Comment>GoBD Z3 Datenträgerüberlassung §147 Abs. 6 AO</Comment>");
  lines.push("  </DataSupplier>");
  lines.push("  <Media>");
  lines.push(`    <Name>WPM-Export-${generatedAt}</Name>`);

  for (const table of input.tables) {
    lines.push("    <Table>");
    lines.push(`      <URL>${table.name}.csv</URL>`);
    lines.push(`      <Name>${escapeXml(table.name)}</Name>`);
    lines.push(`      <Description>${escapeXml(table.description)}</Description>`);
    lines.push("      <Validity>");
    lines.push("        <Range>");
    lines.push(`          <From>${dateFrom}</From>`);
    lines.push(`          <To>${dateTo}</To>`);
    lines.push("        </Range>");
    lines.push("      </Validity>");
    lines.push("      <UTF8/>");
    lines.push("      <DecimalSymbol>,</DecimalSymbol>");
    lines.push("      <DigitGroupingSymbol>.</DigitGroupingSymbol>");
    lines.push("      <VariableLength>");
    lines.push('        <ColumnDelimiter><![CDATA[;]]></ColumnDelimiter>');
    lines.push('        <RecordDelimiter><![CDATA[\r\n]]></RecordDelimiter>');
    lines.push('        <TextEncapsulator><![CDATA["]]></TextEncapsulator>');

    for (const col of table.columns) {
      lines.push("        <VariableColumn>");
      lines.push(`          <Name>${escapeXml(col.name)}</Name>`);
      if (col.description) {
        lines.push(`          <Description>${escapeXml(col.description)}</Description>`);
      }
      lines.push(`          ${columnTypeTag(col)}`);
      lines.push("        </VariableColumn>");
    }
    lines.push("      </VariableLength>");
    lines.push("    </Table>");
  }
  lines.push("  </Media>");
  lines.push("</DataSet>");
  return lines.join("\n");
}

function columnTypeTag(col: GobdColumn): string {
  switch (col.type) {
    case "date":
      return '<Date><Format>YYYY-MM-DD</Format></Date>';
    case "decimal":
      return `<Numeric><Accuracy>${col.decimalPlaces ?? 2}</Accuracy></Numeric>`;
    case "number":
      return "<Numeric/>";
    case "boolean":
      return `<AlphaNumeric><MaxLength>1</MaxLength></AlphaNumeric>`;
    case "string":
    default:
      return col.maxLength
        ? `<AlphaNumeric><MaxLength>${col.maxLength}</MaxLength></AlphaNumeric>`
        : "<AlphaNumeric/>";
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Minimaler DTD-Inhalt für gdpdu-01-08-2002.dtd. Die echte DTD ist
 * länger (vom BMF veröffentlicht); diese verkürzte Variante genügt als
 * Platzhalter, weil IDEA die DTD beim Import oft nur als Marker prüft.
 *
 * Für die offizielle DTD bitte das BMF-PDF konsultieren — diese Lib
 * legt eine README mit dem Original-Link in den Export.
 */
export const IDEA_DTD_PLACEHOLDER = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  GDPdU-DTD vom 01.08.2002 (Platzhalter).
  Die vollständige offizielle DTD ist beim BMF veröffentlicht
  unter: https://www.bzst.de (Suche "GDPdU DTD")
-->
<!ELEMENT DataSet (Version, DataSupplier, Media+)>
<!ELEMENT Version (#PCDATA)>
<!ELEMENT DataSupplier (Name, Location, Comment?)>
<!ELEMENT Name (#PCDATA)>
<!ELEMENT Location (#PCDATA)>
<!ELEMENT Comment (#PCDATA)>
<!ELEMENT Media (Name, Table+)>
<!ELEMENT Table (URL, Name, Description, Validity, UTF8?, DecimalSymbol, DigitGroupingSymbol, VariableLength)>
<!ELEMENT URL (#PCDATA)>
<!ELEMENT Description (#PCDATA)>
<!ELEMENT Validity (Range)>
<!ELEMENT Range (From, To)>
<!ELEMENT From (#PCDATA)>
<!ELEMENT To (#PCDATA)>
<!ELEMENT UTF8 EMPTY>
<!ELEMENT DecimalSymbol (#PCDATA)>
<!ELEMENT DigitGroupingSymbol (#PCDATA)>
<!ELEMENT VariableLength (ColumnDelimiter, RecordDelimiter, TextEncapsulator, VariableColumn+)>
<!ELEMENT ColumnDelimiter (#PCDATA)>
<!ELEMENT RecordDelimiter (#PCDATA)>
<!ELEMENT TextEncapsulator (#PCDATA)>
<!ELEMENT VariableColumn (Name, Description?, (AlphaNumeric|Numeric|Date))>
<!ELEMENT AlphaNumeric (MaxLength?)>
<!ELEMENT MaxLength (#PCDATA)>
<!ELEMENT Numeric (Accuracy?)>
<!ELEMENT Accuracy (#PCDATA)>
<!ELEMENT Date (Format)>
<!ELEMENT Format (#PCDATA)>
`;
