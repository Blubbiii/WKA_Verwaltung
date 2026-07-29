/**
 * Budget Soll/Ist-Vergleich
 *
 * Compares BudgetLine planned values against actual JournalEntryLine amounts
 * per CostCenter and BudgetCategory for a given year/period.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client-runtime-utils";
import { buildCostCenterAncestorMap } from "./cost-center-hierarchy";

export interface BudgetComparisonRow {
  costCenterCode: string;
  costCenterName: string;
  category: string;
  description: string;
  /** Planned (budget) amount for the period */
  planned: number;
  /** Actual (journal) amount for the period */
  actual: number;
  /** Difference: actual - planned */
  difference: number;
  /** Deviation in percent */
  deviationPct: number | null;
}

export interface BudgetComparisonResult {
  budgetId: string;
  budgetName: string;
  year: number;
  rows: BudgetComparisonRow[];
  totalPlanned: number;
  totalActual: number;
  totalDifference: number;
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return typeof d === "number" ? d : Number(d);
}

const MONTH_FIELDS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;

// Map BudgetCategory to SKR03 account ranges for matching.
//
// F23: Die Grenzen sind NUMERISCH zu vergleichen, nicht als String. Der alte
// Code prüfte `line.account >= range.from && line.account < range.to` auf
// Strings — damit gilt "70001" >= "7000" UND "70001" < "7600", also fielen
// sämtliche Kreditoren-Personenkonten (70000–75999, siehe
// TenantSettings.datevCreditorStart) in COST_FINANCING. Ein Mandant mit
// Lieferantenkonten sah seine kompletten Verbindlichkeiten als
// Finanzierungskosten. Deshalb: Ranges als Zahlen.
const CATEGORY_ACCOUNT_RANGES: Record<string, { from: number; to: number; isRevenue: boolean }[]> = {
  REVENUE_ENERGY: [{ from: 8000, to: 8100, isRevenue: true }],
  REVENUE_OTHER: [{ from: 8100, to: 8999, isRevenue: true }, { from: 2000, to: 2999, isRevenue: true }],
  COST_LEASE: [{ from: 4200, to: 4300, isRevenue: false }],
  COST_MAINTENANCE: [{ from: 4700, to: 4800, isRevenue: false }],
  COST_INSURANCE: [{ from: 4360, to: 4400, isRevenue: false }],
  COST_ADMIN: [{ from: 4300, to: 4360, isRevenue: false }, { from: 4900, to: 5000, isRevenue: false }],
  COST_DEPRECIATION: [{ from: 4800, to: 4900, isRevenue: false }],
  COST_FINANCING: [{ from: 7000, to: 7600, isRevenue: false }],
  COST_OTHER: [{ from: 4400, to: 4500, isRevenue: false }, { from: 4600, to: 4700, isRevenue: false }, { from: 6000, to: 7000, isRevenue: false }],
};

/**
 * F23: Kontonummer numerisch parsen. Personenkonten sind 5-stellig und dürfen
 * nicht in die 4-stelligen Sachkonten-Bereiche fallen — deshalb wird alles
 * mit mehr Stellen als die Range-Grenzen von vornherein ausgeschlossen.
 */
function accountInRange(account: string, from: number, to: number): boolean {
  const trimmed = account.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  // Nur Konten gleicher Stellenzahl wie die Bereichsgrenzen betrachten.
  if (trimmed.length !== String(from).length) return false;
  const n = Number(trimmed);
  return n >= from && n < to;
}

export async function generateBudgetComparison(
  tenantId: string,
  budgetId: string,
  fromMonth?: number,
  toMonth?: number
): Promise<BudgetComparisonResult | null> {
  // Load budget with lines and cost centers
  const budget = await prisma.annualBudget.findFirst({
    where: { id: budgetId, tenantId },
    include: {
      lines: {
        include: {
          costCenter: { select: { code: true, name: true } },
        },
      },
    },
  });

  if (!budget) return null;

  const fm = (fromMonth ?? 1) - 1; // 0-based
  const tm = (toMonth ?? 12) - 1;

  // F22: Der Zeitraum wurde mit `new Date(year, m, d)` in LOKALZEIT gebildet,
  // gefiltert wird aber gegen JournalEntry.entryDate in UTC. In Europe/Berlin
  // ist `new Date(2026, 11, 31, 23, 59, 59)` = 2026-12-31T22:59:59Z — die
  // AfA-Automatik bucht Monatsenden aber auf 23:59:59Z. Ergebnis: die
  // Dezember-Buchungen fielen aus dem Soll/Ist-Vergleich heraus.
  // Konsequent in UTC bilden, wie überall sonst im Buchhaltungs-Modul.
  const periodStart = new Date(Date.UTC(budget.year, fm, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(budget.year, tm + 1, 0, 23, 59, 59, 999));

  // Load actual journal lines for the period
  const journalLines = await prisma.journalEntryLine.findMany({
    where: {
      journalEntry: {
        tenantId,
        status: "POSTED",
        deletedAt: null,
        entryDate: { gte: periodStart, lte: periodEnd },
      },
    },
    select: {
      account: true,
      debitAmount: true,
      creditAmount: true,
      costCenter: true,
    },
  });

  // F24: Kostenstellen-Hierarchie aufrollen.
  // Budgets werden häufig auf einer Elternkostenstelle geplant, gebucht wird
  // aber auf die Kinder. Der exakte String-Match ließ die Ist-Werte der Kinder
  // komplett unter den Tisch fallen → Abweichung −100 % auf jeder Elternzeile.
  // Jede Buchung wird deshalb ihrer Kostenstelle UND allen Vorfahren
  // zugerechnet.
  const ancestorMap = await buildCostCenterAncestorMap(tenantId);

  // Aggregate actuals by costCenter + category
  const actualMap = new Map<string, number>();

  for (const line of journalLines) {
    const cc = line.costCenter || "_unassigned";
    const debit = toNum(line.debitAmount);
    const credit = toNum(line.creditAmount);

    // Ziel-Kostenstellen: die eigene plus alle Eltern in der Kette.
    const targets = ancestorMap.get(cc) ?? [cc];

    // Determine which budget category this line belongs to
    for (const [category, ranges] of Object.entries(CATEGORY_ACCOUNT_RANGES)) {
      for (const range of ranges) {
        if (accountInRange(line.account, range.from, range.to)) {
          const amount = range.isRevenue ? (credit - debit) : (debit - credit);
          for (const target of targets) {
            const key = `${target}::${category}`;
            actualMap.set(key, (actualMap.get(key) || 0) + amount);
          }
        }
      }
    }
  }

  // Build comparison rows from budget lines
  const rows: BudgetComparisonRow[] = [];
  let totalPlanned = 0;
  let totalActual = 0;

  for (const line of budget.lines) {
    // Sum planned amounts for selected months
    let planned = 0;
    for (let m = fm; m <= tm; m++) {
      planned += toNum((line as Record<string, unknown>)[MONTH_FIELDS[m]] as Decimal);
    }

    const key = `${line.costCenter.code}::${line.category}`;
    const actual = actualMap.get(key) || 0;
    const difference = actual - planned;
    const deviationPct = planned !== 0 ? (difference / Math.abs(planned)) * 100 : null;

    totalPlanned += planned;
    totalActual += actual;

    rows.push({
      costCenterCode: line.costCenter.code,
      costCenterName: line.costCenter.name,
      category: line.category,
      description: line.description,
      planned,
      actual,
      difference,
      deviationPct,
    });
  }

  // Sort: by costCenter then category
  rows.sort((a, b) => a.costCenterCode.localeCompare(b.costCenterCode) || a.category.localeCompare(b.category));

  return {
    budgetId: budget.id,
    budgetName: budget.name,
    year: budget.year,
    rows,
    totalPlanned,
    totalActual,
    totalDifference: totalActual - totalPlanned,
  };
}
