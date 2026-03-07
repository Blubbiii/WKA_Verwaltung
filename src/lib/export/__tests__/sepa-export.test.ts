import { describe, it, expect } from "vitest";
import { generateSepaXml, SepaExportOptions } from "../sepa-export";

// =============================================================================
// Helper: minimal valid options
// =============================================================================

function makeOptions(overrides?: Partial<SepaExportOptions>): SepaExportOptions {
  return {
    messageId: "MSG-001",
    creationDateTime: "2026-01-15T10:00:00Z",
    debtorName: "Windpark Nordheide GbR",
    debtorIban: "DE89370400440532013000",
    debtorBic: "COBADEFFXXX",
    payments: [
      {
        endToEndId: "INV-2026-001",
        amount: 1234.56,
        currency: "EUR",
        creditorName: "Stadtwerke Hamburg",
        creditorIban: "DE27100777770209299700",
        creditorBic: "DEUTDEDBBER",
        remittanceInfo: "Rechnung 2026-001",
        requestedExecutionDate: "2026-01-20",
      },
    ],
    ...overrides,
  };
}

// =============================================================================
// generateSepaXml
// =============================================================================

describe("generateSepaXml", () => {
  it("erzeugt valides XML mit korrektem Root-Element und Namespace", () => {
    const xml = generateSepaXml(makeOptions());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("urn:iso:std:iso:20022:tech:xsd:pain.001.001.03");
    expect(xml).toContain("<Document");
    expect(xml).toContain("<CstmrCdtTrfInitn>");
  });

  it("enthaelt korrekte GrpHdr-Felder (MsgId, CreDtTm, NbOfTxs, CtrlSum)", () => {
    const xml = generateSepaXml(makeOptions());
    expect(xml).toContain("<MsgId>MSG-001</MsgId>");
    expect(xml).toContain("<CreDtTm>2026-01-15T10:00:00Z</CreDtTm>");
    expect(xml).toContain("<NbOfTxs>1</NbOfTxs>");
    expect(xml).toContain("<CtrlSum>1234.56</CtrlSum>");
  });

  it("enthaelt Debtor-Name und IBAN", () => {
    const xml = generateSepaXml(makeOptions());
    expect(xml).toContain("<Nm>Windpark Nordheide GbR</Nm>");
    expect(xml).toContain("<IBAN>DE89370400440532013000</IBAN>");
  });

  it("enthaelt Creditor-Name, IBAN, Betrag und Verwendungszweck", () => {
    const xml = generateSepaXml(makeOptions());
    expect(xml).toContain("<Nm>Stadtwerke Hamburg</Nm>");
    expect(xml).toContain("<IBAN>DE27100777770209299700</IBAN>");
    expect(xml).toContain('<InstdAmt Ccy="EUR">1234.56</InstdAmt>');
    expect(xml).toContain("<Ustrd>Rechnung 2026-001</Ustrd>");
  });

  it("berechnet korrekte Summe und Anzahl bei mehreren Zahlungen", () => {
    const xml = generateSepaXml(
      makeOptions({
        payments: [
          {
            endToEndId: "INV-001",
            amount: 100.0,
            currency: "EUR",
            creditorName: "Lieferant A",
            creditorIban: "DE89370400440532013000",
            remittanceInfo: "Rechnung A",
            requestedExecutionDate: "2026-01-20",
          },
          {
            endToEndId: "INV-002",
            amount: 250.5,
            currency: "EUR",
            creditorName: "Lieferant B",
            creditorIban: "DE27100777770209299700",
            remittanceInfo: "Rechnung B",
            requestedExecutionDate: "2026-01-20",
          },
        ],
      })
    );
    // GrpHdr counts all transactions
    expect(xml).toContain("<NbOfTxs>2</NbOfTxs>");
    expect(xml).toContain("<CtrlSum>350.50</CtrlSum>");
  });

  it("gruppiert Zahlungen nach Ausfuehrungsdatum in separate PmtInf-Bloecke", () => {
    const xml = generateSepaXml(
      makeOptions({
        payments: [
          {
            endToEndId: "INV-001",
            amount: 100.0,
            currency: "EUR",
            creditorName: "Lieferant A",
            creditorIban: "DE89370400440532013000",
            remittanceInfo: "Rechnung A",
            requestedExecutionDate: "2026-01-20",
          },
          {
            endToEndId: "INV-002",
            amount: 200.0,
            currency: "EUR",
            creditorName: "Lieferant B",
            creditorIban: "DE27100777770209299700",
            remittanceInfo: "Rechnung B",
            requestedExecutionDate: "2026-01-25",
          },
        ],
      })
    );
    // Two different execution dates → two PmtInf blocks
    const pmtInfCount = (xml.match(/<PmtInf>/g) || []).length;
    expect(pmtInfCount).toBe(2);
    expect(xml).toContain("<ReqdExctnDt>2026-01-20</ReqdExctnDt>");
    expect(xml).toContain("<ReqdExctnDt>2026-01-25</ReqdExctnDt>");
  });

  it("escaped XML-Sonderzeichen in Namen", () => {
    const xml = generateSepaXml(
      makeOptions({
        debtorName: 'Müller & Söhne <GmbH> "Test" O\'Brien',
      })
    );
    // The escapeXml function should have replaced special chars
    expect(xml).toContain("Müller &amp; Söhne &lt;GmbH&gt; &quot;Test&quot; O&apos;Brien");
    expect(xml).not.toContain("Müller & Söhne");
  });

  it("kuerzt lange Namen auf 140 Zeichen und EndToEndId auf 35 Zeichen", () => {
    const longName = "A".repeat(200);
    const longEndToEnd = "B".repeat(50);
    const xml = generateSepaXml(
      makeOptions({
        payments: [
          {
            endToEndId: longEndToEnd,
            amount: 10.0,
            currency: "EUR",
            creditorName: longName,
            creditorIban: "DE89370400440532013000",
            remittanceInfo: "Test",
            requestedExecutionDate: "2026-01-20",
          },
        ],
      })
    );
    // Creditor name truncated to 140
    expect(xml).toContain(`<Nm>${"A".repeat(140)}</Nm>`);
    expect(xml).not.toContain("A".repeat(141));
    // EndToEndId truncated to 35
    expect(xml).toContain(`<EndToEndId>${"B".repeat(35)}</EndToEndId>`);
    expect(xml).not.toContain("B".repeat(36));
  });

  it("verwendet NOTPROVIDED als Fallback wenn kein BIC angegeben", () => {
    const xml = generateSepaXml(
      makeOptions({
        payments: [
          {
            endToEndId: "INV-001",
            amount: 50.0,
            currency: "EUR",
            creditorName: "Test GmbH",
            creditorIban: "DE89370400440532013000",
            // creditorBic is undefined
            remittanceInfo: "Test",
            requestedExecutionDate: "2026-01-20",
          },
        ],
      })
    );
    expect(xml).toContain("<Id>NOTPROVIDED</Id>");
  });

  it("entfernt Leerzeichen aus IBAN", () => {
    const xml = generateSepaXml(
      makeOptions({
        payments: [
          {
            endToEndId: "INV-001",
            amount: 50.0,
            currency: "EUR",
            creditorName: "Test GmbH",
            creditorIban: "DE89 3704 0044 0532 0130 00",
            remittanceInfo: "Test",
            requestedExecutionDate: "2026-01-20",
          },
        ],
      })
    );
    expect(xml).toContain("<IBAN>DE89370400440532013000</IBAN>");
    expect(xml).not.toContain("DE89 3704");
  });
});
