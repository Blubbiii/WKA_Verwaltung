/**
 * Tests für GoBD Z3 IDEA-Format-Generator (P19, F-10).
 *
 * Deckt:
 *  - index.xml — Grundstruktur, DTD-Verweis, Spalten-Typen
 *  - CSV — Header + Row-Encoding, ;-Trenner, "-Quoting, Datum ISO,
 *    Decimal mit Komma, "-Verdopplung im Text
 *  - Mehrere Tabellen
 *  - Leere Tabelle (nur Header)
 *  - XML-Escaping
 */

import { describe, it, expect } from "vitest";
import { generateGobdExport, type GobdTable } from "./gobd-export";

const TENANT_NAME = "Beispiel GmbH";
const FROM = new Date("2025-01-01Z");
const TO = new Date("2025-12-31Z");
const GENERATED = new Date("2026-06-01Z");

function table(overrides: Partial<GobdTable> = {}): GobdTable {
  return {
    name: "journal_entries",
    description: "Buchungsjournal",
    columns: [
      { name: "id", type: "string", maxLength: 36 },
      { name: "entryDate", type: "date" },
      { name: "amount", type: "decimal", decimalPlaces: 2 },
    ],
    rows: [
      { id: "j-1", entryDate: new Date("2025-03-15Z"), amount: 100 },
      { id: "j-2", entryDate: new Date("2025-04-20Z"), amount: 250.5 },
    ],
    ...overrides,
  };
}

describe("generateGobdExport — index.xml", () => {
  it("Enthält DOCTYPE-Verweis auf gdpdu-DTD", () => {
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [table()],
    });
    expect(r.indexXml).toContain('<!DOCTYPE DataSet SYSTEM "gdpdu-01-08-2002.dtd">');
  });

  it("DataSupplier enthält Tenant-Name", () => {
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [table()],
    });
    expect(r.indexXml).toContain(`<Name>${TENANT_NAME}</Name>`);
  });

  it("Tenant-Name mit XML-Sonderzeichen wird escaped", () => {
    const r = generateGobdExport({
      tenantName: "Smith & Co. <Test>",
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [table()],
    });
    expect(r.indexXml).toContain("Smith &amp; Co. &lt;Test&gt;");
    expect(r.indexXml).not.toContain("Smith & Co. <Test>");
  });

  it("Period from/to korrekt formatiert (ISO)", () => {
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [table()],
    });
    expect(r.indexXml).toContain("<From>2025-01-01</From>");
    expect(r.indexXml).toContain("<To>2025-12-31</To>");
  });

  it("Decimal-Symbol = , und Group-Symbol = . (deutsche Konvention)", () => {
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [table()],
    });
    expect(r.indexXml).toContain("<DecimalSymbol>,</DecimalSymbol>");
    expect(r.indexXml).toContain("<DigitGroupingSymbol>.</DigitGroupingSymbol>");
  });

  it("CSV-Delimiter ; und Text-Encapsulator \" werden ausgewiesen", () => {
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [table()],
    });
    expect(r.indexXml).toContain('<ColumnDelimiter><![CDATA[;]]></ColumnDelimiter>');
    expect(r.indexXml).toContain('<TextEncapsulator><![CDATA["]]></TextEncapsulator>');
  });

  it("Decimal-Spalte → Numeric mit Accuracy", () => {
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [table()],
    });
    expect(r.indexXml).toContain("<Numeric><Accuracy>2</Accuracy></Numeric>");
  });

  it("Date-Spalte → Date mit Format YYYY-MM-DD", () => {
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [table()],
    });
    expect(r.indexXml).toContain("<Date><Format>YYYY-MM-DD</Format></Date>");
  });

  it("String-Spalte mit maxLength → AlphaNumeric mit MaxLength-Tag", () => {
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [table()],
    });
    expect(r.indexXml).toContain("<AlphaNumeric><MaxLength>36</MaxLength></AlphaNumeric>");
  });
});

describe("generateGobdExport — CSV", () => {
  it("Erste Zeile = Header mit Spaltennamen in \"...\"", () => {
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [table()],
    });
    const csv = r.csvFiles[0].content;
    const firstLine = csv.split("\r\n")[0];
    expect(firstLine).toBe('"id";"entryDate";"amount"');
  });

  it("Datum als ISO YYYY-MM-DD", () => {
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [table()],
    });
    const csv = r.csvFiles[0].content;
    expect(csv).toContain('"2025-03-15"');
  });

  it("Decimal mit deutschem Komma + festen Nachkommastellen", () => {
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [table()],
    });
    const csv = r.csvFiles[0].content;
    expect(csv).toContain('"100,00"');
    expect(csv).toContain('"250,50"');
  });

  it("\" im Text wird verdoppelt", () => {
    const t = table({
      columns: [
        { name: "id", type: "string" },
        { name: "text", type: "string" },
      ],
      rows: [{ id: "1", text: 'Er sagte "Hallo"' }],
    });
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [t],
    });
    const csv = r.csvFiles[0].content;
    expect(csv).toContain('"Er sagte ""Hallo"""');
  });

  it("Null/undefined → leerer String", () => {
    const t = table({
      columns: [
        { name: "id", type: "string" },
        { name: "amount", type: "decimal" },
      ],
      rows: [{ id: "x", amount: null }],
    });
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [t],
    });
    expect(r.csvFiles[0].content).toContain('"x";""');
  });

  it("Endet mit \\r\\n (Windows-Convention für IDEA)", () => {
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [table()],
    });
    expect(r.csvFiles[0].content.endsWith("\r\n")).toBe(true);
  });

  it("Boolean → 1 oder 0", () => {
    const t = table({
      columns: [
        { name: "id", type: "string" },
        { name: "active", type: "boolean" },
      ],
      rows: [
        { id: "a", active: true },
        { id: "b", active: false },
      ],
    });
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [t],
    });
    expect(r.csvFiles[0].content).toContain('"a";"1"');
    expect(r.csvFiles[0].content).toContain('"b";"0"');
  });
});

describe("generateGobdExport — Mehrere Tabellen", () => {
  it("Liefert eine CSV pro Tabelle", () => {
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [
        table({ name: "journal_entries" }),
        table({ name: "invoices", description: "Ausgangsrechnungen" }),
      ],
    });
    expect(r.csvFiles).toHaveLength(2);
    expect(r.csvFiles[0].filename).toBe("journal_entries.csv");
    expect(r.csvFiles[1].filename).toBe("invoices.csv");
  });

  it("recordCounts wird pro Tabelle korrekt befüllt", () => {
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [
        table({ name: "journal_entries" }), // 2 rows
        table({
          name: "invoices",
          rows: [
            { id: "i-1", entryDate: new Date("2025-03-15Z"), amount: 100 },
          ],
        }),
      ],
    });
    expect(r.recordCounts).toEqual({
      journal_entries: 2,
      invoices: 1,
    });
  });

  it("Leere Tabelle → Header-Only-CSV + recordCount=0", () => {
    const r = generateGobdExport({
      tenantName: TENANT_NAME,
      periodFrom: FROM,
      periodTo: TO,
      generatedAt: GENERATED,
      tables: [table({ rows: [] })],
    });
    expect(r.recordCounts.journal_entries).toBe(0);
    // Erste Zeile = Header, kein Row darunter (nur eine \r\n nach Header)
    expect(r.csvFiles[0].content.split("\r\n").filter((s) => s.length > 0)).toHaveLength(1);
  });
});
