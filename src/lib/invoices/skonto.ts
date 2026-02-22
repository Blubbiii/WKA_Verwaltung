/**
 * Skonto (early payment discount) calculation utilities.
 *
 * Uses integer-cent arithmetic to avoid floating-point rounding issues
 * with Decimal fields from the database.
 */

export type SkontoStatus = "ELIGIBLE" | "EXPIRED" | "APPLIED" | "NONE";

/**
 * Calculate the discounted amount after applying Skonto.
 * Returns the amount the customer saves (the discount itself).
 *
 * @param totalGross - Total gross amount in EUR
 * @param skontoPercent - Skonto percentage (e.g. 2 for 2%)
 * @returns The discount amount (what the customer saves)
 */
export function calculateSkontoDiscount(
  totalGross: number,
  skontoPercent: number
): number {
  if (skontoPercent <= 0 || skontoPercent > 100) return 0;
  if (totalGross <= 0) return 0;

  // Convert to cents, calculate, convert back to avoid floating point issues
  const grossCents = Math.round(totalGross * 100);
  const discountCents = Math.round(grossCents * skontoPercent / 100);
  return discountCents / 100;
}

/**
 * Calculate the amount to pay when Skonto is applied.
 *
 * @param totalGross - Total gross amount in EUR
 * @param skontoPercent - Skonto percentage (e.g. 2 for 2%)
 * @returns The discounted payment amount
 */
export function calculateSkontoPaymentAmount(
  totalGross: number,
  skontoPercent: number
): number {
  const discount = calculateSkontoDiscount(totalGross, skontoPercent);
  return Math.round((totalGross - discount) * 100) / 100;
}

/**
 * Calculate the Skonto deadline date.
 *
 * @param invoiceDate - The invoice date
 * @param skontoDays - Number of days for Skonto eligibility
 * @returns The deadline date (inclusive: payment must arrive by end of this day)
 */
export function calculateSkontoDeadline(
  invoiceDate: Date,
  skontoDays: number
): Date {
  if (skontoDays <= 0) {
    return new Date(invoiceDate);
  }

  const deadline = new Date(invoiceDate);
  deadline.setDate(deadline.getDate() + skontoDays);
  return deadline;
}

/**
 * Check whether the Skonto deadline is still in the future.
 *
 * @param skontoDeadline - The calculated Skonto deadline
 * @param referenceDate - Optional reference date (defaults to now)
 * @returns true if Skonto can still be claimed
 */
export function isSkontoValid(
  skontoDeadline: Date,
  referenceDate?: Date
): boolean {
  const now = referenceDate ?? new Date();
  // Compare end-of-day of the deadline with the reference date
  const deadlineEndOfDay = new Date(skontoDeadline);
  deadlineEndOfDay.setHours(23, 59, 59, 999);
  return now <= deadlineEndOfDay;
}

/**
 * Determine the current Skonto status of an invoice.
 *
 * @param invoice - Invoice data containing Skonto fields
 * @returns The Skonto status
 */
export function getSkontoStatus(invoice: {
  skontoPercent?: number | null;
  skontoDays?: number | null;
  skontoDeadline?: Date | string | null;
  skontoPaid?: boolean | null;
}): SkontoStatus {
  // No Skonto configured
  if (!invoice.skontoPercent || !invoice.skontoDays) {
    return "NONE";
  }

  // Skonto was already applied on payment
  if (invoice.skontoPaid) {
    return "APPLIED";
  }

  // Check if deadline has passed
  if (invoice.skontoDeadline) {
    const deadline =
      typeof invoice.skontoDeadline === "string"
        ? new Date(invoice.skontoDeadline)
        : invoice.skontoDeadline;

    if (isSkontoValid(deadline)) {
      return "ELIGIBLE";
    }

    return "EXPIRED";
  }

  // Has percent/days but no deadline calculated yet (edge case)
  return "NONE";
}

/**
 * Get the German label for a Skonto status.
 */
export function getSkontoStatusLabel(status: SkontoStatus): string {
  switch (status) {
    case "ELIGIBLE":
      return "Skonto moeglich";
    case "EXPIRED":
      return "Skonto abgelaufen";
    case "APPLIED":
      return "Skonto angewandt";
    case "NONE":
      return "";
  }
}

/**
 * Get CSS class names for the Skonto status badge.
 */
export function getSkontoStatusBadgeClass(status: SkontoStatus): string {
  switch (status) {
    case "ELIGIBLE":
      return "bg-green-100 text-green-800 border-green-200";
    case "EXPIRED":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "APPLIED":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "NONE":
      return "";
  }
}
