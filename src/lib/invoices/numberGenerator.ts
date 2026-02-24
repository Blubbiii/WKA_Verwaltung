import { prisma } from "@/lib/prisma";
import { InvoiceType } from "@prisma/client";

/**
 * Generiert eine formatierte Rechnungsnummer aus dem Format-String
 *
 * Platzhalter:
 * - {YEAR} = Volles Jahr (2026)
 * - {YY} = Kurzes Jahr (26)
 * - {NUMBER} = Fortlaufende Nummer mit führenden Nullen
 * - {MONTH} = Aktueller Monat (01-12)
 */
export function generateInvoiceNumber(
  format: string,
  number: number,
  digitCount: number,
  year?: number,
  month?: number
): string {
  const now = new Date();
  const currentYear = year ?? now.getFullYear();
  const currentMonth = month ?? now.getMonth() + 1;

  const paddedNumber = number.toString().padStart(digitCount, "0");

  return format
    .replace("{YEAR}", currentYear.toString())
    .replace("{YY}", currentYear.toString().slice(-2))
    .replace("{NUMBER}", paddedNumber)
    .replace("{MONTH}", currentMonth.toString().padStart(2, "0"));
}

/**
 * Generiert eine Vorschau der nächsten Nummer ohne zu inkrementieren
 */
export function generatePreview(
  format: string,
  nextNumber: number,
  digitCount: number
): string {
  return generateInvoiceNumber(format, nextNumber, digitCount);
}

/**
 * Holt die nächste Rechnungsnummer atomar (mit Locking)
 * Verwendet eine Transaktion um Race Conditions zu vermeiden
 */
export async function getNextInvoiceNumber(
  tenantId: string,
  type: InvoiceType
): Promise<{ number: string; sequenceId: string }> {
  const currentYear = new Date().getFullYear();

  // Atomare Transaktion für die Nummernvergabe
  const result = await prisma.$transaction(async (tx) => {
    // Sequence mit Lock holen oder erstellen
    let sequence = await tx.invoiceNumberSequence.findUnique({
      where: {
        tenantId_type: {
          tenantId,
          type,
        },
      },
    });

    // Falls keine Sequence existiert, erstelle eine mit Defaults
    if (!sequence) {
      sequence = await tx.invoiceNumberSequence.create({
        data: {
          tenantId,
          type,
          format: type === "INVOICE" ? "RG-{YEAR}-{NUMBER}" : "GS-{YEAR}-{NUMBER}",
          currentYear,
          nextNumber: 1,
          digitCount: 4,
        },
      });
    }

    // Jahr zurücksetzen wenn nötig
    if (sequence.currentYear !== currentYear) {
      sequence = await tx.invoiceNumberSequence.update({
        where: { id: sequence.id },
        data: {
          currentYear,
          nextNumber: 1,
        },
      });
    }

    // Nummer generieren
    const invoiceNumber = generateInvoiceNumber(
      sequence.format,
      sequence.nextNumber,
      sequence.digitCount,
      sequence.currentYear
    );

    // Nächste Nummer inkrementieren
    await tx.invoiceNumberSequence.update({
      where: { id: sequence.id },
      data: {
        nextNumber: sequence.nextNumber + 1,
      },
    });

    return {
      number: invoiceNumber,
      sequenceId: sequence.id,
    };
  });

  return result;
}

/**
 * Holt mehrere Rechnungsnummern auf einmal atomar (mit Locking)
 * Vermeidet N+1 Queries wenn viele Nummern in einer Schleife benötigt werden.
 * Inkrementiert den Zaehler einmal um `count` statt N einzelne Inkrements.
 */
export async function getNextInvoiceNumbers(
  tenantId: string,
  type: InvoiceType,
  count: number
): Promise<{ numbers: string[]; sequenceId: string }> {
  if (count <= 0) {
    return { numbers: [], sequenceId: "" };
  }

  const currentYear = new Date().getFullYear();

  const result = await prisma.$transaction(async (tx) => {
    // Sequence mit Lock holen oder erstellen
    let sequence = await tx.invoiceNumberSequence.findUnique({
      where: {
        tenantId_type: {
          tenantId,
          type,
        },
      },
    });

    if (!sequence) {
      sequence = await tx.invoiceNumberSequence.create({
        data: {
          tenantId,
          type,
          format: type === "INVOICE" ? "RG-{YEAR}-{NUMBER}" : "GS-{YEAR}-{NUMBER}",
          currentYear,
          nextNumber: 1,
          digitCount: 4,
        },
      });
    }

    // Jahr zurücksetzen wenn noetig
    if (sequence.currentYear !== currentYear) {
      sequence = await tx.invoiceNumberSequence.update({
        where: { id: sequence.id },
        data: {
          currentYear,
          nextNumber: 1,
        },
      });
    }

    // Alle Nummern generieren
    const numbers: string[] = [];
    const startNumber = sequence.nextNumber;
    for (let i = 0; i < count; i++) {
      numbers.push(
        generateInvoiceNumber(
          sequence.format,
          startNumber + i,
          sequence.digitCount,
          sequence.currentYear
        )
      );
    }

    // Zaehler einmal um count inkrementieren statt N einzelne Inkrements
    await tx.invoiceNumberSequence.update({
      where: { id: sequence.id },
      data: {
        nextNumber: startNumber + count,
      },
    });

    return {
      numbers,
      sequenceId: sequence.id,
    };
  });

  return result;
}

/**
 * Synchronous fallback: returns hardcoded default tax rates.
 * These values are used as last-resort defaults when no DB config exists.
 *
 * Prefer the async `getTaxRate()` from `@/lib/tax/tax-rates` whenever
 * a tenantId is available, as that version resolves rates from the
 * database (TaxRateConfig) and respects date-specific overrides.
 */
export function getDefaultTaxRateByType(taxType: "STANDARD" | "REDUCED" | "EXEMPT"): number {
  switch (taxType) {
    case "STANDARD":
      return 19.0;
    case "REDUCED":
      return 7.0;
    case "EXEMPT":
      return 0.0;
    default:
      return 19.0;
  }
}

/**
 * @deprecated Use `getDefaultTaxRateByType()` for synchronous fallback
 * or `getTaxRate()` from `@/lib/tax/tax-rates` for DB-backed rates.
 */
export const getTaxRateByType = getDefaultTaxRateByType;

/**
 * Berechnet Steuer und Brutto aus Netto.
 *
 * Pass `taxRateOverride` (from DB via getTaxRate()) to avoid using the
 * hardcoded fallback. When not provided, falls back to getDefaultTaxRateByType().
 */
export function calculateTaxAmounts(
  netAmount: number,
  taxType: "STANDARD" | "REDUCED" | "EXEMPT",
  taxRateOverride?: number
): {
  taxRate: number;
  taxAmount: number;
  grossAmount: number;
} {
  const taxRate = taxRateOverride ?? getDefaultTaxRateByType(taxType);
  const taxAmount = netAmount * (taxRate / 100);
  const grossAmount = netAmount + taxAmount;

  return {
    taxRate,
    taxAmount: Math.round(taxAmount * 100) / 100,
    grossAmount: Math.round(grossAmount * 100) / 100,
  };
}
