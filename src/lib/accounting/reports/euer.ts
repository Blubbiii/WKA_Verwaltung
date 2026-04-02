/**
 * EÜR (Einnahmenüberschussrechnung) — Cash-basis income statement
 *
 * Unlike BWA (accrual basis), EÜR uses the payment date (entryDate of journal entries)
 * and classifies income/expenses according to BMF Anlage EÜR categories.
 * Required for Personengesellschaften (GbR, KG) under §4 Abs. 3 EStG.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client-runtime-utils";
import { getTenantSettings } from "@/lib/tenant-settings";

export interface EuerLine {
  /** BMF Kennzahl (row number in Anlage EÜR) */
  kennzahl: number;
  label: string;
  currentPeriod: number;
  previousPeriod: number;
  /** Whether this is a summary/subtotal line */
  isSummary?: boolean;
}

export interface EuerResult {
  lines: EuerLine[];
  periodStart: string;
  periodEnd: string;
  profit: number;
  previousProfit: number;
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return typeof d === "number" ? d : Number(d);
}

interface EuerAggregation {
  /** Betriebseinnahmen (SKR03: 8xxx) */
  revenue: number;
  /** davon umsatzsteuerfrei (SKR03: 8100-8199) */
  revenueTaxFree: number;
  /** Sonstige betriebliche Erträge (SKR03: 2xxx Ertragskonten) */
  otherIncome: number;
  /** Wareneinkauf / Material (SKR03: 3xxx) */
  materialCost: number;
  /** Personalkosten (SKR03: 4xxx - 42xx) */
  personnelCost: number;
  /** Raumkosten (SKR03: 4200-4299) */
  roomCost: number;
  /** Versicherungen (SKR03: 4360-4399) */
  insurance: number;
  /** KFZ-Kosten (SKR03: 4500-4599) */
  vehicleCost: number;
  /** Reisekosten (SKR03: 4660-4699) */
  travelCost: number;
  /** Abschreibungen (SKR03: 4800-4899) */
  depreciation: number;
  /** Sonstige betriebliche Aufwendungen (rest of 4xxx, 6xxx) */
  otherExpense: number;
  /** Zinsen und Finanzierungskosten (SKR03: 7xxx) */
  interest: number;
  /** Steuern vom Einkommen und Ertrag (SKR03: 7600-7699) */
  incomeTax: number;
}

async function aggregateByPeriod(
  tenantId: string,
  start: Date,
  end: Date
): Promise<EuerAggregation> {
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

  const result: EuerAggregation = {
    revenue: 0,
    revenueTaxFree: 0,
    otherIncome: 0,
    materialCost: 0,
    personnelCost: 0,
    roomCost: 0,
    insurance: 0,
    vehicleCost: 0,
    travelCost: 0,
    depreciation: 0,
    otherExpense: 0,
    interest: 0,
    incomeTax: 0,
  };

  for (const line of lines) {
    const acc = line.account;
    const credit = toNum(line.creditAmount);
    const debit = toNum(line.debitAmount);
    const net = credit - debit; // positive = income, negative = expense
    const expense = debit - credit; // positive = cost

    if (acc.startsWith("8")) {
      // Revenue accounts
      result.revenue += net;
      if (acc >= "8100" && acc < "8200") {
        result.revenueTaxFree += net;
      }
    } else if (acc.startsWith("2")) {
      // Sonstige Erträge
      result.otherIncome += net;
    } else if (acc.startsWith("3")) {
      // Material / Wareneinkauf
      result.materialCost += expense;
    } else if (acc >= "4200" && acc < "4300") {
      result.roomCost += expense;
    } else if (acc >= "4360" && acc < "4400") {
      result.insurance += expense;
    } else if (acc >= "4500" && acc < "4600") {
      result.vehicleCost += expense;
    } else if (acc >= "4660" && acc < "4700") {
      result.travelCost += expense;
    } else if (acc >= "4800" && acc < "4900") {
      result.depreciation += expense;
    } else if (acc >= "4000" && acc < "4200") {
      result.personnelCost += expense;
    } else if (acc.startsWith("4") || acc.startsWith("6")) {
      result.otherExpense += expense;
    } else if (acc >= "7600" && acc < "7700") {
      result.incomeTax += expense;
    } else if (acc.startsWith("7")) {
      result.interest += expense;
    }
  }

  return result;
}

export async function generateEuer(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<EuerResult> {
  const settings = await getTenantSettings(tenantId);
  const _fyMonth = (settings.fiscalYearStartMonth || 1) - 1;

  // Previous year same period
  const prevStart = new Date(periodStart);
  prevStart.setFullYear(prevStart.getFullYear() - 1);
  const prevEnd = new Date(periodEnd);
  prevEnd.setFullYear(prevEnd.getFullYear() - 1);

  const [current, previous] = await Promise.all([
    aggregateByPeriod(tenantId, periodStart, periodEnd),
    aggregateByPeriod(tenantId, prevStart, prevEnd),
  ]);

  const totalExpenses = (a: EuerAggregation) =>
    a.materialCost + a.personnelCost + a.roomCost + a.insurance +
    a.vehicleCost + a.travelCost + a.depreciation + a.otherExpense +
    a.interest + a.incomeTax;

  const totalIncome = (a: EuerAggregation) =>
    a.revenue + a.otherIncome;

  const profit = totalIncome(current) - totalExpenses(current);
  const previousProfit = totalIncome(previous) - totalExpenses(previous);

  const lines: EuerLine[] = [
    // Einnahmen
    { kennzahl: 111, label: "Betriebseinnahmen als umsatzsteuerlicher Kleinunternehmer", currentPeriod: current.revenueTaxFree, previousPeriod: previous.revenueTaxFree },
    { kennzahl: 112, label: "Umsatzsteuerpflichtige Betriebseinnahmen", currentPeriod: current.revenue - current.revenueTaxFree, previousPeriod: previous.revenue - previous.revenueTaxFree },
    { kennzahl: 118, label: "Sonstige Erträge", currentPeriod: current.otherIncome, previousPeriod: previous.otherIncome },
    { kennzahl: 119, label: "Summe Betriebseinnahmen", currentPeriod: totalIncome(current), previousPeriod: totalIncome(previous), isSummary: true },

    // Ausgaben
    { kennzahl: 120, label: "Wareneinkauf / Materialaufwand", currentPeriod: current.materialCost, previousPeriod: previous.materialCost },
    { kennzahl: 130, label: "Personalkosten", currentPeriod: current.personnelCost, previousPeriod: previous.personnelCost },
    { kennzahl: 140, label: "Raumkosten", currentPeriod: current.roomCost, previousPeriod: previous.roomCost },
    { kennzahl: 145, label: "Versicherungen", currentPeriod: current.insurance, previousPeriod: previous.insurance },
    { kennzahl: 150, label: "Fahrzeugkosten", currentPeriod: current.vehicleCost, previousPeriod: previous.vehicleCost },
    { kennzahl: 160, label: "Reisekosten", currentPeriod: current.travelCost, previousPeriod: previous.travelCost },
    { kennzahl: 170, label: "Abschreibungen", currentPeriod: current.depreciation, previousPeriod: previous.depreciation },
    { kennzahl: 180, label: "Sonstige betriebliche Aufwendungen", currentPeriod: current.otherExpense, previousPeriod: previous.otherExpense },
    { kennzahl: 185, label: "Zinsen und Finanzierungskosten", currentPeriod: current.interest, previousPeriod: previous.interest },
    { kennzahl: 189, label: "Summe Betriebsausgaben", currentPeriod: totalExpenses(current), previousPeriod: totalExpenses(previous), isSummary: true },

    // Ergebnis
    { kennzahl: 190, label: "Gewinn / Verlust", currentPeriod: profit, previousPeriod: previousProfit, isSummary: true },
  ];

  return {
    lines,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    profit,
    previousProfit,
  };
}
