/**
 * Chart-of-Accounts Resolver (Audit-C).
 *
 * Wählt das passende Range-Mapping abhängig vom TenantSettings.chartOfAccountsVersion.
 * Wird vom Bilanz-Generator + Backfill-Skript verwendet, damit SKR03- und
 * SKR04-Tenants die korrekten Bilanz-Sections bekommen.
 *
 * Außerdem: PNL-Erkennung muss kontenrahmen-spezifisch sein, weil die
 * Range für GuV-Konten unterschiedlich ist.
 *   SKR04: 4000-7999 = Aufwand, 8000-8999 = Erlöse
 *   SKR03: 4000-7999 = Aufwand, 8000-8999 = Erlöse (zufällig identisch),
 *          aber AUCH 2600-2999 (a.o. Erträge) und 3000-3499 (Wareneingang)
 *          sind GuV-Konten — KEIN Bilanz-Section.
 */

import { BalanceSheetSection } from "@prisma/client";
import { mapSkr04ToBalanceSheetSection } from "./skr04-mapping";
import { mapSkr03ToBalanceSheetSection } from "./skr03-mapping";

export type ChartOfAccountsVersion = "SKR03" | "SKR04";

/**
 * Liefert die zum Kontenrahmen passende Range-Mapping-Funktion.
 */
export function getAccountMapper(
  version: ChartOfAccountsVersion,
): (accountNumber: string) => BalanceSheetSection | null {
  switch (version) {
    case "SKR03":
      return mapSkr03ToBalanceSheetSection;
    case "SKR04":
    default:
      return mapSkr04ToBalanceSheetSection;
  }
}

/**
 * Erkennt GuV-Konten (Aufwand/Erlöse) anhand der Kontonummer.
 * Wird vom Bilanz-Generator für die Jahresergebnis-Berechnung verwendet.
 */
export function isPnlAccount(
  accountNumber: string,
  version: ChartOfAccountsVersion,
): boolean {
  const num = parseInt(accountNumber, 10);
  if (isNaN(num)) return false;

  switch (version) {
    case "SKR03":
      // GuV: 2600-3499 (Außerord. Erträge + Wareneingang/Bezugsleistungen)
      //      4000-7999 (Aufwand) + 8000-8999 (Erlöse)
      return (
        (num >= 2600 && num <= 3499) ||
        (num >= 4000 && num <= 8999)
      );
    case "SKR04":
    default:
      // GuV: 4000-7999 (Aufwand) + 8000-8999 (Erlöse)
      return num >= 4000 && num <= 8999;
  }
}

/**
 * Erkennt Erlös-Konten (für Jahresergebnis-Berechnung — Erlöse erhöhen EK).
 */
export function isRevenueAccount(
  accountNumber: string,
  _version: ChartOfAccountsVersion,
): boolean {
  const num = parseInt(accountNumber, 10);
  if (isNaN(num)) return false;
  // 8xxx = Erlöse in beiden Kontenrahmen.
  return num >= 8000 && num <= 8999;
}

/**
 * Erkennt Aufwand-Konten.
 */
export function isExpenseAccount(
  accountNumber: string,
  version: ChartOfAccountsVersion,
): boolean {
  const num = parseInt(accountNumber, 10);
  if (isNaN(num)) return false;

  if (version === "SKR03") {
    // Wareneingang + Bezugsleistungen 3000-3499 (zählen als Aufwand)
    if (num >= 3000 && num <= 3499) return true;
  }
  // Standardaufwand 4000-7999 in beiden Rahmen
  return num >= 4000 && num <= 7999;
}
