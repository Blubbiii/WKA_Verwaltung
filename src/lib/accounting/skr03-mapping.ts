/**
 * SKR03 → BalanceSheetSection Range-Mapping (Audit-C).
 *
 * SKR03 ist der "klassische" Kontenrahmen für Einzelhandel und mittelständische
 * Betriebe, traditionell BWA-orientiert (im Gegensatz zum bilanzorientierten
 * SKR04). Ranges sind grundlegend anders verteilt:
 *
 *   0000-0699   Anlagevermögen → ASSET_FIXED
 *   0700-0999   Reserviert / Sonderkonten
 *   1000-1199   Kasse + Bank → ASSET_CURRENT
 *   1200-1399   Bank-Konten → ASSET_CURRENT
 *   1400-1499   Forderungen → ASSET_CURRENT
 *   1500-1576   Sonstige Forderungen, Vorsteuer → ASSET_CURRENT
 *   1576-1599   Vorsteuer 7%/19% → ASSET_CURRENT
 *   1600-1699   Aktive Rechnungsabgrenzung → ASSET_DEFERRED
 *   1700-1799   Verbindlichkeiten gegenüber Kreditinstituten → LIABILITY_LONG
 *   1800-1899   Privatkonten → EQUITY
 *   1900-1999   Sonstige aktive Konten → ASSET_CURRENT
 *   2000-2199   Eigenkapital → EQUITY
 *   2200-2299   Verbindlichkeiten gegenüber Gesellschaftern → EQUITY
 *   2300-2399   Rückstellungen → PROVISION
 *   2400-2499   Steuer-Rückstellungen → PROVISION
 *   2500-2599   Sonstige Rückstellungen → PROVISION
 *   2700-2999   Außerordentliche Erträge — KEIN Bilanz-Section (GuV)
 *   3000-3199   Wareneingang → KEIN Bilanz-Section (GuV)
 *   3300-3499   Bezogene Leistungen → KEIN Bilanz-Section (GuV)
 *   3500-3599   Sonstige Steuern, USt-Schuld → LIABILITY_SHORT
 *   3700-3799   Verbindlichkeiten aus Lieferungen → LIABILITY_SHORT
 *   3800-3899   Sonstige Verbindlichkeiten → LIABILITY_SHORT
 *   3900-3999   Passive Rechnungsabgrenzung → LIABILITY_DEFERRED
 *   4000-7999   Aufwand → KEIN Bilanz-Section (GuV)
 *   8000-8999   Erlöse → KEIN Bilanz-Section (GuV)
 *   9000+       Statistik/Vortrag → KEIN Bilanz-Section
 */

import { BalanceSheetSection } from "@prisma/client";

export function mapSkr03ToBalanceSheetSection(
  accountNumber: string,
): BalanceSheetSection | null {
  const num = parseInt(accountNumber, 10);
  if (isNaN(num)) return null;

  // Anlagevermögen
  if (num >= 0 && num <= 699) return BalanceSheetSection.ASSET_FIXED;

  // Kasse + Bank
  if (num >= 1000 && num <= 1399) return BalanceSheetSection.ASSET_CURRENT;

  // Forderungen + Vorsteuer
  if (num >= 1400 && num <= 1599) return BalanceSheetSection.ASSET_CURRENT;

  // Aktive Rechnungsabgrenzung
  if (num >= 1600 && num <= 1699) return BalanceSheetSection.ASSET_DEFERRED;

  // Verbindlichkeiten Kreditinstitute (langfristig)
  if (num >= 1700 && num <= 1799) return BalanceSheetSection.LIABILITY_LONG;

  // Privatkonten (Einzelunternehmer/Personengesellschaften)
  if (num >= 1800 && num <= 1899) return BalanceSheetSection.EQUITY;

  // Sonstige aktive Konten
  if (num >= 1900 && num <= 1999) return BalanceSheetSection.ASSET_CURRENT;

  // Eigenkapital + Gesellschafter-Konten
  if (num >= 2000 && num <= 2299) return BalanceSheetSection.EQUITY;

  // Rückstellungen
  if (num >= 2300 && num <= 2599) return BalanceSheetSection.PROVISION;

  // 2600-2999 GuV (Außerordentliche)
  // 3000-3499 GuV (Wareneingang etc.)

  // Sonstige Steuern + USt-Schuld
  if (num >= 3500 && num <= 3599) return BalanceSheetSection.LIABILITY_SHORT;

  // Verbindlichkeiten Lieferungen + Sonstige
  if (num >= 3700 && num <= 3899) return BalanceSheetSection.LIABILITY_SHORT;

  // Passive Rechnungsabgrenzung
  if (num >= 3900 && num <= 3999) return BalanceSheetSection.LIABILITY_DEFERRED;

  // 4000+ = GuV-Konten → kein Bilanz-Section
  return null;
}
