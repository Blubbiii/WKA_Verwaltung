import { describe, it, expect } from "vitest";
import { formatCurrency, formatCurrencyCompact } from "./format";

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

  it('gibt "-" zurueck fuer null', () => {
    expect(formatCurrency(null)).toBe("-");
  });

  it('gibt "-" zurueck fuer undefined', () => {
    expect(formatCurrency(undefined)).toBe("-");
  });

  it('gibt "-" zurueck fuer nicht-numerische Strings', () => {
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

  it('gibt "-" zurueck fuer null', () => {
    expect(formatCurrencyCompact(null)).toBe("-");
  });

  it('gibt "-" zurueck fuer undefined', () => {
    expect(formatCurrencyCompact(undefined)).toBe("-");
  });

  it('gibt "-" zurueck fuer nicht-numerische Strings', () => {
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
