import { describe, it, expect } from "vitest";
import { formatCurrency, formatCurrencyCompact, formatDate, formatDateTime } from "./format";

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
