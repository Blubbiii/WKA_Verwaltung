import { describe, it, expect } from "vitest";
import { parseCamt054 } from "../camt054-parser";

// =============================================================================
// Helper: minimal CAMT.054 XML builder
// =============================================================================

function makeCamt054(entries: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.054.001.02">
  <BkToCstmrDbtCdtNtfctn>
    <Ntfctn>
      <Acct><Ccy>EUR</Ccy></Acct>
${entries}
    </Ntfctn>
  </BkToCstmrDbtCdtNtfctn>
</Document>`;
}

const CREDIT_ENTRY = `      <Ntry>
        <Amt Ccy="EUR">1234.56</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-01-15</Dt></BookgDt>
        <NtryDtls>
          <TxDtls>
            <Refs><TxId>REF123</TxId></Refs>
            <RmtInf><Ustrd>Rechnung 2026-001</Ustrd></RmtInf>
            <RltdPties>
              <Dbtr><Nm>Max Mustermann</Nm></Dbtr>
              <DbtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></DbtrAcct>
            </RltdPties>
          </TxDtls>
        </NtryDtls>
      </Ntry>`;

const DEBIT_ENTRY = `      <Ntry>
        <Amt Ccy="EUR">500.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-02-10</Dt></BookgDt>
        <NtryDtls>
          <TxDtls>
            <Refs><TxId>REF456</TxId></Refs>
            <RmtInf><Ustrd>Pacht Q1 2026</Ustrd></RmtInf>
            <RltdPties>
              <Cdtr><Nm>Grundstueckseigentuemer GmbH</Nm></Cdtr>
              <CdtrAcct><Id><IBAN>DE27100777770209299700</IBAN></Id></CdtrAcct>
            </RltdPties>
          </TxDtls>
        </NtryDtls>
      </Ntry>`;

// =============================================================================
// parseCamt054
// =============================================================================

describe("parseCamt054", () => {
  it("gibt leeres Array fuer ungueltige/leere XML-Eingabe zurueck", () => {
    expect(parseCamt054("")).toEqual([]);
    expect(parseCamt054("<foo>bar</foo>")).toEqual([]);
    expect(parseCamt054("not xml at all")).toEqual([]);
  });

  it("parst einen einfachen Credit-Eintrag (CRDT) korrekt", () => {
    const result = parseCamt054(makeCamt054(CREDIT_ENTRY));
    expect(result).toHaveLength(1);
    const tx = result[0];
    expect(tx.amount).toBe(1234.56);
    expect(tx.currency).toBe("EUR");
    expect(tx.reference).toBe("Rechnung 2026-001");
    expect(tx.date).toBeInstanceOf(Date);
    expect(tx.date.toISOString()).toContain("2026-01-15");
  });

  it("parst einen Debit-Eintrag (DBIT) mit negativem Betrag", () => {
    const result = parseCamt054(makeCamt054(DEBIT_ENTRY));
    expect(result).toHaveLength(1);
    const tx = result[0];
    expect(tx.amount).toBe(-500.0);
    expect(tx.currency).toBe("EUR");
  });

  it("extrahiert Gegenpartei-Name und IBAN (Credit)", () => {
    const result = parseCamt054(makeCamt054(CREDIT_ENTRY));
    const tx = result[0];
    // For CRDT, counterpart is the Debtor
    expect(tx.counterpartName).toBe("Max Mustermann");
    expect(tx.counterpartIban).toBe("DE89370400440532013000");
  });

  it("extrahiert Gegenpartei-Name und IBAN (Debit)", () => {
    const result = parseCamt054(makeCamt054(DEBIT_ENTRY));
    const tx = result[0];
    // For DBIT, counterpart is the Creditor
    expect(tx.counterpartName).toBe("Grundstueckseigentuemer GmbH");
    expect(tx.counterpartIban).toBe("DE27100777770209299700");
  });

  it("extrahiert Bank-Referenz aus Refs/TxId", () => {
    const result = parseCamt054(makeCamt054(CREDIT_ENTRY));
    expect(result[0].bankReference).toBe("REF123");
  });

  it("verarbeitet mehrere Eintraege in einer Notification", () => {
    const xml = makeCamt054(CREDIT_ENTRY + "\n" + DEBIT_ENTRY);
    const result = parseCamt054(xml);
    expect(result).toHaveLength(2);
    expect(result[0].amount).toBe(1234.56);
    expect(result[1].amount).toBe(-500.0);
  });

  it("gibt leeres Array zurueck wenn keine Eintraege vorhanden", () => {
    const xml = makeCamt054("");
    const result = parseCamt054(xml);
    expect(result).toEqual([]);
  });
});
