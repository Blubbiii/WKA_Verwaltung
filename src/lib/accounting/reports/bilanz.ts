/**
 * Bilanz-Generator nach HGB §266 (Phase 15).
 *
 * Aggregiert die Salden aller Bilanz-Konten zu einem Stichtag:
 *   Aktiva: Anlagevermögen + Umlaufvermögen + Aktive Rechnungsabgrenzung
 *   Passiva: Eigenkapital + Rückstellungen + Verbindlichkeiten
 *           + Passive Rechnungsabgrenzung
 *
 * Aggregations-Quellen (in dieser Reihenfolge addiert):
 *   1. OpeningBalance des Wirtschaftsjahres
 *      (Saldenvortrag aus dem Vorjahr)
 *   2. Alle POSTED JournalEntryLines mit entryDate ≤ asOf
 *
 * Konto-Klassifikation:
 *   - Primär: LedgerAccount.balanceSheetSection (manuell gesetzt)
 *   - Fallback: SKR04-Range-Heuristik via mapSkr04ToBalanceSheetSection
 *
 * GuV-Konten (4000+) tragen NICHT direkt zur Bilanz bei, sondern fließen
 * via Jahresergebnis ins Eigenkapital. Wir berechnen das Ergebnis separat
 * und addieren es zur EQUITY-Section.
 *
 * **Identitäts-Garantie:** summeAktiva muss = summePassiva sein. Bei
 * Differenz > 0.01 € liegt eine Inkonsistenz vor — UI muss sie als
 * Warning anzeigen. Das passiert in der Regel wenn:
 *   - Konto nicht klassifiziert (kein Section, kein Range-Match)
 *   - OpeningBalance fehlt für Konten mit Vortrag
 *   - Buchungen vor asOf existieren ohne entsprechende Bilanz-Section
 */

import { prisma } from "@/lib/prisma";
import { BalanceSheetSection } from "@prisma/client";
import { Decimal } from "@prisma/client-runtime-utils";
import { getTenantSettings } from "@/lib/tenant-settings";
import {
  BALANCE_SHEET_SECTION_LABELS,
  SECTION_SORT_ORDER,
  isAssetSection,
} from "../skr04-mapping";
import {
  getAccountMapper,
  isExpenseAccount,
  isPnlAccount,
  isRevenueAccount,
  type ChartOfAccountsVersion,
} from "../chart-of-accounts";

export interface BilanzAccountLine {
  accountNumber: string;
  accountName: string;
  /** Saldo (positiv = Aktiv-Saldo, negativ = Passiv-Saldo, abs() Anzeige). */
  amount: number;
}

export interface BilanzSectionGroup {
  section: BalanceSheetSection;
  label: string;
  accounts: BilanzAccountLine[];
  total: number;
}

export interface BilanzResult {
  asOf: string;
  fiscalYear: number;
  aktiva: BilanzSectionGroup[];
  passiva: BilanzSectionGroup[];
  /** Jahresergebnis bis asOf (positiv = Gewinn → erhöht Eigenkapital). */
  jahresergebnis: number;
  summeAktiva: number;
  summePassiva: number;
  /** summeAktiva - summePassiva. Bei korrekter Bilanz: 0 (± 0.01). */
  differenz: number;
  warnings: string[];
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return typeof d === "number" ? d : Number(d);
}

interface AccountSaldo {
  number: string;
  name: string;
  section: BalanceSheetSection | null;
  /** Soll-Summe inkl. Vortrag */
  debit: number;
  /** Haben-Summe inkl. Vortrag */
  credit: number;
  /** True wenn 4000+ (GuV-Konto) — für Jahresergebnis-Berechnung */
  isPnl: boolean;
}

/**
 * Hauptfunktion: Berechnet die Bilanz für tenantId zum Stichtag asOf.
 *
 * @param tenantId Mandant
 * @param fiscalYear Wirtschaftsjahr (für OpeningBalance-Lookup)
 * @param asOf Stichtag (inkl., bis 23:59:59 dieses Tages)
 */
export async function computeBilanz(
  tenantId: string,
  fiscalYear: number,
  asOf: Date,
): Promise<BilanzResult> {
  const [accounts, openings, lines, settings] = await Promise.all([
    prisma.ledgerAccount.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        accountNumber: true,
        name: true,
        balanceSheetSection: true,
      },
    }),
    prisma.openingBalance.findMany({
      where: { tenantId, fiscalYear },
      select: { ledgerAccountId: true, debitAmount: true, creditAmount: true },
    }),
    prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          tenantId,
          status: "POSTED",
          deletedAt: null,
          entryDate: { lte: asOf },
        },
      },
      select: {
        account: true,
        debitAmount: true,
        creditAmount: true,
      },
    }),
    getTenantSettings(tenantId),
  ]);

  // Audit-C: Kontenrahmen-spezifische Mapper aus TenantSettings auflösen.
  const chartVersion = settings.chartOfAccountsVersion as ChartOfAccountsVersion;
  const accountMapper = getAccountMapper(chartVersion);

  // Saldo-Map pro Konto aufbauen.
  const saldi = new Map<string, AccountSaldo>();
  const warnings: string[] = [];

  const accountByNumber = new Map(accounts.map((a) => [a.accountNumber, a]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  // Schritt 1: Opening-Balances als Startwert
  for (const ob of openings) {
    const acc = accountById.get(ob.ledgerAccountId);
    if (!acc) continue;
    const key = acc.accountNumber;
    const section =
      acc.balanceSheetSection ?? accountMapper(acc.accountNumber);
    const isPnl = section === null && isPnlAccount(acc.accountNumber, chartVersion);

    saldi.set(key, {
      number: acc.accountNumber,
      name: acc.name,
      section,
      debit: toNum(ob.debitAmount),
      credit: toNum(ob.creditAmount),
      isPnl,
    });
  }

  // Schritt 2: JournalEntryLines aufaddieren.
  for (const line of lines) {
    const key = line.account;
    let entry = saldi.get(key);
    if (!entry) {
      const acc = accountByNumber.get(key);
      const section =
        acc?.balanceSheetSection ?? accountMapper(key);
      const isPnl = section === null && isPnlAccount(key, chartVersion);
      entry = {
        number: key,
        name: acc?.name ?? key,
        section,
        debit: 0,
        credit: 0,
        isPnl,
      };
      saldi.set(key, entry);
    }
    entry.debit += toNum(line.debitAmount);
    entry.credit += toNum(line.creditAmount);
  }

  // Schritt 3: Jahresergebnis berechnen (Erlöse - Aufwand).
  // Audit-C: Kontenrahmen-spezifische PNL-Erkennung.
  let revenueTotal = 0;
  let expenseTotal = 0;
  for (const entry of saldi.values()) {
    if (!entry.isPnl) continue;
    if (isRevenueAccount(entry.number, chartVersion)) {
      revenueTotal += entry.credit - entry.debit;
    } else if (isExpenseAccount(entry.number, chartVersion)) {
      expenseTotal += entry.debit - entry.credit;
    }
  }
  // Auch Erlös-Konten ohne PNL-Flag (z.B. wenn manuell als REVENUE markiert).
  for (const entry of saldi.values()) {
    if (entry.isPnl) continue;
    if (isRevenueAccount(entry.number, chartVersion) && entry.section === null) {
      revenueTotal += entry.credit - entry.debit;
    }
  }
  const jahresergebnis = round2(revenueTotal - expenseTotal);

  // Schritt 4: Konten gruppieren nach Section.
  const sectionGroups = new Map<BalanceSheetSection, BilanzAccountLine[]>();

  for (const entry of saldi.values()) {
    if (entry.section === null) {
      if (!entry.isPnl) {
        // Bilanz-relevant aber unklassifiziert → Warnung
        const balance = round2(entry.debit - entry.credit);
        if (balance !== 0) {
          warnings.push(
            `Konto ${entry.number} (${entry.name}) hat einen Saldo von ${balance.toFixed(2)} € aber keine Bilanz-Section. Bitte balanceSheetSection setzen.`,
          );
        }
      }
      continue; // PNL-Konten gehen nicht in Bilanz (sind via Jahresergebnis drin)
    }

    const isAsset = isAssetSection(entry.section);
    const netBalance = isAsset
      ? entry.debit - entry.credit
      : entry.credit - entry.debit;

    const rounded = round2(netBalance);
    if (rounded === 0) continue; // Konten mit 0-Saldo überspringen

    const list = sectionGroups.get(entry.section) ?? [];
    list.push({
      accountNumber: entry.number,
      accountName: entry.name,
      amount: rounded,
    });
    sectionGroups.set(entry.section, list);
  }

  // Schritt 5: Section-Gruppen in Aktiva/Passiva sortieren.
  const aktiva: BilanzSectionGroup[] = [];
  const passiva: BilanzSectionGroup[] = [];

  for (const [section, accs] of sectionGroups.entries()) {
    accs.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
    const total = round2(accs.reduce((s, a) => s + a.amount, 0));
    const group: BilanzSectionGroup = {
      section,
      label: BALANCE_SHEET_SECTION_LABELS[section],
      accounts: accs,
      total,
    };
    if (isAssetSection(section)) {
      aktiva.push(group);
    } else {
      passiva.push(group);
    }
  }

  aktiva.sort((a, b) => SECTION_SORT_ORDER[a.section] - SECTION_SORT_ORDER[b.section]);
  passiva.sort((a, b) => SECTION_SORT_ORDER[a.section] - SECTION_SORT_ORDER[b.section]);

  const summeAktiva = round2(aktiva.reduce((s, g) => s + g.total, 0));
  let summePassiva = round2(passiva.reduce((s, g) => s + g.total, 0));

  // Schritt 6: Jahresergebnis ins Eigenkapital einrechnen.
  // Audit-B: synthetisches Konto kommt aus TenantSettings.
  if (jahresergebnis !== 0) {
    let equityGroup = passiva.find((g) => g.section === BalanceSheetSection.EQUITY);
    if (!equityGroup) {
      equityGroup = {
        section: BalanceSheetSection.EQUITY,
        label: BALANCE_SHEET_SECTION_LABELS.EQUITY,
        accounts: [],
        total: 0,
      };
      passiva.push(equityGroup);
      passiva.sort(
        (a, b) => SECTION_SORT_ORDER[a.section] - SECTION_SORT_ORDER[b.section],
      );
    }
    equityGroup.accounts.push({
      accountNumber: settings.datevAccountAnnualResult,
      accountName:
        jahresergebnis > 0 ? "Jahresüberschuss" : "Jahresfehlbetrag",
      amount: jahresergebnis,
    });
    equityGroup.total = round2(equityGroup.total + jahresergebnis);
    summePassiva = round2(summePassiva + jahresergebnis);
  }

  const differenz = round2(summeAktiva - summePassiva);

  // Audit-B: Toleranz aus TenantSettings (Default 0,01 €).
  const bilanzTolerance = settings.bilanzToleranceEur;
  if (Math.abs(differenz) > bilanzTolerance) {
    warnings.push(
      `Bilanz ist nicht ausgeglichen: Aktiva ${summeAktiva.toFixed(2)} € ≠ Passiva ${summePassiva.toFixed(2)} € (Differenz ${differenz.toFixed(2)} €, Toleranz ${bilanzTolerance.toFixed(2)} €). Bitte Konten-Klassifikation prüfen.`,
    );
  }

  return {
    asOf: asOf.toISOString(),
    fiscalYear,
    aktiva,
    passiva,
    jahresergebnis,
    summeAktiva,
    summePassiva,
    differenz,
    warnings,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
