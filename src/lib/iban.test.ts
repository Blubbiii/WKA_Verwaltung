/**
 * Tests für IBAN-Validierung (P18 D9).
 *
 * Test-IBANs aus offiziellen Beispiel-Listen (ECB / SWIFT). Die meisten
 * sind echte Bank-Testkonten oder bekannte Test-Werte.
 */

import { describe, it, expect } from "vitest";
import {
  IbanValidationError,
  assertValidIban,
  isValidIban,
  validateIban,
} from "./iban";

describe("validateIban — gültige IBANs", () => {
  it.each([
    "DE89370400440532013000", // DE Bundesbank
    "DE 89 3704 0044 0532 0130 00", // Whitespace-tolerant
    "de89370400440532013000", // Case-tolerant
    "AT611904300234573201", // AT Beispiel
    "CH9300762011623852957", // CH Beispiel
    "FR1420041010050500013M02606", // FR Beispiel
    "GB29NWBK60161331926819", // GB Beispiel
    "NL91ABNA0417164300", // NL Beispiel
    "BE68539007547034", // BE Beispiel
    "IT60X0542811101000000123456", // IT Beispiel
  ])("%s → valid", (iban) => {
    expect(validateIban(iban).valid).toBe(true);
  });

  it("normalizes whitespace and case", () => {
    const r = validateIban("de 89 3704 0044 0532 0130 00");
    expect(r.valid).toBe(true);
    expect(r.normalized).toBe("DE89370400440532013000");
    expect(r.countryCode).toBe("DE");
  });
});

describe("validateIban — ungültige IBANs", () => {
  it("null/undefined/empty → EMPTY", () => {
    expect(validateIban(null).errorCode).toBe("EMPTY");
    expect(validateIban(undefined).errorCode).toBe("EMPTY");
    expect(validateIban("").errorCode).toBe("EMPTY");
    expect(validateIban("    ").errorCode).toBe("EMPTY");
  });

  it("Sonderzeichen → INVALID_CHARACTERS", () => {
    expect(validateIban("DE89-3704-0044").errorCode).toBe("INVALID_CHARACTERS");
    expect(validateIban("DE89 + 3704").errorCode).toBe("INVALID_CHARACTERS");
  });

  it("Zu kurz → TOO_SHORT", () => {
    expect(validateIban("DE89").errorCode).toBe("TOO_SHORT");
  });

  it("Zu lang → TOO_LONG", () => {
    expect(
      validateIban("DE89370400440532013000DE89370400440532013000").errorCode,
    ).toBe("TOO_LONG");
  });

  it("Unbekanntes Land → UNKNOWN_COUNTRY", () => {
    expect(validateIban("XX89370400440532013000").errorCode).toBe(
      "UNKNOWN_COUNTRY",
    );
  });

  it("Falsche Länge für Land → INVALID_LENGTH_FOR_COUNTRY", () => {
    // DE-IBAN soll 22 Zeichen haben, hier 21
    expect(validateIban("DE8937040044053201300").errorCode).toBe(
      "INVALID_LENGTH_FOR_COUNTRY",
    );
  });

  it("Falsche Prüfsumme → INVALID_CHECKSUM", () => {
    // DE89370400440532013000 → letzte Ziffer geändert
    expect(validateIban("DE89370400440532013001").errorCode).toBe(
      "INVALID_CHECKSUM",
    );
  });
});

describe("isValidIban / assertValidIban", () => {
  it("isValidIban liefert boolean", () => {
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("DE89370400440532013001")).toBe(false);
  });

  it("assertValidIban liefert normalisierte IBAN bei gültig", () => {
    expect(assertValidIban("de 89 3704 0044 0532 0130 00")).toBe(
      "DE89370400440532013000",
    );
  });

  it("assertValidIban wirft IbanValidationError bei ungültig", () => {
    expect(() => assertValidIban("invalid")).toThrow(IbanValidationError);
  });

  it("Geworfener Fehler enthält errorCode + inputIban", () => {
    try {
      assertValidIban("DE89370400440532013001");
      expect.fail();
    } catch (err) {
      expect(err).toBeInstanceOf(IbanValidationError);
      const e = err as IbanValidationError;
      expect(e.errorCode).toBe("INVALID_CHECKSUM");
      expect(e.inputIban).toBe("DE89370400440532013001");
    }
  });
});

describe("Mod-97 Algorithmus — Edge-Cases", () => {
  it("Sehr lange IBAN (MT 31 Stellen)", () => {
    // Maltesisches Beispiel
    const iban = "MT84MALT011000012345MTLCAST001S";
    expect(validateIban(iban).valid).toBe(true);
  });

  it("LC mit 32 Zeichen (längste IBAN)", () => {
    expect(validateIban("LC55HEMM000100010012001200023015").valid).toBe(true);
  });
});
