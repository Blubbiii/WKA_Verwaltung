/**
 * Zusammenfassende Meldung (ZM) — EC Sales List
 *
 * Aggregates outgoing invoices to EU customers by country and VAT ID
 * for the quarterly BZSt report.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

export interface ZmLine {
  countryCode: string;
  vatId: string;
  recipientName: string;
  /** L = Lieferung (goods), S = sonstige Leistung (services) */
  type: "L" | "S";
  /** Net amount in EUR, rounded to full euros */
  amount: number;
}

export interface ZmResult {
  lines: ZmLine[];
  periodStart: string;
  periodEnd: string;
  quarter: number;
  year: number;
  totalAmount: number;
}

// EU member state codes (excluding DE)
const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DK", "EE", "ES", "FI", "FR",
  "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL",
  "PL", "PT", "RO", "SE", "SI", "SK",
]);

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return typeof d === "number" ? d : Number(d);
}

export async function generateZm(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<ZmResult> {
  // Load outgoing invoices with EU recipients for the period
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      invoiceType: "INVOICE",
      status: { in: ["SENT", "PAID"] },
      deletedAt: null,
      invoiceDate: { gte: periodStart, lte: periodEnd },
      recipientCountry: { not: null },
      recipientVatId: { not: null },
    },
    select: {
      recipientCountry: true,
      recipientVatId: true,
      recipientName: true,
      netAmount: true,
    },
  });

  // Aggregate by country + vatId
  const aggregation = new Map<string, { name: string; amount: number }>();

  for (const inv of invoices) {
    const country = inv.recipientCountry?.toUpperCase();
    if (!country || !EU_COUNTRIES.has(country)) continue;

    const vatId = inv.recipientVatId?.replace(/\s/g, "");
    if (!vatId) continue;

    const key = `${country}::${vatId}`;
    const existing = aggregation.get(key);
    const amount = toNum(inv.netAmount);

    if (existing) {
      existing.amount += amount;
    } else {
      aggregation.set(key, {
        name: inv.recipientName || vatId,
        amount,
      });
    }
  }

  // Build result lines
  const lines: ZmLine[] = [];
  let totalAmount = 0;

  for (const [key, data] of aggregation.entries()) {
    const [countryCode, vatId] = key.split("::");
    const roundedAmount = Math.round(data.amount);
    if (roundedAmount === 0) continue;

    totalAmount += roundedAmount;
    lines.push({
      countryCode,
      vatId,
      recipientName: data.name,
      type: "S", // Default to services (sonstige Leistungen) for windpark business
      amount: roundedAmount,
    });
  }

  // Sort by country then vatId
  lines.sort((a, b) => a.countryCode.localeCompare(b.countryCode) || a.vatId.localeCompare(b.vatId));

  // Determine quarter
  const quarter = Math.ceil((periodStart.getMonth() + 1) / 3);
  const year = periodStart.getFullYear();

  return {
    lines,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    quarter,
    year,
    totalAmount,
  };
}
