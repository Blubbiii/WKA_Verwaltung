/**
 * Gewerbesteuer-Hinzurechnung §8 Nr 1 GewStG (Phase 17).
 *
 * Rechtliche Grundlage:
 *   §8 Nr 1 GewStG — Hinzurechnungen zum Gewinn aus Gewerbebetrieb
 *     a) Schuldzinsen — Hinzurechnung 100% des Aufwands
 *     d) Mieten/Pachten BEWEGLICHE Anlagegüter — 1/5 (20%)
 *     e) Mieten/Pachten UNBEWEGLICHE Anlagegüter (Immobilien) — 1/2 (50%)
 *     f) Lizenzen, Rechte — 1/4 (25%)
 *
 *   Die SUMME aller Hinzurechnungs-Bemessungsgrundlagen abzüglich des
 *   FREIBETRAGS von 200.000 € (§8 Nr 1 GewStG letzter Satz) wird mit
 *   1/4 (25%) dem Gewinn als Hinzurechnung aufgeschlagen.
 *
 *   Formel:
 *     hinzurechnungsBetrag = max(0, summeBemessung - 200_000) × 0.25
 *
 * Praxis-Relevanz für WPM (Windpark-KG):
 *   - Hauptposten: Flächen-Pacht (§8 Nr 1e, 50%-Quote)
 *   - Bei 240.000 € Jahres-Pacht: Bemessung 120.000 € → unter Freibetrag → 0 Hinzurechnung
 *   - Bei 600.000 € Pacht: Bemessung 300.000 € → 100.000 € überm Freibetrag → 25.000 € Hinzurechnung
 *
 * Bedienung:
 *   LedgerAccount.gewStAddBackKey muss pro Konto markiert sein:
 *     "INTEREST"        — Schuldzinsen (Nr 1a)
 *     "RENT_MOVABLE"    — Miete bewegliche WG (Nr 1d)
 *     "RENT_IMMOVABLE"  — Pacht Immobilien/Flächen (Nr 1e)
 *     "LICENSE"         — Lizenzen (Nr 1f)
 *
 *   Konten OHNE gewStAddBackKey werden ignoriert.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client-runtime-utils";

/** Quoten nach §8 Nr 1 GewStG. */
export const GEWST_QUOTES = {
  INTEREST: 1.0, // Nr 1a — Schuldzinsen 100%
  RENT_MOVABLE: 0.2, // Nr 1d — 1/5
  RENT_IMMOVABLE: 0.5, // Nr 1e — 1/2
  LICENSE: 0.25, // Nr 1f — 1/4
} as const;

export type GewStAddBackKey = keyof typeof GEWST_QUOTES;

/** §8 Nr 1 GewStG Freibetrag. */
export const GEWST_FREIBETRAG_EUR = 200_000;

/** Hinzurechnungs-Quote auf die Summe nach Freibetrag (= 1/4). */
export const GEWST_HINZURECHNUNG_QUOTE = 0.25;

export interface GewStLine {
  key: GewStAddBackKey;
  label: string;
  /** Aufwand in EUR (Soll-Saldo der zugeordneten Konten). */
  aufwand: number;
  /** Quote nach §8 Nr 1 GewStG. */
  quote: number;
  /** Bemessungsgrundlage = aufwand × quote. */
  bemessung: number;
}

export interface GewStResult {
  fiscalYear: number;
  lines: GewStLine[];
  /** Summe der Bemessungsgrundlagen aller Zeilen. */
  summeBemessung: number;
  /** Freibetrag (konstant 200.000 €). */
  freibetrag: number;
  /** summeBemessung − freibetrag, mind. 0. */
  ueberFreibetrag: number;
  /** ueberFreibetrag × 25% (= dem Gewinn hinzuzurechnender Betrag). */
  hinzurechnungsBetrag: number;
  /** Pro key die Liste der beitragenden Konten. */
  contributingAccounts: Array<{
    key: GewStAddBackKey;
    accountNumber: string;
    accountName: string;
    aufwand: number;
  }>;
  warnings: string[];
}

const LABELS: Record<GewStAddBackKey, string> = {
  INTEREST: "§8 Nr 1a — Schuldzinsen",
  RENT_MOVABLE: "§8 Nr 1d — Mieten bewegliche WG",
  RENT_IMMOVABLE: "§8 Nr 1e — Pacht Immobilien/Flächen",
  LICENSE: "§8 Nr 1f — Lizenzen, Rechte",
};

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return typeof d === "number" ? d : Number(d);
}

/**
 * Berechnet die GewSt-Hinzurechnung für einen Mandanten + Wirtschaftsjahr.
 */
export async function computeGewSt(
  tenantId: string,
  fiscalYear: number,
): Promise<GewStResult> {
  const yearStart = new Date(Date.UTC(fiscalYear, 0, 1, 0, 0, 0));
  const yearEnd = new Date(Date.UTC(fiscalYear, 11, 31, 23, 59, 59));

  const [accounts, lines] = await Promise.all([
    prisma.ledgerAccount.findMany({
      where: {
        tenantId,
        gewStAddBackKey: { not: null },
        isActive: true,
      },
      select: {
        accountNumber: true,
        name: true,
        gewStAddBackKey: true,
      },
    }),
    prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          tenantId,
          status: "POSTED",
          deletedAt: null,
          entryDate: { gte: yearStart, lte: yearEnd },
        },
      },
      select: {
        account: true,
        debitAmount: true,
        creditAmount: true,
      },
    }),
  ]);

  // Map: account → key
  const keyByAccount = new Map<string, GewStAddBackKey>();
  for (const acc of accounts) {
    if (acc.gewStAddBackKey && acc.gewStAddBackKey in GEWST_QUOTES) {
      keyByAccount.set(acc.accountNumber, acc.gewStAddBackKey as GewStAddBackKey);
    }
  }
  const accountName = new Map(accounts.map((a) => [a.accountNumber, a.name]));

  // Aggregation pro Konto
  const aufwandPerAccount = new Map<string, number>();
  for (const line of lines) {
    if (!keyByAccount.has(line.account)) continue;
    const value = toNum(line.debitAmount) - toNum(line.creditAmount);
    aufwandPerAccount.set(
      line.account,
      (aufwandPerAccount.get(line.account) ?? 0) + value,
    );
  }

  // Aggregation pro Key
  const aufwandPerKey = new Map<GewStAddBackKey, number>();
  const contributingAccounts: GewStResult["contributingAccounts"] = [];

  for (const [accNum, aufwand] of aufwandPerAccount.entries()) {
    const key = keyByAccount.get(accNum);
    if (!key) continue;
    if (aufwand <= 0) continue; // negative Salden (z.B. Korrekturbuchungen) ignorieren

    const rounded = round2(aufwand);
    aufwandPerKey.set(key, (aufwandPerKey.get(key) ?? 0) + rounded);
    contributingAccounts.push({
      key,
      accountNumber: accNum,
      accountName: accountName.get(accNum) ?? accNum,
      aufwand: rounded,
    });
  }

  // Lines bauen
  const lineKeys: GewStAddBackKey[] = ["INTEREST", "RENT_MOVABLE", "RENT_IMMOVABLE", "LICENSE"];
  const reportLines: GewStLine[] = lineKeys.map((key) => {
    const aufwand = round2(aufwandPerKey.get(key) ?? 0);
    const quote = GEWST_QUOTES[key];
    return {
      key,
      label: LABELS[key],
      aufwand,
      quote,
      bemessung: round2(aufwand * quote),
    };
  });

  const summeBemessung = round2(reportLines.reduce((s, l) => s + l.bemessung, 0));
  const ueberFreibetrag = Math.max(0, round2(summeBemessung - GEWST_FREIBETRAG_EUR));
  const hinzurechnungsBetrag = round2(ueberFreibetrag * GEWST_HINZURECHNUNG_QUOTE);

  const warnings: string[] = [];
  if (accounts.length === 0) {
    warnings.push(
      "Keine Konten mit gewStAddBackKey markiert — Hinzurechnung kann nicht berechnet werden. Bitte Pacht-/Zins-/Lizenz-Konten kennzeichnen.",
    );
  }

  return {
    fiscalYear,
    lines: reportLines,
    summeBemessung,
    freibetrag: GEWST_FREIBETRAG_EUR,
    ueberFreibetrag,
    hinzurechnungsBetrag,
    contributingAccounts: contributingAccounts.sort(
      (a, b) => a.accountNumber.localeCompare(b.accountNumber),
    ),
    warnings,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
