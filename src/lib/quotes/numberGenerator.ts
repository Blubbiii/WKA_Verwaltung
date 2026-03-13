import { prisma } from "@/lib/prisma";

/**
 * Generates a formatted quote number from a format string.
 *
 * Placeholders:
 * - {YEAR} = Full year (2026)
 * - {YY} = Short year (26)
 * - {NUMBER} = Sequential number with leading zeros
 * - {MONTH} = Current month (01-12)
 */
export function generateQuoteNumber(
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
 * Gets the next quote number atomically (with locking).
 * Uses a transaction to prevent race conditions.
 */
export async function getNextQuoteNumber(
  tenantId: string
): Promise<{ number: string; sequenceId: string }> {
  const currentYear = new Date().getFullYear();

  const result = await prisma.$transaction(async (tx) => {
    let sequence = await tx.quoteNumberSequence.findUnique({
      where: { tenantId },
    });

    if (!sequence) {
      sequence = await tx.quoteNumberSequence.create({
        data: {
          tenantId,
          format: "AN-{YEAR}-{NUMBER}",
          currentYear,
          nextNumber: 1,
          digitCount: 4,
        },
      });
    }

    if (sequence.currentYear !== currentYear) {
      sequence = await tx.quoteNumberSequence.update({
        where: { id: sequence.id },
        data: { currentYear, nextNumber: 1 },
      });
    }

    const quoteNumber = generateQuoteNumber(
      sequence.format,
      sequence.nextNumber,
      sequence.digitCount,
      sequence.currentYear
    );

    await tx.quoteNumberSequence.update({
      where: { id: sequence.id },
      data: { nextNumber: sequence.nextNumber + 1 },
    });

    return { number: quoteNumber, sequenceId: sequence.id };
  });

  return result;
}
