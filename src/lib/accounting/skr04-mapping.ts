/**
 * SKR04 → BalanceSheetSection Range-Mapping (P15).
 *
 * Wird sowohl vom Backfill-Script verwendet (um bestehende LedgerAccount-
 * Records mit balanceSheetSection zu initialisieren) als auch vom Bilanz-
 * Generator als Fallback wenn ein Konto noch kein explizites Mapping hat.
 *
 * Die Range-Logik orientiert sich am Standardkontenrahmen SKR04 für
 * Personengesellschaften (Stand 2024):
 *
 *   0000-0999  Anlagevermögen → ASSET_FIXED
 *   1000-1399  Umlaufvermögen (Vorräte, Forderungen, Bank, Kasse) → ASSET_CURRENT
 *   1400-1499  Rechnungsabgrenzung Aktiv → ASSET_DEFERRED
 *   1500-1799  Vorsteuer / USt-Forderungen → ASSET_CURRENT (gehört in Umlaufvermögen)
 *   1800-1999  Kasse / Bank → ASSET_CURRENT
 *   2000-2999  Eigenkapital → EQUITY
 *   3000-3099  Rückstellungen → PROVISION
 *   3100-3399  Verbindlichkeiten (lang) → LIABILITY_LONG
 *   3400-3899  Verbindlichkeiten (kurz, Lieferanten, USt-Schuld) → LIABILITY_SHORT
 *   3900-3999  Rechnungsabgrenzung Passiv → LIABILITY_DEFERRED
 *   4000-7999  Aufwand → kein Bilanz-Section (gehört in GuV)
 *   8000-8999  Erlöse → kein Bilanz-Section (gehört in GuV)
 *   9000-9999  Vortrags-/Kostenstellen-Konten → kein Bilanz-Section
 *
 * Für SKR03 gibt es eine andere Range (kein Auto-Mapping derzeit) — Tenants
 * mit SKR03 müssen die Sections manuell setzen oder einen eigenen Mapper
 * registrieren.
 */

import { BalanceSheetSection } from "@prisma/client";

/**
 * Mappt eine SKR04-Kontonummer auf die zugehörige Bilanz-Section.
 * Liefert null wenn das Konto NICHT bilanziell ist (Erlös/Aufwand-Konten,
 * statistische Konten).
 *
 * @param accountNumber DATEV-Kontonummer als String (4-stellig, ggf. mit
 *   führender Null).
 */
export function mapSkr04ToBalanceSheetSection(
  accountNumber: string,
): BalanceSheetSection | null {
  const num = parseInt(accountNumber, 10);
  if (isNaN(num)) return null;

  // Anlagevermögen
  if (num >= 0 && num <= 999) return BalanceSheetSection.ASSET_FIXED;

  // Umlaufvermögen (inkl. Vorsteuer)
  if (num >= 1000 && num <= 1399) return BalanceSheetSection.ASSET_CURRENT;

  // Aktive Rechnungsabgrenzung
  if (num >= 1400 && num <= 1499) return BalanceSheetSection.ASSET_DEFERRED;

  // USt-Verrechnung / Bank / Kasse → Umlaufvermögen
  if (num >= 1500 && num <= 1999) return BalanceSheetSection.ASSET_CURRENT;

  // Eigenkapital
  if (num >= 2000 && num <= 2999) return BalanceSheetSection.EQUITY;

  // Rückstellungen
  if (num >= 3000 && num <= 3099) return BalanceSheetSection.PROVISION;

  // Langfristige Verbindlichkeiten
  if (num >= 3100 && num <= 3399) return BalanceSheetSection.LIABILITY_LONG;

  // Kurzfristige Verbindlichkeiten (Lieferanten, USt-Schuld)
  if (num >= 3400 && num <= 3899) return BalanceSheetSection.LIABILITY_SHORT;

  // Passive Rechnungsabgrenzung
  if (num >= 3900 && num <= 3999) return BalanceSheetSection.LIABILITY_DEFERRED;

  // 4000+ = GuV-Konten (Aufwand, Erlös, Statistik) → kein Bilanz-Section
  return null;
}

/**
 * Liefert true wenn die Section eine Aktiv-Position ist (links in der Bilanz).
 */
export function isAssetSection(section: BalanceSheetSection): boolean {
  return (
    section === BalanceSheetSection.ASSET_FIXED ||
    section === BalanceSheetSection.ASSET_CURRENT ||
    section === BalanceSheetSection.ASSET_DEFERRED
  );
}

/**
 * Liefert true wenn die Section eine Passiv-Position ist (rechts in der Bilanz).
 */
export function isLiabilitySection(section: BalanceSheetSection): boolean {
  return !isAssetSection(section);
}

/** Human-readable Labels für Bilanz-UI. */
export const BALANCE_SHEET_SECTION_LABELS: Record<BalanceSheetSection, string> = {
  ASSET_FIXED: "A. Anlagevermögen",
  ASSET_CURRENT: "B. Umlaufvermögen",
  ASSET_DEFERRED: "C. Aktive Rechnungsabgrenzung",
  EQUITY: "A. Eigenkapital",
  PROVISION: "B. Rückstellungen",
  LIABILITY_LONG: "C. Verbindlichkeiten (> 1 Jahr)",
  LIABILITY_SHORT: "C. Verbindlichkeiten (< 1 Jahr)",
  LIABILITY_DEFERRED: "D. Passive Rechnungsabgrenzung",
};

/** Sortier-Reihenfolge für die Bilanz-Anzeige. */
export const SECTION_SORT_ORDER: Record<BalanceSheetSection, number> = {
  ASSET_FIXED: 10,
  ASSET_CURRENT: 20,
  ASSET_DEFERRED: 30,
  EQUITY: 40,
  PROVISION: 50,
  LIABILITY_LONG: 60,
  LIABILITY_SHORT: 70,
  LIABILITY_DEFERRED: 80,
};
