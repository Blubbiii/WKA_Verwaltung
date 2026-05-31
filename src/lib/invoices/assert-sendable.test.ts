/**
 * Unit-Tests für §14 UStG Pflichtangaben-Validator.
 */

import { describe, expect, it } from "vitest";
import {
  assertSendable,
  isSendableAssertionError,
  type AssertableInvoice,
  type AssertableTenant,
} from "./assert-sendable";

function makeTenant(overrides: Partial<AssertableTenant> = {}): AssertableTenant {
  return {
    name: "Test Energie GmbH",
    taxId: "12/345/67890",
    vatId: null,
    address: null,
    city: "Berlin",
    postalCode: "10115",
    street: "Hauptstrasse 1",
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<AssertableInvoice> = {}): AssertableInvoice {
  return {
    invoiceNumber: "RG-2026-0001",
    invoiceDate: new Date("2026-01-15"),
    recipientName: "Max Mustermann",
    recipientAddress: "Beispielstrasse 5, 12345 Berlin",
    serviceStartDate: new Date("2026-01-01"),
    serviceEndDate: new Date("2026-01-31"),
    netAmount: 100 as unknown as AssertableInvoice["netAmount"],
    taxAmount: 19 as unknown as AssertableInvoice["taxAmount"],
    grossAmount: 119 as unknown as AssertableInvoice["grossAmount"],
    items: [{ description: "Beratung", netAmount: 100 as unknown as AssertableInvoice["netAmount"] }],
    ...overrides,
  };
}

describe("assertSendable — happy path", () => {
  it("passes a valid invoice without throwing", () => {
    expect(() => assertSendable(makeInvoice(), makeTenant())).not.toThrow();
  });

  it("accepts vatId instead of taxId", () => {
    expect(() =>
      assertSendable(makeInvoice(), makeTenant({ taxId: null, vatId: "DE123456789" })),
    ).not.toThrow();
  });
});

describe("assertSendable — Tenant-Pflichtangaben", () => {
  it("throws when tenant name is missing", () => {
    expect(() => assertSendable(makeInvoice(), makeTenant({ name: "" }))).toThrow(
      /Firmenname/,
    );
  });

  it("throws when both taxId AND vatId are missing", () => {
    expect(() =>
      assertSendable(makeInvoice(), makeTenant({ taxId: null, vatId: null })),
    ).toThrow(/Steuernummer/);
  });

  it("throws when tenant address is incomplete", () => {
    expect(() =>
      assertSendable(
        makeInvoice(),
        makeTenant({ street: null, postalCode: null, city: null, address: null }),
      ),
    ).toThrow(/Anschrift/);
  });
});

describe("assertSendable — Empfänger-Pflichtangaben", () => {
  it("throws when recipientName is empty", () => {
    expect(() =>
      assertSendable(makeInvoice({ recipientName: "" }), makeTenant()),
    ).toThrow(/Empfängers/);
  });

  it("throws when recipientAddress is empty", () => {
    expect(() =>
      assertSendable(makeInvoice({ recipientAddress: "" }), makeTenant()),
    ).toThrow(/Anschrift/);
  });

  it("throws when recipientAddress has no digits (likely missing PLZ)", () => {
    expect(() =>
      assertSendable(
        makeInvoice({ recipientAddress: "Beispielstrasse, Berlin" }),
        makeTenant(),
      ),
    ).toThrow(/PLZ/);
  });
});

describe("assertSendable — Datum + Positionen", () => {
  it("throws when invoiceDate is missing", () => {
    expect(() =>
      assertSendable(
        makeInvoice({ invoiceDate: null as unknown as Date }),
        makeTenant(),
      ),
    ).toThrow(/Rechnungsdatum/);
  });

  it("throws when both service dates are missing", () => {
    expect(() =>
      assertSendable(
        makeInvoice({ serviceStartDate: null, serviceEndDate: null }),
        makeTenant(),
      ),
    ).toThrow(/Leistungs/);
  });

  it("passes when only serviceStartDate is set", () => {
    expect(() =>
      assertSendable(
        makeInvoice({ serviceEndDate: null }),
        makeTenant(),
      ),
    ).not.toThrow();
  });

  it("throws when items array is empty", () => {
    expect(() =>
      assertSendable(makeInvoice({ items: [] }), makeTenant()),
    ).toThrow(/Rechnungsposition/);
  });

  it("throws when an item has empty description", () => {
    expect(() =>
      assertSendable(
        makeInvoice({
          items: [
            { description: "", netAmount: 100 as unknown as AssertableInvoice["netAmount"] },
          ],
        }),
        makeTenant(),
      ),
    ).toThrow(/Beschreibung/);
  });
});

describe("assertSendable — Beträge", () => {
  it("throws when grossAmount is 0", () => {
    expect(() =>
      assertSendable(
        makeInvoice({
          netAmount: 0 as unknown as AssertableInvoice["netAmount"],
          taxAmount: 0 as unknown as AssertableInvoice["taxAmount"],
          grossAmount: 0 as unknown as AssertableInvoice["grossAmount"],
        }),
        makeTenant(),
      ),
    ).toThrow(/Bruttobetrag/);
  });

  it("throws when net + tax ≠ gross (inconsistency)", () => {
    expect(() =>
      assertSendable(
        makeInvoice({
          netAmount: 100 as unknown as AssertableInvoice["netAmount"],
          taxAmount: 19 as unknown as AssertableInvoice["taxAmount"],
          grossAmount: 200 as unknown as AssertableInvoice["grossAmount"],
        }),
        makeTenant(),
      ),
    ).toThrow(/Inkonsistenz/);
  });

  it("tolerates 2 cent rounding diff", () => {
    expect(() =>
      assertSendable(
        makeInvoice({
          netAmount: 100 as unknown as AssertableInvoice["netAmount"],
          taxAmount: 19 as unknown as AssertableInvoice["taxAmount"],
          grossAmount: 119.01 as unknown as AssertableInvoice["grossAmount"],
        }),
        makeTenant(),
      ),
    ).not.toThrow();
  });
});

describe("isSendableAssertionError", () => {
  it("returns true for SendableAssertionError instances", () => {
    try {
      assertSendable(makeInvoice({ invoiceNumber: "" }), makeTenant());
    } catch (err) {
      expect(isSendableAssertionError(err)).toBe(true);
      if (isSendableAssertionError(err)) {
        expect(err.missing).toContain("Rechnungsnummer");
      }
    }
  });

  it("returns false for other errors", () => {
    expect(isSendableAssertionError(new Error("other"))).toBe(false);
    expect(isSendableAssertionError("string")).toBe(false);
    expect(isSendableAssertionError(null)).toBe(false);
  });
});
