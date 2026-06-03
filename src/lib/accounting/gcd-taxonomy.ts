/**
 * GCD-Kerntaxonomie-Mapping für E-Bilanz §5b EStG (Erweiterung P26.7).
 *
 * Die deutsche GCD-Kerntaxonomie (Generalauszug) bildet HGB-Bilanz und
 * GuV in ~5000 XBRL-Elementen ab. Dieses Modul stellt eine kuratierte
 * Teilmenge der häufigsten Positionen bereit, die für die Mehrzahl
 * der deutschen Mittelständler-Bilanzen ausreichen.
 *
 * Mapping erfolgt zweistufig:
 *  1. Account-Range (SKR03/SKR04) → GCD-Element (sub-position)
 *  2. BalanceSheetSection (Aggregat) als Fallback
 *
 * Quelle: GCD-Taxonomie 2024 der elsterspezifischen Variante.
 * Vollversion: https://www.esteuer.de/elster-taxonomie/
 */

import type { BalanceSheetSection } from "@prisma/client";
import type { ChartOfAccountsVersion } from "./chart-of-accounts";

/**
 * Aggregat-Mapping (Fallback wenn kein Range-Match).
 * Wird verwendet wenn LedgerAccount keine `balanceSheetSection`
 * gesetzt hat oder die Range-Map keinen Treffer liefert.
 */
export const GCD_SECTION_ELEMENTS: Record<BalanceSheetSection, string> = {
  ASSET_FIXED: "de-gcd:bs.ass.fixedAssets",
  ASSET_CURRENT: "de-gcd:bs.ass.currentAssets",
  ASSET_DEFERRED: "de-gcd:bs.ass.prepaidExpenses",
  EQUITY: "de-gcd:bs.eqLiab.equity",
  PROVISION: "de-gcd:bs.eqLiab.provisions",
  LIABILITY_LONG: "de-gcd:bs.eqLiab.liabilities.longterm",
  LIABILITY_SHORT: "de-gcd:bs.eqLiab.liabilities.shortterm",
  LIABILITY_DEFERRED: "de-gcd:bs.eqLiab.deferredIncome",
};

/**
 * GCD-Sub-Positionen für die Bilanz (granularer als Sections).
 * Wird über den Kontonummern-Range gemappt.
 */
interface GcdRange {
  from: number;
  to: number;
  element: string;
}

const SKR03_BS_RANGES: GcdRange[] = [
  // Anlagevermögen
  { from: 10, to: 99, element: "de-gcd:bs.ass.fixedAssets.intangibleAssets" },
  { from: 100, to: 299, element: "de-gcd:bs.ass.fixedAssets.tangibleAssets.realEstate" },
  { from: 300, to: 699, element: "de-gcd:bs.ass.fixedAssets.tangibleAssets.equipment" },
  { from: 700, to: 899, element: "de-gcd:bs.ass.fixedAssets.financialAssets" },
  // Umlaufvermögen — Vorräte
  { from: 3000, to: 3699, element: "de-gcd:bs.ass.currentAssets.inventories" },
  { from: 3700, to: 3999, element: "de-gcd:bs.ass.currentAssets.inventories.workInProgress" },
  // Umlaufvermögen — Forderungen
  { from: 1200, to: 1299, element: "de-gcd:bs.ass.currentAssets.receivables.tradeReceivables" },
  { from: 1300, to: 1399, element: "de-gcd:bs.ass.currentAssets.receivables.otherReceivables" },
  // Umlaufvermögen — Wertpapiere / Kasse
  { from: 1100, to: 1199, element: "de-gcd:bs.ass.currentAssets.securities" },
  { from: 1000, to: 1099, element: "de-gcd:bs.ass.currentAssets.cash" },
  // Aktive RAP
  { from: 1900, to: 1999, element: "de-gcd:bs.ass.prepaidExpenses" },
  // Eigenkapital
  { from: 800, to: 899, element: "de-gcd:bs.eqLiab.equity.subscribedCapital" },
  { from: 900, to: 929, element: "de-gcd:bs.eqLiab.equity.capitalReserve" },
  { from: 930, to: 959, element: "de-gcd:bs.eqLiab.equity.retainedEarnings" },
  // Rückstellungen
  { from: 950, to: 998, element: "de-gcd:bs.eqLiab.provisions.other" },
  // Verbindlichkeiten
  { from: 1600, to: 1699, element: "de-gcd:bs.eqLiab.liabilities.tradePayables" },
  { from: 1700, to: 1799, element: "de-gcd:bs.eqLiab.liabilities.bankLoans" },
  { from: 1800, to: 1899, element: "de-gcd:bs.eqLiab.liabilities.otherLiabilities" },
];

const SKR04_BS_RANGES: GcdRange[] = [
  // Anlagevermögen (SKR04: 0xxx)
  { from: 100, to: 199, element: "de-gcd:bs.ass.fixedAssets.intangibleAssets" },
  { from: 200, to: 499, element: "de-gcd:bs.ass.fixedAssets.tangibleAssets.realEstate" },
  { from: 500, to: 699, element: "de-gcd:bs.ass.fixedAssets.tangibleAssets.equipment" },
  { from: 700, to: 899, element: "de-gcd:bs.ass.fixedAssets.financialAssets" },
  // Umlaufvermögen — Vorräte (SKR04: 1xxx)
  { from: 1000, to: 1299, element: "de-gcd:bs.ass.currentAssets.inventories" },
  // Forderungen (SKR04: 12xx)
  { from: 1200, to: 1289, element: "de-gcd:bs.ass.currentAssets.receivables.tradeReceivables" },
  { from: 1290, to: 1399, element: "de-gcd:bs.ass.currentAssets.receivables.otherReceivables" },
  // Wertpapiere (SKR04: 13xx)
  { from: 1300, to: 1399, element: "de-gcd:bs.ass.currentAssets.securities" },
  // Kasse / Bank (SKR04: 16xx-18xx)
  { from: 1600, to: 1899, element: "de-gcd:bs.ass.currentAssets.cash" },
  // Active RAP
  { from: 1900, to: 1999, element: "de-gcd:bs.ass.prepaidExpenses" },
  // Eigenkapital (SKR04: 2xxx)
  { from: 2000, to: 2099, element: "de-gcd:bs.eqLiab.equity.subscribedCapital" },
  { from: 2100, to: 2199, element: "de-gcd:bs.eqLiab.equity.capitalReserve" },
  { from: 2200, to: 2299, element: "de-gcd:bs.eqLiab.equity.retainedEarnings" },
  // Rückstellungen (SKR04: 3xxx)
  { from: 3000, to: 3099, element: "de-gcd:bs.eqLiab.provisions.taxes" },
  { from: 3100, to: 3199, element: "de-gcd:bs.eqLiab.provisions.pensions" },
  { from: 3200, to: 3499, element: "de-gcd:bs.eqLiab.provisions.other" },
  // Verbindlichkeiten (SKR04: 32xx-39xx)
  { from: 3500, to: 3699, element: "de-gcd:bs.eqLiab.liabilities.tradePayables" },
  { from: 3700, to: 3799, element: "de-gcd:bs.eqLiab.liabilities.bankLoans" },
  { from: 3800, to: 3999, element: "de-gcd:bs.eqLiab.liabilities.otherLiabilities" },
];

/**
 * GuV-Sub-Positionen (Erträge + Aufwendungen) für GCD-Kerntaxonomie.
 * SKR03: 4000-8999 / SKR04: 4000-7999
 */
const SKR03_PL_RANGES: GcdRange[] = [
  // Erträge
  { from: 8000, to: 8499, element: "de-gcd:is.netIncome.revenue.salesRevenue" },
  { from: 8500, to: 8599, element: "de-gcd:is.netIncome.revenue.otherOperatingIncome" },
  { from: 8800, to: 8899, element: "de-gcd:is.netIncome.financialResult.interestIncome" },
  // Materialaufwand
  { from: 3000, to: 3999, element: "de-gcd:is.netIncome.materialExpenses" },
  // Personalaufwand
  { from: 4100, to: 4199, element: "de-gcd:is.netIncome.personnelExpenses.wages" },
  { from: 4200, to: 4299, element: "de-gcd:is.netIncome.personnelExpenses.socialSecurity" },
  // AfA
  { from: 4830, to: 4839, element: "de-gcd:is.netIncome.depreciation" },
  // Sonstige betriebliche Aufwendungen
  { from: 4000, to: 4099, element: "de-gcd:is.netIncome.otherOperatingExpenses" },
  { from: 4400, to: 4799, element: "de-gcd:is.netIncome.otherOperatingExpenses" },
  // Steuern vom Einkommen
  { from: 7600, to: 7699, element: "de-gcd:is.netIncome.taxesIncome" },
];

const SKR04_PL_RANGES: GcdRange[] = [
  // Erträge (SKR04: 4xxx)
  { from: 4000, to: 4299, element: "de-gcd:is.netIncome.revenue.salesRevenue" },
  { from: 4300, to: 4399, element: "de-gcd:is.netIncome.revenue.otherOperatingIncome" },
  { from: 4700, to: 4799, element: "de-gcd:is.netIncome.financialResult.interestIncome" },
  // Materialaufwand (SKR04: 5xxx)
  { from: 5000, to: 5999, element: "de-gcd:is.netIncome.materialExpenses" },
  // Personalaufwand (SKR04: 6000-6199)
  { from: 6000, to: 6099, element: "de-gcd:is.netIncome.personnelExpenses.wages" },
  { from: 6100, to: 6199, element: "de-gcd:is.netIncome.personnelExpenses.socialSecurity" },
  // AfA (SKR04: 62xx)
  { from: 6200, to: 6299, element: "de-gcd:is.netIncome.depreciation" },
  // Sonstige Aufwendungen
  { from: 6300, to: 6999, element: "de-gcd:is.netIncome.otherOperatingExpenses" },
  // Steuern
  { from: 7600, to: 7699, element: "de-gcd:is.netIncome.taxesIncome" },
];

/**
 * Mappt ein Konto auf das passende GCD-Element.
 *
 * Reihenfolge:
 *  1. Range-Match für Bilanz-Sub-Position
 *  2. Range-Match für GuV-Sub-Position
 *  3. Fallback auf BalanceSheetSection (wenn gesetzt)
 *  4. null (Position fällt aus dem Export raus → Aggregat im Group-Element)
 */
export function mapAccountToGcdElement(
  accountNumber: string,
  section: BalanceSheetSection | null,
  chartVersion: ChartOfAccountsVersion,
): string | null {
  const num = parseInt(accountNumber, 10);
  if (isNaN(num)) {
    return section ? GCD_SECTION_ELEMENTS[section] : null;
  }

  const bsRanges = chartVersion === "SKR04" ? SKR04_BS_RANGES : SKR03_BS_RANGES;
  const plRanges = chartVersion === "SKR04" ? SKR04_PL_RANGES : SKR03_PL_RANGES;

  for (const r of bsRanges) {
    if (num >= r.from && num <= r.to) return r.element;
  }
  for (const r of plRanges) {
    if (num >= r.from && num <= r.to) return r.element;
  }

  return section ? GCD_SECTION_ELEMENTS[section] : null;
}

/**
 * Standard P&L-Aggregat-Elemente (für Summary-Positionen am Ende der GuV).
 */
export const GCD_PL_TOTALS = {
  totalRevenue: "de-gcd:is.netIncome.revenue.totalRevenue",
  totalOperatingResult: "de-gcd:is.netIncome.operatingResult",
  netIncome: "de-gcd:is.netIncome",
  netLoss: "de-gcd:is.netLoss",
} as const;

/**
 * Bilanzsummen-Elemente (Kontroll-Positionen).
 */
export const GCD_BS_TOTALS = {
  totalAssets: "de-gcd:bs.ass.totalAssets",
  totalEquityLiabilities: "de-gcd:bs.eqLiab.totalEquityLiabilities",
  totalEquity: "de-gcd:bs.eqLiab.equity",
  totalLiabilities: "de-gcd:bs.eqLiab.liabilities",
} as const;
