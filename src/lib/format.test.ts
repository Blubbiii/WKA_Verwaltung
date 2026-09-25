import { describe, it, expect } from "vitest";
import { formatCurrency, formatCurrencyCompact, formatDate, formatDateTime, restlaufzeit, restlaufzeitText, istVerschluesselterRohwert } from "./format";

// =============================================================================
// formatCurrency
// =============================================================================

describe("formatCurrency", () => {
  it("formatiert positive Betraege im deutschen EUR-Format", () => {
    const result = formatCurrency(1234.56);
    // Intl can use different space chars (narrow no-break space U+202F)
    expect(result).toMatch(/1\.234,56/);
    expect(result).toContain("€");
  });

  it("formatiert 0 korrekt", () => {
    const result = formatCurrency(0);
    expect(result).toMatch(/0,00/);
    expect(result).toContain("€");
  });

  it("formatiert negative Betraege", () => {
    const result = formatCurrency(-500.99);
    expect(result).toMatch(/500,99/);
    expect(result).toContain("€");
    // Should contain a minus sign (could be hyphen or minus character)
    expect(result).toMatch(/-/);
  });

  it("formatiert grosse Betraege mit Tausender-Trennzeichen", () => {
    const result = formatCurrency(1000000);
    expect(result).toMatch(/1\.000\.000,00/);
  });

  it("formatiert Dezimalzahlen mit zwei Nachkommastellen", () => {
    const result = formatCurrency(42.1);
    expect(result).toMatch(/42,10/);
  });

  it("akzeptiert String-Werte und konvertiert sie", () => {
    const result = formatCurrency("1234.56");
    expect(result).toMatch(/1\.234,56/);
  });

  it('gibt "-" zurück für null', () => {
    expect(formatCurrency(null)).toBe("-");
  });

  it('gibt "-" zurück für undefined', () => {
    expect(formatCurrency(undefined)).toBe("-");
  });

  it('gibt "-" zurück für nicht-numerische Strings', () => {
    expect(formatCurrency("abc")).toBe("-");
    expect(formatCurrency("")).toBe("-");
  });

  it("formatiert sehr kleine Betraege korrekt", () => {
    const result = formatCurrency(0.01);
    expect(result).toMatch(/0,01/);
  });

  it("formatiert sehr grosse Betraege korrekt", () => {
    const result = formatCurrency(9999999.99);
    expect(result).toMatch(/9\.999\.999,99/);
  });
});

// =============================================================================
// formatCurrencyCompact
// =============================================================================

describe("formatCurrencyCompact", () => {
  it("formatiert kleine Betraege ohne Kompaktierung", () => {
    const result = formatCurrencyCompact(500);
    expect(result).toContain("€");
    expect(result).toContain("500");
  });

  it("formatiert Tausender kompakt", () => {
    const result = formatCurrencyCompact(500000);
    expect(result).toContain("€");
    // German compact format uses "Tsd." for thousands
    expect(result).toMatch(/500/);
  });

  it("formatiert Millionen kompakt", () => {
    const result = formatCurrencyCompact(1200000);
    expect(result).toContain("€");
    // German compact format uses "Mio." for millions
    expect(result).toMatch(/1,2/);
  });

  it('gibt "-" zurück für null', () => {
    expect(formatCurrencyCompact(null)).toBe("-");
  });

  it('gibt "-" zurück für undefined', () => {
    expect(formatCurrencyCompact(undefined)).toBe("-");
  });

  it('gibt "-" zurück für nicht-numerische Strings', () => {
    expect(formatCurrencyCompact("xyz")).toBe("-");
  });

  it("akzeptiert String-Werte", () => {
    const result = formatCurrencyCompact("1000");
    expect(result).toContain("€");
  });

  it("formatiert 0 korrekt", () => {
    const result = formatCurrencyCompact(0);
    expect(result).toMatch(/0/);
    expect(result).toContain("€");
  });
});

// =============================================================================
// formatDate
// =============================================================================

describe("formatDate", () => {
  it("formatiert ein Date-Objekt als dd.MM.yyyy", () => {
    const result = formatDate(new Date(2026, 0, 15)); // 15. Jan 2026
    expect(result).toBe("15.01.2026");
  });

  it("formatiert einen ISO-String als dd.MM.yyyy", () => {
    const result = formatDate("2026-03-07T12:00:00Z");
    expect(result).toMatch(/07\.03\.2026/);
  });

  it('gibt "\u2013" zurueck fuer null', () => {
    expect(formatDate(null)).toBe("\u2013");
  });

  it('gibt "\u2013" zurueck fuer undefined', () => {
    expect(formatDate(undefined)).toBe("\u2013");
  });

  it('gibt "\u2013" zurueck fuer ungueltigen Datums-String', () => {
    expect(formatDate("kein-datum")).toBe("\u2013");
  });
});

// =============================================================================
// formatDateTime
// =============================================================================

describe("formatDateTime", () => {
  it("formatiert mit Datum und Uhrzeit (dd.MM.yyyy, HH:mm)", () => {
    // Use a fixed UTC date and check that both date and time parts appear
    const result = formatDateTime(new Date("2026-03-07T14:30:00Z"));
    // Date part
    expect(result).toMatch(/07\.03\.2026/);
    // Time part (hour may differ due to timezone, but minutes should be :30)
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it('gibt "\u2013" zurueck fuer null', () => {
    expect(formatDateTime(null)).toBe("\u2013");
  });
});

// =============================================================================
// restlaufzeit — "8954 Tage" war auf einer 25-jährigen Pacht nicht lesbar
// =============================================================================

describe("restlaufzeit", () => {
  const heute = new Date(2026, 8, 25); // 25.09.2026

  it("zerlegt eine lange Laufzeit in Jahre, Monate und Tage", () => {
    // 25.09.2026 + 24 J = 25.09.2050, + 6 M = 25.03.2051, + 6 T = 31.03.2051
    expect(restlaufzeit(new Date(2051, 2, 31), heute)).toEqual({ jahre: 24, monate: 6, tage: 6 });
  });

  it("kurze Laufzeit ohne volles Jahr", () => {
    // 25.09. + 2 M = 25.11., + 29 T = 24.12.
    expect(restlaufzeit(new Date(2026, 11, 24), heute)).toEqual({ jahre: 0, monate: 2, tage: 29 });
  });

  it("abgelaufen oder heute endend: null", () => {
    expect(restlaufzeit(new Date(2026, 8, 24), heute)).toBeNull();
    expect(restlaufzeit(new Date(2026, 8, 25), heute)).toBeNull();
  });
});

describe("restlaufzeitText", () => {
  // Stub translator: shows which key was chosen with which count.
  const t = (key: string, v: { count?: number; days?: number }) => `${key}=${v.count ?? v.days}`;

  it("nennt Jahre und Monate, Tage erst unter einem Monat", () => {
    expect(restlaufzeitText({ jahre: 24, monate: 6, tage: 6 }, t)).toBe("years=24, months=6");
    expect(restlaufzeitText({ jahre: 3, monate: 0, tage: 12 }, t)).toBe("years=3");
    expect(restlaufzeitText({ jahre: 0, monate: 0, tage: 12 }, t)).toBe("days=12");
  });
});

describe("istVerschluesselterRohwert", () => {
  // Server returns the ciphertext when decryption fails (e.g. missing key):
  // base64 of salt(64) + iv(16) + tag(16) + data — at least 97 bytes.
  const chiffre = Buffer.alloc(120, 7).toString("base64");

  it("erkennt Chiffretext", () => {
    expect(istVerschluesselterRohwert(chiffre)).toBe(true);
  });

  it("lässt echte Bankdaten durch", () => {
    expect(istVerschluesselterRohwert("DE89370400440532013000")).toBe(false);
    expect(istVerschluesselterRohwert("DE89 3704 0044 0532 0130 00")).toBe(false);
    expect(istVerschluesselterRohwert("COBADEFFXXX")).toBe(false);
    expect(istVerschluesselterRohwert("Volksbank Nordfriesland eG")).toBe(false);
    expect(istVerschluesselterRohwert(null)).toBe(false);
  });
});
