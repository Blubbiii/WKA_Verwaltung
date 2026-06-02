/**
 * Tests für SEPA Direct Debit Generator (P26).
 */

import { describe, it, expect } from "vitest";
import {
  SepaDirectDebitValidationError,
  generateSepaDirectDebitXml,
  type DirectDebitOptions,
} from "./sepa-direct-debit";

const VALID_CREDITOR_IBAN = "DE89370400440532013000";
const VALID_DEBTOR_IBAN = "DE12500105170648489890";

function baseOptions(): DirectDebitOptions {
  return {
    messageId: "TEST-DD-1",
    creationDateTime: "2026-06-01T10:00:00",
    creditorName: "WPM Tenant GmbH",
    creditorIban: VALID_CREDITOR_IBAN,
    creditorId: "DE98ZZZ09999999999",
    scheme: "CORE",
    requestedCollectionDate: "2026-06-15",
    payments: [
      {
        endToEndId: "E2E-1",
        mandate: {
          mandateId: "MNDT-001",
          signedDate: "2026-01-15",
          sequenceType: "FRST",
        },
        amount: 250,
        currency: "EUR",
        debtorName: "Müller GmbH",
        debtorIban: VALID_DEBTOR_IBAN,
        remittanceInfo: "Pacht 06/2026",
      },
    ],
  };
}

describe("generateSepaDirectDebitXml — Grundstruktur", () => {
  it("Liefert validen pain.008.001.02 XML", () => {
    const xml = generateSepaDirectDebitXml(baseOptions());
    expect(xml).toContain('<?xml');
    expect(xml).toContain('urn:iso:std:iso:20022:tech:xsd:pain.008.001.02');
    expect(xml).toContain("<CstmrDrctDbtInitn>");
    expect(xml).toContain("<PmtMtd>DD</PmtMtd>");
  });

  it("Enthält Creditor-IBAN + Debtor-IBAN + Mandat", () => {
    const xml = generateSepaDirectDebitXml(baseOptions());
    expect(xml).toContain(`<IBAN>${VALID_CREDITOR_IBAN}</IBAN>`);
    expect(xml).toContain(`<IBAN>${VALID_DEBTOR_IBAN}</IBAN>`);
    expect(xml).toContain("<MndtId>MNDT-001</MndtId>");
  });

  it("CORE Scheme + FRST Sequence", () => {
    const xml = generateSepaDirectDebitXml(baseOptions());
    expect(xml).toContain("<LclInstrm><Cd>CORE</Cd></LclInstrm>");
    expect(xml).toContain("<SeqTp>FRST</SeqTp>");
  });

  it("Beträge in Cent-Genauigkeit mit Punkt", () => {
    const xml = generateSepaDirectDebitXml(baseOptions());
    expect(xml).toContain('<InstdAmt Ccy="EUR">250.00</InstdAmt>');
    expect(xml).toContain("<CtrlSum>250.00</CtrlSum>");
  });
});

describe("generateSepaDirectDebitXml — B2B Scheme", () => {
  it("B2B + RCUR", () => {
    const opts = baseOptions();
    opts.scheme = "B2B";
    opts.payments[0].mandate.sequenceType = "RCUR";
    const xml = generateSepaDirectDebitXml(opts);
    expect(xml).toContain("<LclInstrm><Cd>B2B</Cd></LclInstrm>");
    expect(xml).toContain("<SeqTp>RCUR</SeqTp>");
  });
});

describe("generateSepaDirectDebitXml — IBAN-Validierung", () => {
  it("Ungültige Debtor-IBAN → SepaDirectDebitValidationError", () => {
    const opts = baseOptions();
    opts.payments[0].debtorIban = "DE89370400440532013001"; // falsche Prüfsumme
    expect(() => generateSepaDirectDebitXml(opts)).toThrow(
      SepaDirectDebitValidationError,
    );
  });

  it("Ungültige Creditor-IBAN → SepaDirectDebitValidationError", () => {
    const opts = baseOptions();
    opts.creditorIban = "DE99-INVALID";
    expect(() => generateSepaDirectDebitXml(opts)).toThrow(
      SepaDirectDebitValidationError,
    );
  });

  it("Whitespace in IBAN wird toleriert", () => {
    const opts = baseOptions();
    opts.payments[0].debtorIban = "DE 12 5001 0517 0648 4898 90";
    expect(() => generateSepaDirectDebitXml(opts)).not.toThrow();
  });
});

describe("generateSepaDirectDebitXml — Mehrere Payments mit unterschiedlichen Sequence-Types", () => {
  it("FRST + RCUR in separaten PmtInf-Blöcken", () => {
    const opts = baseOptions();
    opts.payments.push({
      endToEndId: "E2E-2",
      mandate: {
        mandateId: "MNDT-002",
        signedDate: "2025-12-01",
        sequenceType: "RCUR",
      },
      amount: 100,
      currency: "EUR",
      debtorName: "Schmidt Service",
      debtorIban: "DE02120300000000202051",
      remittanceInfo: "Wartung 06/2026",
    });
    const xml = generateSepaDirectDebitXml(opts);
    expect(xml).toContain("<SeqTp>FRST</SeqTp>");
    expect(xml).toContain("<SeqTp>RCUR</SeqTp>");
    // Gesamt-Summe
    expect(xml).toContain("<CtrlSum>350.00</CtrlSum>");
  });
});
