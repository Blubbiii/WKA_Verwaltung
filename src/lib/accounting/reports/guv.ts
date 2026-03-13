/**
 * GuV (Gewinn- und Verlustrechnung) — HGB §275 Gesamtkostenverfahren
 *
 * Accrual-basis P&L statement required for Kapitalgesellschaften (GmbH, UG).
 * Uses the same data source as BWA but with HGB-compliant structure.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { getTenantSettings } from "@/lib/tenant-settings";

export interface GuvLine {
  /** HGB §275 position number */
  position: number;
  label: string;
  currentPeriod: number;
  previousPeriod: number;
  /** Whether this is a summary/subtotal line */
  isSummary?: boolean;
  /** Indentation level (0 = top, 1 = sub-item) */
  indent?: number;
}

export interface GuvResult {
  lines: GuvLine[];
  periodStart: string;
  periodEnd: string;
  netIncome: number;
  previousNetIncome: number;
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return typeof d === "number" ? d : Number(d);
}

interface GuvAggregation {
  /** 1. Umsatzerlöse (SKR03: 8000-8099) */
  salesRevenue: number;
  /** 2. Bestandsveränderungen (SKR03: 8900-8999) */
  inventoryChanges: number;
  /** 3. Andere aktivierte Eigenleistungen (SKR03: 8950-8999) */
  ownWork: number;
  /** 4. Sonstige betriebliche Erträge (SKR03: 8100-8899, 2xxx) */
  otherOperatingIncome: number;
  /** 5a. Materialaufwand (SKR03: 3xxx) */
  materialExpense: number;
  /** 6a. Löhne und Gehälter (SKR03: 4000-4099) */
  wages: number;
  /** 6b. Sozialabgaben (SKR03: 4100-4199) */
  socialContributions: number;
  /** 7. Abschreibungen (SKR03: 48xx) */
  depreciation: number;
  /** 8. Sonstige betriebliche Aufwendungen (SKR03: 42xx-47xx, 49xx, 6xxx) */
  otherOperatingExpense: number;
  /** 9. Erträge aus Beteiligungen (SKR03: 7000-7099) */
  investmentIncome: number;
  /** 10. Sonstige Zinsen und ähnliche Erträge (SKR03: 7100-7199) */
  interestIncome: number;
  /** 11. Abschreibungen auf Finanzanlagen (SKR03: 7200-7299) */
  financeDepreciation: number;
  /** 12. Zinsen und ähnliche Aufwendungen (SKR03: 7300-7599) */
  interestExpense: number;
  /** 13. Steuern vom Einkommen und Ertrag (SKR03: 7600-7699) */
  incomeTax: number;
  /** 14. Sonstige Steuern (SKR03: 7700-7799) */
  otherTax: number;
}

async function aggregateByPeriod(
  tenantId: string,
  start: Date,
  end: Date
): Promise<GuvAggregation> {
  const lines = await prisma.journalEntryLine.findMany({
    where: {
      journalEntry: {
        tenantId,
        status: "POSTED",
        deletedAt: null,
        entryDate: { gte: start, lte: end },
      },
    },
    select: {
      account: true,
      debitAmount: true,
      creditAmount: true,
    },
  });

  const result: GuvAggregation = {
    salesRevenue: 0,
    inventoryChanges: 0,
    ownWork: 0,
    otherOperatingIncome: 0,
    materialExpense: 0,
    wages: 0,
    socialContributions: 0,
    depreciation: 0,
    otherOperatingExpense: 0,
    investmentIncome: 0,
    interestIncome: 0,
    financeDepreciation: 0,
    interestExpense: 0,
    incomeTax: 0,
    otherTax: 0,
  };

  for (const line of lines) {
    const acc = line.account;
    const credit = toNum(line.creditAmount);
    const debit = toNum(line.debitAmount);
    const income = credit - debit; // positive = revenue/income
    const expense = debit - credit; // positive = cost

    // Revenue accounts (8xxx)
    if (acc >= "8000" && acc < "8100") {
      result.salesRevenue += income;
    } else if (acc >= "8900" && acc < "8950") {
      result.inventoryChanges += income;
    } else if (acc >= "8950" && acc < "9000") {
      result.ownWork += income;
    } else if (acc >= "8100" && acc < "8900") {
      result.otherOperatingIncome += income;
    } else if (acc.startsWith("2")) {
      result.otherOperatingIncome += income;
    }
    // Material (3xxx)
    else if (acc.startsWith("3")) {
      result.materialExpense += expense;
    }
    // Personnel costs (40xx, 41xx)
    else if (acc >= "4000" && acc < "4100") {
      result.wages += expense;
    } else if (acc >= "4100" && acc < "4200") {
      result.socialContributions += expense;
    }
    // Depreciation (48xx)
    else if (acc >= "4800" && acc < "4900") {
      result.depreciation += expense;
    }
    // Other operating expenses (42xx-47xx, 49xx, 6xxx)
    else if (acc >= "4200" && acc < "4800") {
      result.otherOperatingExpense += expense;
    } else if (acc >= "4900" && acc < "5000") {
      result.otherOperatingExpense += expense;
    } else if (acc.startsWith("6")) {
      result.otherOperatingExpense += expense;
    }
    // Financial results (7xxx)
    else if (acc >= "7000" && acc < "7100") {
      result.investmentIncome += income;
    } else if (acc >= "7100" && acc < "7200") {
      result.interestIncome += income;
    } else if (acc >= "7200" && acc < "7300") {
      result.financeDepreciation += expense;
    } else if (acc >= "7300" && acc < "7600") {
      result.interestExpense += expense;
    } else if (acc >= "7600" && acc < "7700") {
      result.incomeTax += expense;
    } else if (acc >= "7700" && acc < "7800") {
      result.otherTax += expense;
    }
  }

  return result;
}

export async function generateGuv(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<GuvResult> {
  const settings = await getTenantSettings(tenantId);

  // Previous year same period
  const prevStart = new Date(periodStart);
  prevStart.setFullYear(prevStart.getFullYear() - 1);
  const prevEnd = new Date(periodEnd);
  prevEnd.setFullYear(prevEnd.getFullYear() - 1);

  const [c, p] = await Promise.all([
    aggregateByPeriod(tenantId, periodStart, periodEnd),
    aggregateByPeriod(tenantId, prevStart, prevEnd),
  ]);

  // Calculated subtotals
  const gesamtleistung = (a: GuvAggregation) =>
    a.salesRevenue + a.inventoryChanges + a.ownWork + a.otherOperatingIncome;

  const personnelCost = (a: GuvAggregation) =>
    a.wages + a.socialContributions;

  const operatingResult = (a: GuvAggregation) =>
    gesamtleistung(a) - a.materialExpense - personnelCost(a) - a.depreciation - a.otherOperatingExpense;

  const financeResult = (a: GuvAggregation) =>
    a.investmentIncome + a.interestIncome - a.financeDepreciation - a.interestExpense;

  const resultBeforeTax = (a: GuvAggregation) =>
    operatingResult(a) + financeResult(a);

  const netIncomeFn = (a: GuvAggregation) =>
    resultBeforeTax(a) - a.incomeTax - a.otherTax;

  const netIncome = netIncomeFn(c);
  const previousNetIncome = netIncomeFn(p);

  const lines: GuvLine[] = [
    // Gesamtleistung
    { position: 1, label: "Umsatzerlöse", currentPeriod: c.salesRevenue, previousPeriod: p.salesRevenue },
    { position: 2, label: "Bestandsveränderungen", currentPeriod: c.inventoryChanges, previousPeriod: p.inventoryChanges },
    { position: 3, label: "Andere aktivierte Eigenleistungen", currentPeriod: c.ownWork, previousPeriod: p.ownWork },
    { position: 4, label: "Sonstige betriebliche Erträge", currentPeriod: c.otherOperatingIncome, previousPeriod: p.otherOperatingIncome },
    { position: 0, label: "Gesamtleistung", currentPeriod: gesamtleistung(c), previousPeriod: gesamtleistung(p), isSummary: true },

    // Aufwendungen
    { position: 5, label: "Materialaufwand", currentPeriod: c.materialExpense, previousPeriod: p.materialExpense },
    { position: 6, label: "Löhne und Gehälter", currentPeriod: c.wages, previousPeriod: p.wages, indent: 1 },
    { position: 7, label: "Soziale Abgaben und Aufwendungen", currentPeriod: c.socialContributions, previousPeriod: p.socialContributions, indent: 1 },
    { position: 0, label: "Personalaufwand", currentPeriod: personnelCost(c), previousPeriod: personnelCost(p), isSummary: true },
    { position: 8, label: "Abschreibungen", currentPeriod: c.depreciation, previousPeriod: p.depreciation },
    { position: 9, label: "Sonstige betriebliche Aufwendungen", currentPeriod: c.otherOperatingExpense, previousPeriod: p.otherOperatingExpense },
    { position: 0, label: "Betriebsergebnis", currentPeriod: operatingResult(c), previousPeriod: operatingResult(p), isSummary: true },

    // Finanzergebnis
    { position: 10, label: "Erträge aus Beteiligungen", currentPeriod: c.investmentIncome, previousPeriod: p.investmentIncome },
    { position: 11, label: "Sonstige Zinsen und ähnliche Erträge", currentPeriod: c.interestIncome, previousPeriod: p.interestIncome },
    { position: 12, label: "Abschreibungen auf Finanzanlagen", currentPeriod: c.financeDepreciation, previousPeriod: p.financeDepreciation },
    { position: 13, label: "Zinsen und ähnliche Aufwendungen", currentPeriod: c.interestExpense, previousPeriod: p.interestExpense },
    { position: 0, label: "Finanzergebnis", currentPeriod: financeResult(c), previousPeriod: financeResult(p), isSummary: true },

    // Ergebnis
    { position: 0, label: "Ergebnis vor Steuern", currentPeriod: resultBeforeTax(c), previousPeriod: resultBeforeTax(p), isSummary: true },
    { position: 14, label: "Steuern vom Einkommen und Ertrag", currentPeriod: c.incomeTax, previousPeriod: p.incomeTax },
    { position: 15, label: "Sonstige Steuern", currentPeriod: c.otherTax, previousPeriod: p.otherTax },
    { position: 0, label: "Jahresüberschuss / Jahresfehlbetrag", currentPeriod: netIncome, previousPeriod: previousNetIncome, isSummary: true },
  ];

  return {
    lines,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    netIncome,
    previousNetIncome,
  };
}
