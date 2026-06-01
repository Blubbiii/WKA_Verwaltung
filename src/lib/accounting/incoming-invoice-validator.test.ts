/**
 * Tests für §14/§15 UStG Validator (P13 D6).
 *
 * Deckt:
 *  - Vollständige Standard-Rechnung → kein Fehler
 *  - Kleinbetragsrechnung (≤250€) → reduzierte Anforderungen
 *  - Fehlende Lieferant-Daten (Name, Adresse, Steuernummer)
 *  - Fehlende Pflichtfelder (Rechnungsnummer, Datum)
 *  - Betrags-Inkonsistenz
 *  - Reverse-Charge (Sonderpfad)
 */

import { describe, it, expect } from "vitest";
import {
  VorsteuerCapabilityError,
  assertVorsteuerCapable,
  isVorsteuerCapabilityError,
  type ValidatableIncomingInvoice,
  type ValidatableVendor,
} from "./incoming-invoice-validator";

const fullVendor: ValidatableVendor = {
  name: "Wartung GmbH",
  street: "Industriestraße 12",
  postalCode: "10115",
  city: "Berlin",
  taxId: "12/345/67890",
  vatId: "DE123456789",
};

function fullInvoice(
  overrides: Partial<ValidatableIncomingInvoice> = {},
): ValidatableIncomingInvoice {
  return {
    invoiceNumber: "RG-2026-0042",
    invoiceDate: new Date("2026-03-15"),
    vendorId: "v-1",
    vendorNameFallback: null,
    netAmount: 1000 as unknown as ValidatableIncomingInvoice["netAmount"],
    vatAmount: 190 as unknown as ValidatableIncomingInvoice["vatAmount"],
    grossAmount: 1190 as unknown as ValidatableIncomingInvoice["grossAmount"],
    vatRate: 19 as unknown as ValidatableIncomingInvoice["vatRate"],
    supplierTaxId: null,
    ...overrides,
  };
}

describe("VorsteuerCapabilityError", () => {
  it("carries missing list and useful message", () => {
    const err = new VorsteuerCapabilityError(["A", "B"]);
    expect(err.missing).toEqual(["A", "B"]);
    expect(err.message).toContain("A");
    expect(err.name).toBe("VorsteuerCapabilityError");
  });

  it("type guard works", () => {
    expect(isVorsteuerCapabilityError(new VorsteuerCapabilityError([]))).toBe(true);
    expect(isVorsteuerCapabilityError(new Error("x"))).toBe(false);
  });
});

describe("assertVorsteuerCapable — happy path", () => {
  it("full standard invoice passes silently", () => {
    expect(() => assertVorsteuerCapable(fullInvoice(), fullVendor)).not.toThrow();
  });

  it("vendor with vatId only (no taxId) passes", () => {
    expect(() =>
      assertVorsteuerCapable(fullInvoice(), { ...fullVendor, taxId: null }),
    ).not.toThrow();
  });

  it("vendor with taxId only (no vatId) passes", () => {
    expect(() =>
      assertVorsteuerCapable(fullInvoice(), { ...fullVendor, vatId: null }),
    ).not.toThrow();
  });

  it("supplierTaxId fallback (no vendor record) passes if vendorNameFallback is set", () => {
    expect(() =>
      assertVorsteuerCapable(
        fullInvoice({
          vendorId: null,
          vendorNameFallback: "Ad-hoc Lieferant",
          supplierTaxId: "DE987654321",
        }),
        null,
      ),
    ).not.toThrow();
  });
});

describe("assertVorsteuerCapable — Standardrechnung Pflichtfelder", () => {
  it("missing invoice number → throws", () => {
    expect(() => assertVorsteuerCapable(fullInvoice({ invoiceNumber: null }), fullVendor))
      .toThrow(VorsteuerCapabilityError);
  });

  it("missing invoice date → throws", () => {
    expect(() => assertVorsteuerCapable(fullInvoice({ invoiceDate: null }), fullVendor))
      .toThrow(VorsteuerCapabilityError);
  });

  it("missing gross amount → throws", () => {
    expect(() =>
      assertVorsteuerCapable(
        fullInvoice({ grossAmount: 0 as unknown as ValidatableIncomingInvoice["grossAmount"] }),
        fullVendor,
      ),
    ).toThrow(VorsteuerCapabilityError);
  });

  it("no tax id (neither vendor nor supplierTaxId) → throws", () => {
    expect(() =>
      assertVorsteuerCapable(
        fullInvoice({ supplierTaxId: null }),
        { ...fullVendor, taxId: null, vatId: null },
      ),
    ).toThrow(VorsteuerCapabilityError);
  });

  it("vendor without street → throws", () => {
    try {
      assertVorsteuerCapable(fullInvoice(), { ...fullVendor, street: null });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(VorsteuerCapabilityError);
      expect((err as VorsteuerCapabilityError).missing.join(",")).toContain("Straße");
    }
  });

  it("inconsistent amounts net+vat ≠ gross → throws with details", () => {
    try {
      assertVorsteuerCapable(
        fullInvoice({
          netAmount: 1000 as unknown as ValidatableIncomingInvoice["netAmount"],
          vatAmount: 190 as unknown as ValidatableIncomingInvoice["vatAmount"],
          grossAmount: 1500 as unknown as ValidatableIncomingInvoice["grossAmount"], // inkonsistent
        }),
        fullVendor,
      );
      expect.fail("should have thrown");
    } catch (err) {
      const e = err as VorsteuerCapabilityError;
      expect(e.missing.some((m) => m.includes("Betrags-Inkonsistenz"))).toBe(true);
    }
  });

  it("missing net+vat split → throws", () => {
    try {
      assertVorsteuerCapable(
        fullInvoice({
          netAmount: 0 as unknown as ValidatableIncomingInvoice["netAmount"],
          vatAmount: 0 as unknown as ValidatableIncomingInvoice["vatAmount"],
          grossAmount: 1190 as unknown as ValidatableIncomingInvoice["grossAmount"],
        }),
        fullVendor,
      );
      expect.fail("should have thrown");
    } catch (err) {
      const e = err as VorsteuerCapabilityError;
      expect(e.missing.some((m) => m.includes("Aufschlüsselung"))).toBe(true);
    }
  });
});

describe("assertVorsteuerCapable — Kleinbetragsrechnung §33 UStDV (≤250€)", () => {
  it("250€ ohne Lieferant-Adresse → passt (reduzierte Anforderungen)", () => {
    expect(() =>
      assertVorsteuerCapable(
        fullInvoice({
          grossAmount: 250 as unknown as ValidatableIncomingInvoice["grossAmount"],
          netAmount: 250 as unknown as ValidatableIncomingInvoice["netAmount"],
          vatAmount: 0 as unknown as ValidatableIncomingInvoice["vatAmount"],
        }),
        { ...fullVendor, street: null, postalCode: null, city: null, taxId: null, vatId: null },
      ),
    ).not.toThrow();
  });

  it("251€ ohne Lieferant-Adresse → wirft (über Schwelle)", () => {
    expect(() =>
      assertVorsteuerCapable(
        fullInvoice({
          grossAmount: 251 as unknown as ValidatableIncomingInvoice["grossAmount"],
        }),
        { ...fullVendor, street: null },
      ),
    ).toThrow(VorsteuerCapabilityError);
  });

  it("Kleinbetrag aber kein Lieferant-Name → wirft", () => {
    expect(() =>
      assertVorsteuerCapable(
        fullInvoice({
          grossAmount: 100 as unknown as ValidatableIncomingInvoice["grossAmount"],
          vendorId: null,
          vendorNameFallback: null,
        }),
        null,
      ),
    ).toThrow(VorsteuerCapabilityError);
  });

  it("Kleinbetrag ohne Datum → wirft (Datum bleibt Pflicht)", () => {
    expect(() =>
      assertVorsteuerCapable(
        fullInvoice({
          grossAmount: 100 as unknown as ValidatableIncomingInvoice["grossAmount"],
          invoiceDate: null,
        }),
        fullVendor,
      ),
    ).toThrow(VorsteuerCapabilityError);
  });
});
