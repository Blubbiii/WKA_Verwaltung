/**
 * Tests für SEPA-Export IBAN-Validierung (P18 D9).
 *
 * Wir fokussieren auf die NEUE Validierungs-Logik — die XML-Generierung
 * selbst ist in der bestehenden Codebase implizit getestet.
 */

import { describe, it, expect } from "vitest";
import {
  SepaExportValidationError,
  generateSepaXml,
  type SepaExportOptions,
} from "./sepa-export";

const VALID_DEBTOR_IBAN = "DE89370400440532013000";
const VALID_CREDITOR_IBAN = "DE12500105170648489890";

function baseOptions(): SepaExportOptions {
  return {
    messageId: "TEST-MSG-1",
    creationDateTime: "2026-06-01T10:00:00",
    debtorName: "Test GmbH",
    debtorIban: VALID_DEBTOR_IBAN,
    payments: [
      {
        endToEndId: "E2E-1",
        amount: 100,
        currency: "EUR",
        creditorName: "Lieferant GmbH",
        creditorIban: VALID_CREDITOR_IBAN,
        remittanceInfo: "RG-2026-0042",
        requestedExecutionDate: "2026-06-15",
      },
    ],
  };
}

describe("generateSepaXml — IBAN-Validierung (P18)", () => {
  it("Gültige IBANs → XML wird generiert", () => {
    const xml = generateSepaXml(baseOptions());
    expect(xml).toContain("<?xml");
    expect(xml).toContain(VALID_DEBTOR_IBAN);
    expect(xml).toContain(VALID_CREDITOR_IBAN);
  });

  it("Ungültige debtor-IBAN → SepaExportValidationError mit Feld-Detail", () => {
    const opts = baseOptions();
    opts.debtorIban = "DE89370400440532013001"; // falsche Prüfsumme
    try {
      generateSepaXml(opts);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SepaExportValidationError);
      const e = err as SepaExportValidationError;
      expect(e.errors[0].field).toBe("debtorIban");
      expect(e.errors[0].reason).toContain("INVALID_CHECKSUM");
    }
  });

  it("Ungültige creditor-IBAN → Error mit Index-Hinweis", () => {
    const opts = baseOptions();
    opts.payments[0].creditorIban = "DE12500105170648489891"; // falsche Prüfsumme
    try {
      generateSepaXml(opts);
      expect.fail();
    } catch (err) {
      const e = err as SepaExportValidationError;
      expect(e.errors[0].field).toContain("payments[0]");
      expect(e.errors[0].field).toContain("Lieferant GmbH");
    }
  });

  it("Mehrere ungültige IBANs → alle in einer Error-Liste", () => {
    const opts = baseOptions();
    opts.debtorIban = "invalid-debtor";
    opts.payments[0].creditorIban = "invalid-creditor";
    opts.payments.push({
      endToEndId: "E2E-2",
      amount: 50,
      currency: "EUR",
      creditorName: "Lieferant 2",
      creditorIban: "DE89370400440532013001",
      remittanceInfo: "RG-2",
      requestedExecutionDate: "2026-06-15",
    });

    try {
      generateSepaXml(opts);
      expect.fail();
    } catch (err) {
      const e = err as SepaExportValidationError;
      expect(e.errors).toHaveLength(3); // debtor + 2 creditors
    }
  });

  it("Whitespace in IBAN wird toleriert (normalisiert in validateIban)", () => {
    const opts = baseOptions();
    opts.debtorIban = "DE 89 3704 0044 0532 0130 00";
    expect(() => generateSepaXml(opts)).not.toThrow();
  });
});
