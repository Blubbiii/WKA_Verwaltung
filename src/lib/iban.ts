/**
 * IBAN-Validierung nach ISO 13616 + ISO 7064 Mod-97 (Phase 18).
 *
 * Implementiert ohne externes Package — der Algorithmus ist kompakt
 * und stabil. Wir prüfen drei Ebenen:
 *   1. Format (Länderkürzel + Prüfziffer + BBAN, nur A-Z/0-9)
 *   2. Länderspezifische Länge (z.B. DE=22, AT=20)
 *   3. Mod-97-Prüfsumme (kryptographisch korrekt)
 *
 * Wird vom SEPA-Export VOR der XML-Generierung aufgerufen — eine
 * fehlerhafte IBAN würde sonst erst von der Bank abgelehnt (und das
 * kostet im Zweifel den ganzen Batch).
 */

export interface IbanValidationResult {
  valid: boolean;
  /** Normalisierte IBAN (uppercase, keine Whitespaces). */
  normalized: string;
  /** Länderkürzel (z.B. "DE"). */
  countryCode: string | null;
  /** Fehler-Code wenn ungültig. */
  errorCode: IbanError | null;
}

export type IbanError =
  | "EMPTY"
  | "INVALID_CHARACTERS"
  | "TOO_SHORT"
  | "TOO_LONG"
  | "UNKNOWN_COUNTRY"
  | "INVALID_LENGTH_FOR_COUNTRY"
  | "INVALID_CHECKSUM";

/**
 * Länderspezifische IBAN-Längen (SEPA + häufige Drittländer).
 * Liste laut ECB/SWIFT Stand 2024.
 */
export const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28,
  BA: 20, BE: 16, BG: 22, BH: 22, BR: 29,
  CH: 21, CR: 22, CY: 28, CZ: 24,
  DE: 22, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24,
  FI: 18, FO: 18, FR: 27,
  GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28,
  HR: 21, HU: 28,
  IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27,
  JO: 30,
  KW: 30, KZ: 20,
  LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25,
  MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30,
  NL: 18, NO: 15,
  PK: 24, PL: 28, PS: 29, PT: 25,
  QA: 29,
  RO: 24, RS: 22,
  SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28,
  TL: 23, TN: 24, TR: 26,
  UA: 29,
  VA: 22, VG: 24,
  XK: 20,
};

/**
 * Validiert eine IBAN nach ISO 7064 Mod-97.
 */
export function validateIban(raw: string | null | undefined): IbanValidationResult {
  if (!raw) {
    return { valid: false, normalized: "", countryCode: null, errorCode: "EMPTY" };
  }

  const normalized = raw.replace(/\s+/g, "").toUpperCase();
  if (normalized.length === 0) {
    return { valid: false, normalized: "", countryCode: null, errorCode: "EMPTY" };
  }
  if (!/^[A-Z0-9]+$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      countryCode: null,
      errorCode: "INVALID_CHARACTERS",
    };
  }
  if (normalized.length < 15) {
    return { valid: false, normalized, countryCode: null, errorCode: "TOO_SHORT" };
  }
  if (normalized.length > 34) {
    return { valid: false, normalized, countryCode: null, errorCode: "TOO_LONG" };
  }

  const countryCode = normalized.slice(0, 2);
  const expectedLength = IBAN_LENGTHS[countryCode];

  if (!expectedLength) {
    return {
      valid: false,
      normalized,
      countryCode,
      errorCode: "UNKNOWN_COUNTRY",
    };
  }
  if (normalized.length !== expectedLength) {
    return {
      valid: false,
      normalized,
      countryCode,
      errorCode: "INVALID_LENGTH_FOR_COUNTRY",
    };
  }

  // Mod-97-Prüfsumme:
  //  1. Erste vier Zeichen ans Ende verschieben
  //  2. Buchstaben durch Zahlen ersetzen (A=10, B=11, ..., Z=35)
  //  3. Resultierende Zahl mod 97 muss 1 ergeben
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  let numeric = "";
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      numeric += ch; // 0-9
    } else if (code >= 65 && code <= 90) {
      numeric += (code - 55).toString(); // A=10..Z=35
    }
  }

  // Mod-97 für sehr lange Strings: chunkweise rechnen, weil JS-Number
  // nicht so viele Stellen exakt halten kann.
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    const chunk = remainder.toString() + numeric.slice(i, i + 7);
    remainder = Number(chunk) % 97;
  }

  if (remainder !== 1) {
    return {
      valid: false,
      normalized,
      countryCode,
      errorCode: "INVALID_CHECKSUM",
    };
  }

  return { valid: true, normalized, countryCode, errorCode: null };
}

/** Convenience-Wrapper für Boolean-Checks. */
export function isValidIban(raw: string | null | undefined): boolean {
  return validateIban(raw).valid;
}

/**
 * Wirft IbanValidationError wenn IBAN ungültig — für Caller die abbrechen wollen.
 */
export class IbanValidationError extends Error {
  constructor(
    public readonly errorCode: IbanError,
    public readonly inputIban: string,
  ) {
    super(`IBAN ungültig (${errorCode}): "${inputIban}"`);
    this.name = "IbanValidationError";
  }
}

export function assertValidIban(raw: string | null | undefined): string {
  const result = validateIban(raw);
  if (!result.valid) {
    throw new IbanValidationError(result.errorCode ?? "EMPTY", raw ?? "");
  }
  return result.normalized;
}
