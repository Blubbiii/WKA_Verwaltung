/**
 * C-1 Sprint 5: Kapitalflussrechnung nach DRS 21 (indirekte Methode).
 *
 * HGB §264 Abs. 1 Satz 2 verpflichtet mittlere/große Kapitalgesellschaften
 * zur Kapitalflussrechnung als Bestandteil des Jahresabschlusses. Auch für
 * KGs und GmbHs ist sie für Banken und Gesellschafter Standard.
 *
 * Indirekte Methode (DRS 21.39):
 *   1. Cash-Flow aus laufender Geschäftstätigkeit (CFO):
 *      Jahresergebnis +/- nicht zahlungswirksame Posten (AfA, Rückstellungen)
 *      +/- Veränderungen Working Capital (Forderungen, Vorräte, Verbindlichkeiten)
 *   2. Cash-Flow aus Investitionstätigkeit (CFI):
 *      - Auszahlungen für Anlagevermögen (AHK-Zugänge)
 *      + Einzahlungen aus Anlagenabgängen (Buchwert + Veräußerungsgewinn)
 *   3. Cash-Flow aus Finanzierungstätigkeit (CFF):
 *      + Kapital-Einzahlungen Gesellschafter
 *      - Ausschüttungen / Kapital-Rückzahlungen
 *      +/- Darlehensaufnahmen/-Tilgungen
 *
 *   Finanzmittel am Periodenende = Anfangsbestand + CFO + CFI + CFF
 *
 * Implementierung:
 *  - Berechnet aus Bilanz-Diff (vorher/nachher) + GuV
 *  - AfA aus depreciation-Tabelle
 *  - Investitionen aus fixedAsset.acquisitionDate
 *  - Ausschüttungen aus distribution-Tabelle
 *  - Working-Capital aus Bilanz-Section-Diffs
 */

import { prisma } from "@/lib/prisma";
import { computeBilanz } from "./bilanz";
import { generateGuv } from "./guv";
import { Decimal } from "@prisma/client-runtime-utils";
import { getCachedReport } from "@/lib/cache/reports";

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return typeof d === "number" ? d : Number(d);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface CashflowLine {
  position: string;
  label: string;
  amount: number;
  isSummary?: boolean;
  indent?: number;
}

export interface CashflowResult {
  fiscalYear: number;
  asOf: string;
  /** Cash-Flow aus laufender Geschäftstätigkeit. */
  cfo: number;
  /** Cash-Flow aus Investitionstätigkeit. */
  cfi: number;
  /** Cash-Flow aus Finanzierungstätigkeit. */
  cff: number;
  /** Netto-Cash-Veränderung (CFO + CFI + CFF). */
  netChange: number;
  /** Finanzmittelbestand am Periodenanfang. */
  cashStart: number;
  /** Finanzmittelbestand am Periodenende (= cashStart + netChange). */
  cashEnd: number;
  /** Plausibilitäts-Differenz (Bilanz-cashEnd vs. berechneter cashEnd, ideal 0).
   *  null wenn Vorjahresdaten fehlen — Validierung dann nicht aussagekräftig. */
  validationDifference: number | null;
  /** Sortierte Posten für UI/PDF. */
  lines: CashflowLine[];
  warnings: string[];
}

/**
 * Liefert den Saldo der Cash-Konten (Kasse + Bank) zum Stichtag aus der Bilanz.
 */
function getCashFromBilanz(
  aktiva: Array<{ section: string; total: number; accounts: Array<{ accountNumber: string; amount: number }> }>,
): number {
  let cash = 0;
  for (const group of aktiva) {
    if (group.section !== "ASSET_CURRENT") continue;
    for (const acc of group.accounts) {
      const num = parseInt(acc.accountNumber, 10);
      // SKR03: 1000-1099 Kasse, 1100-1199 Bank
      // SKR04: 1600-1899 Kasse/Bank
      if (
        (num >= 1000 && num <= 1199) ||
        (num >= 1600 && num <= 1899)
      ) {
        cash += acc.amount;
      }
    }
  }
  return cash;
}

/**
 * Liefert den Saldo der Forderungen aus L+L (Kontenrange SKR03 12xx / SKR04 12xx).
 */
function getReceivablesFromBilanz(
  aktiva: Array<{ section: string; accounts: Array<{ accountNumber: string; amount: number }> }>,
): number {
  let sum = 0;
  for (const group of aktiva) {
    if (group.section !== "ASSET_CURRENT") continue;
    for (const acc of group.accounts) {
      const num = parseInt(acc.accountNumber, 10);
      if (num >= 1200 && num <= 1299) sum += acc.amount;
    }
  }
  return sum;
}

/**
 * Liefert den Saldo der Verbindlichkeiten aus L+L.
 */
function getPayablesFromBilanz(
  passiva: Array<{ section: string; accounts: Array<{ accountNumber: string; amount: number }> }>,
): number {
  let sum = 0;
  for (const group of passiva) {
    if (group.section !== "LIABILITY_SHORT" && group.section !== "LIABILITY_LONG") continue;
    for (const acc of group.accounts) {
      const num = parseInt(acc.accountNumber, 10);
      // SKR03: 1600-1699 Verbindlichkeiten L+L
      // SKR04: 3500-3699 Verbindlichkeiten L+L
      if ((num >= 1600 && num <= 1699) || (num >= 3500 && num <= 3699)) {
        sum += acc.amount;
      }
    }
  }
  return sum;
}

/**
 * Hauptfunktion: Generiert die Kapitalflussrechnung für ein Wirtschaftsjahr.
 */
export async function generateCashflow(
  tenantId: string,
  fiscalYear: number,
): Promise<CashflowResult> {
  // Redis-Cache. POSTED-Journale unveränderlich → safe to cache.
  const cacheKey = `${fiscalYear}`;
  return getCachedReport("cashflow", tenantId, cacheKey, () =>
    generateCashflowUncached(tenantId, fiscalYear),
  );
}

async function generateCashflowUncached(
  tenantId: string,
  fiscalYear: number,
): Promise<CashflowResult> {
  const yearStart = new Date(Date.UTC(fiscalYear, 0, 1));
  const yearEnd = new Date(Date.UTC(fiscalYear, 11, 31, 23, 59, 59));
  const prevYearStart = new Date(Date.UTC(fiscalYear - 1, 0, 1));
  const prevYearEnd = new Date(Date.UTC(fiscalYear - 1, 11, 31, 23, 59, 59));

  const warnings: string[] = [];

  // Prüfe ob Vorjahresdaten existieren. Wenn nicht: Cashflow nur informativ.
  const [prevYearOpenings, prevYearPosted] = await Promise.all([
    prisma.openingBalance.count({
      where: { tenantId, fiscalYear: fiscalYear - 1 },
    }),
    prisma.journalEntry.count({
      where: {
        tenantId,
        status: "POSTED",
        entryDate: { gte: prevYearStart, lte: prevYearEnd },
      },
    }),
  ]);
  const prevYearHasData = prevYearOpenings > 0 || prevYearPosted > 0;

  const [
    bilanzCurrent,
    bilanzPrev,
    guv,
    afaSum,
    investments,
    disposalAssets,
    disposalAfaSum,
    distributions,
  ] = await Promise.all([
    computeBilanz(tenantId, fiscalYear, yearEnd),
    // Vorjahres-Bilanz nur wenn Daten vorhanden, sonst Stub-Werte (0).
    prevYearHasData
      ? computeBilanz(tenantId, fiscalYear - 1, prevYearEnd)
      : Promise.resolve(null),
    generateGuv(tenantId, yearStart, yearEnd),
    // AfA des Jahres aus FixedAssetDepreciation-Tabelle
    prisma.fixedAssetDepreciation.aggregate({
      where: {
        asset: { tenantId },
        periodEnd: { gte: yearStart, lte: yearEnd },
      },
      _sum: { amount: true },
    }),
    // Investitionen = AHK aller im Jahr angeschafften Assets
    prisma.fixedAsset.aggregate({
      where: {
        tenantId,
        acquisitionDate: { gte: yearStart, lte: yearEnd },
      },
      _sum: { acquisitionCost: true },
    }),
    // Abgänge = Buchwert (AHK − cumAfa), nicht reine AHK.
    // Lade alle im Jahr abgegangenen Assets mit ihrer AHK.
    prisma.fixedAsset.findMany({
      where: {
        tenantId,
        disposalDate: { gte: yearStart, lte: yearEnd },
      },
      select: { id: true, acquisitionCost: true },
    }),
    // Kumulierte AfA bis disposalDate pro abgegangenem Asset.
    prisma.fixedAssetDepreciation.groupBy({
      by: ["assetId"],
      where: {
        asset: {
          tenantId,
          disposalDate: { gte: yearStart, lte: yearEnd },
        },
        periodEnd: { lte: yearEnd },
      },
      _sum: { amount: true },
    }),
    // Ausschüttungen (nur EXECUTED zählen als Cash-Out)
    prisma.distribution.aggregate({
      where: {
        tenantId,
        distributionDate: { gte: yearStart, lte: yearEnd },
        status: "EXECUTED",
      },
      _sum: { totalAmount: true },
    }),
  ]);

  // Warnung wenn Vorjahresdaten fehlen.
  if (!prevYearHasData) {
    warnings.push(
      "Vorjahresdaten unvollständig — Cashflow nur informativ. Eröffnungsbilanz und Vorjahres-Buchungen prüfen.",
    );
  }

  const jahresergebnis = guv.netIncome;
  const afaAmount = toNum(afaSum._sum.amount);
  const investAmount = toNum(investments._sum.acquisitionCost);

  // disposalAmount = Σ Buchwerte (AHK − cumAfa), nicht reine AHK.
  const disposalAfaByAsset = new Map<string, number>();
  for (const row of disposalAfaSum) {
    disposalAfaByAsset.set(row.assetId, toNum(row._sum.amount));
  }
  let disposalAmount = 0;
  for (const asset of disposalAssets) {
    const ahk = toNum(asset.acquisitionCost);
    const cumAfa = disposalAfaByAsset.get(asset.id) ?? 0;
    const bookValue = Math.max(0, ahk - cumAfa);
    disposalAmount += bookValue;
  }
  if (disposalAssets.length > 0) {
    warnings.push(
      "disposalAmount = Buchwert (AHK − kumulierte AfA), ohne Veräußerungsgewinn/-verlust.",
    );
  }

  const distributionAmount = toNum(distributions._sum.totalAmount);

  // Wenn keine Vorjahresdaten, alle Start-Werte = 0 (Bilanz-Diff nicht aussagekräftig).
  const cashStart = bilanzPrev ? getCashFromBilanz(bilanzPrev.aktiva) : 0;
  const cashEndBilanz = getCashFromBilanz(bilanzCurrent.aktiva);

  // Working Capital — Veränderungen
  const receivablesStart = bilanzPrev ? getReceivablesFromBilanz(bilanzPrev.aktiva) : 0;
  const receivablesEnd = getReceivablesFromBilanz(bilanzCurrent.aktiva);
  const receivablesDelta = receivablesEnd - receivablesStart;
  // Forderungs-ZUNAHME = Cash-DECREASE → negativ in CFO

  const payablesStart = bilanzPrev ? getPayablesFromBilanz(bilanzPrev.passiva) : 0;
  const payablesEnd = getPayablesFromBilanz(bilanzCurrent.passiva);
  const payablesDelta = payablesEnd - payablesStart;
  // Verbindlichkeits-ZUNAHME = Cash-INCREASE → positiv in CFO

  // Rückstellungen
  function getProvisions(passiva: typeof bilanzCurrent.passiva): number {
    return passiva.find((g: { section: string; total: number }) => g.section === "PROVISION")?.total ?? 0;
  }
  const provisionsStart = bilanzPrev ? getProvisions(bilanzPrev.passiva) : 0;
  const provisionsDelta = getProvisions(bilanzCurrent.passiva) - provisionsStart;

  // CFO (indirekte Methode)
  const cfo = round2(
    jahresergebnis +
      afaAmount +
      provisionsDelta -
      receivablesDelta +
      payablesDelta,
  );

  // CFI: Investitionen sind Auszahlungen (negativ), Abgänge Einzahlungen (positiv)
  // disposalAmount = Buchwert (AHK − cumAfa), ohne Veräußerungsgewinn/-verlust.
  const cfi = round2(-investAmount + disposalAmount);

  // CFF: Ausschüttungen sind Auszahlungen (negativ)
  // Eigenkapital-/Darlehens-Veränderungen für vollständige Genauigkeit nötig — vereinfachend nur Distributions
  const cff = round2(-distributionAmount);

  const netChange = round2(cfo + cfi + cff);
  const cashEndComputed = round2(cashStart + netChange);
  // Ohne Vorjahresdaten ist validationDifference nicht aussagekräftig → null.
  const validationDifference = prevYearHasData
    ? round2(cashEndBilanz - cashEndComputed)
    : null;

  if (validationDifference !== null && Math.abs(validationDifference) > 1) {
    warnings.push(
      `Kapitalfluss-Validierung: berechneter Endbestand ${cashEndComputed.toFixed(2)} € weicht von Bilanz-Endbestand ${cashEndBilanz.toFixed(2)} € um ${validationDifference.toFixed(2)} € ab. Mögliche Ursachen: nicht erfasste Eigenkapital-Bewegungen, Darlehen, oder Kontorange-Mapping.`,
    );
  }

  const lines: CashflowLine[] = [
    // CFO
    { position: "1.", label: "Jahresergebnis", amount: jahresergebnis },
    { position: "2.", label: "+ Abschreibungen auf Sachanlagen", amount: afaAmount, indent: 1 },
    { position: "3.", label: "+/- Veränderung Rückstellungen", amount: provisionsDelta, indent: 1 },
    { position: "4.", label: "- Zunahme Forderungen aus L+L", amount: -receivablesDelta, indent: 1 },
    { position: "5.", label: "+ Zunahme Verbindlichkeiten aus L+L", amount: payablesDelta, indent: 1 },
    { position: "6.", label: "Cash-Flow aus laufender Geschäftstätigkeit (CFO)", amount: cfo, isSummary: true },
    // CFI
    { position: "7.", label: "- Auszahlungen für Investitionen in Sachanlagen", amount: -investAmount, indent: 1 },
    { position: "8.", label: "+ Einzahlungen aus Anlagenabgängen", amount: disposalAmount, indent: 1 },
    { position: "9.", label: "Cash-Flow aus Investitionstätigkeit (CFI)", amount: cfi, isSummary: true },
    // CFF
    { position: "10.", label: "- Auszahlungen an Gesellschafter (Ausschüttungen)", amount: -distributionAmount, indent: 1 },
    { position: "11.", label: "Cash-Flow aus Finanzierungstätigkeit (CFF)", amount: cff, isSummary: true },
    // Reconciliation
    { position: "12.", label: "Netto-Veränderung Finanzmittelbestand", amount: netChange, isSummary: true },
    { position: "13.", label: "Finanzmittelbestand am Periodenanfang", amount: cashStart },
    { position: "14.", label: "Finanzmittelbestand am Periodenende", amount: cashEndComputed, isSummary: true },
  ];

  return {
    fiscalYear,
    asOf: yearEnd.toISOString(),
    cfo,
    cfi,
    cff,
    netChange,
    cashStart,
    cashEnd: cashEndComputed,
    validationDifference,
    lines,
    warnings,
  };
}
