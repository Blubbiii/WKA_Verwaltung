/**
 * Kostenstellen-Report
 *
 * Aggregates JournalEntryLines by costCenter string for a given period.
 * Groups by CostCenter entity (if matched) or by raw costCenter string.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client-runtime-utils";
import { getTenantSettings } from "@/lib/tenant-settings";
import { buildCostCenterAncestorMap } from "./cost-center-hierarchy";

/**
 * F25: Erlös-/Aufwand-Klassifikation je Kontenrahmen.
 *
 *   SKR03: Erlöse 8xxx          · Aufwand 3xxx–7xxx
 *   SKR04: Erlöse 4xxx          · Aufwand 5xxx–7xxx
 *
 * Personenkonten (Debitoren ab 10000, Kreditoren ab 70000) sind 5-stellig und
 * werden über die Stellenzahl ausgeschlossen — sonst zählte z.B. Kreditor
 * "70001" in SKR04 als Aufwand.
 */
function buildAccountClassifier(
  version: "SKR03" | "SKR04",
): (account: string) => { isRevenue: boolean; isExpense: boolean } {
  const revenueLead = version === "SKR03" ? ["8"] : ["4"];
  const expenseLead =
    version === "SKR03" ? ["3", "4", "5", "6", "7"] : ["5", "6", "7"];

  return (account: string) => {
    const a = account.trim();
    // Nur 4-stellige Sachkonten klassifizieren.
    if (!/^\d{4}$/.test(a)) return { isRevenue: false, isExpense: false };
    const lead = a[0];
    return {
      isRevenue: revenueLead.includes(lead),
      isExpense: expenseLead.includes(lead),
    };
  };
}

export interface CostCenterReportRow {
  costCenterCode: string;
  costCenterName: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
  /** Revenue accounts (SKR03 8xxx / SKR04 4xxx) — inkl. Kind-Kostenstellen */
  revenue: number;
  /** Expense accounts (SKR03 3xxx-7xxx / SKR04 5xxx-7xxx) — inkl. Kinder */
  expense: number;
  /** Net result (revenue - expense) */
  result: number;
}

export interface CostCenterReportResult {
  rows: CostCenterReportRow[];
  periodStart: string;
  periodEnd: string;
  totalRevenue: number;
  totalExpense: number;
  totalResult: number;
  /** Lines without costCenter assignment */
  unassigned: {
    debit: number;
    credit: number;
    revenue: number;
    expense: number;
    result: number;
  };
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return typeof d === "number" ? d : Number(d);
}

export async function generateCostCenterReport(
  tenantId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<CostCenterReportResult> {
  // Load journal lines for the period
  const lines = await prisma.journalEntryLine.findMany({
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

  // Load cost centers for name lookup
  const costCenters = await prisma.costCenter.findMany({
    where: { tenantId },
    select: { code: true, name: true, type: true },
  });
  const ccMap = new Map(costCenters.map((cc) => [cc.code, cc]));

  // F24: Eltern-Kostenstellen müssen die Ist-Werte ihrer Kinder sehen.
  const ancestorMap = await buildCostCenterAncestorMap(tenantId);

  // F25: `startsWith("8")` für Erlöse ist SKR03-Logik. In SKR04 liegen die
  // Umsatzerlöse bei 4xxx und die Aufwendungen bei 5xxx–7xxx — ein
  // SKR04-Mandant sah damit seine kompletten Erlöse als Aufwand und das
  // Betriebsergebnis mit falschem Vorzeichen. Klassifikation kommt jetzt aus
  // dem Kontenrahmen des Mandanten.
  const settings = await getTenantSettings(tenantId);
  const classify = buildAccountClassifier(settings.chartOfAccountsVersion);

  // Aggregate by costCenter
  const aggregation = new Map<string, {
    debit: number;
    credit: number;
    revenue: number;
    expense: number;
  }>();

  let unassignedDebit = 0;
  let unassignedCredit = 0;
  let unassignedRevenue = 0;
  let unassignedExpense = 0;

  for (const line of lines) {
    const debit = toNum(line.debitAmount);
    const credit = toNum(line.creditAmount);
    const { isRevenue, isExpense } = classify(line.account);

    if (!line.costCenter) {
      unassignedDebit += debit;
      unassignedCredit += credit;
      if (isRevenue) unassignedRevenue += credit - debit;
      if (isExpense) unassignedExpense += debit - credit;
      continue;
    }

    // F24: auf die eigene Kostenstelle UND alle Vorfahren buchen.
    const targets = ancestorMap.get(line.costCenter) ?? [line.costCenter];
    for (const cc of targets) {
      if (!aggregation.has(cc)) {
        aggregation.set(cc, { debit: 0, credit: 0, revenue: 0, expense: 0 });
      }

      const entry = aggregation.get(cc)!;
      entry.debit += debit;
      entry.credit += credit;
      if (isRevenue) entry.revenue += credit - debit;
      if (isExpense) entry.expense += debit - credit;
    }
  }

  // Build rows.
  //
  // F24: Die Summenzeile darf NICHT über die Zeilen laufen — durch die
  // Hierarchie-Aufrollung erscheint jede Buchung auf jeder Ebene ihrer Kette,
  // eine Zeilensumme wäre also um jede Elternebene zu hoch. Die Totals werden
  // deshalb direkt aus den Buchungszeilen gebildet (jede genau einmal).
  const rows: CostCenterReportRow[] = [];
  let totalRevenue = 0;
  let totalExpense = 0;

  for (const line of lines) {
    if (!line.costCenter) continue;
    const { isRevenue, isExpense } = classify(line.account);
    const debit = toNum(line.debitAmount);
    const credit = toNum(line.creditAmount);
    if (isRevenue) totalRevenue += credit - debit;
    if (isExpense) totalExpense += debit - credit;
  }

  for (const [code, data] of aggregation.entries()) {
    const ccInfo = ccMap.get(code);
    const result = data.revenue - data.expense;

    rows.push({
      costCenterCode: code,
      costCenterName: ccInfo?.name || code,
      type: ccInfo?.type || "CUSTOM",
      debit: data.debit,
      credit: data.credit,
      balance: data.debit - data.credit,
      revenue: data.revenue,
      expense: data.expense,
      result,
    });
  }

  rows.sort((a, b) => a.costCenterCode.localeCompare(b.costCenterCode));

  return {
    rows,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totalRevenue,
    totalExpense,
    totalResult: totalRevenue - totalExpense,
    unassigned: {
      debit: unassignedDebit,
      credit: unassignedCredit,
      revenue: unassignedRevenue,
      expense: unassignedExpense,
      result: unassignedRevenue - unassignedExpense,
    },
  };
}
