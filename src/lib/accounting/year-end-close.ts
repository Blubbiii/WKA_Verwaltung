/**
 * Year-End-Close / Saldenvortrag (Phase 15).
 *
 * Schließt ein Wirtschaftsjahr ab:
 *   1. Bilanz zum 31.12. wird gerechnet
 *   2. Bilanz-Snapshot wird persistiert
 *   3. Saldenvortrag wird in OpeningBalance des Folgejahres geschrieben
 *      (alle Bilanz-Konten mit Saldo != 0)
 *   4. Optional: Hard-Close der letzten 12 Monatsperioden (P9 Lock)
 *
 * GuV-Konten (4xxx-8xxx) bekommen KEINEN Saldenvortrag — ihre Salden
 * fließen über das Jahresergebnis ins Eigenkapital (Konto "9999" als
 * synthetische Position; in der Praxis nutzt der User ein echtes
 * Eigenkapital-Konto, das dann den Vortrag bekommt).
 *
 * Idempotenz: Wenn für (tenantId, fiscalYear+1) bereits OpeningBalance-
 * Records existieren, wirft die Funktion einen Fehler — der User muss
 * sie zuerst löschen oder einen anderen fiscalYear angeben.
 */

import { Decimal } from "@prisma/client-runtime-utils";
import type { TxClient } from "@/lib/invoices/numberGenerator";
import { computeBilanz } from "./reports/bilanz";
import { isAssetSection } from "./skr04-mapping";

export interface CarryForwardResult {
  fiscalYear: number;
  nextFiscalYear: number;
  carryForwardCount: number;
  snapshotId: string;
  /** summeAktiva = summePassiva muss True sein, sonst wird abgebrochen. */
  bilanzBalanced: boolean;
  warnings: string[];
}

export class BilanzNotBalancedError extends Error {
  constructor(
    public readonly summeAktiva: number,
    public readonly summePassiva: number,
    public readonly differenz: number,
  ) {
    super(
      `Bilanz nicht ausgeglichen — Saldenvortrag verweigert. Aktiva ${summeAktiva.toFixed(2)} € ≠ Passiva ${summePassiva.toFixed(2)} € (Diff ${differenz.toFixed(2)} €)`,
    );
    this.name = "BilanzNotBalancedError";
  }
}

export class OpeningBalanceAlreadyExistsError extends Error {
  constructor(public readonly fiscalYear: number) {
    super(
      `Für Wirtschaftsjahr ${fiscalYear} existieren bereits Eröffnungsbilanz-Einträge. Bitte zuerst löschen.`,
    );
    this.name = "OpeningBalanceAlreadyExistsError";
  }
}

/**
 * Schließt das Wirtschaftsjahr ab und schreibt den Saldenvortrag.
 *
 * @param tx Transaktions-Client (Caller wrappt prisma.$transaction)
 * @param params.tenantId
 * @param params.fiscalYear Abzuschließendes Jahr (z.B. 2025)
 * @param params.userId Wer den Close ausführt (Audit)
 * @param params.allowUnbalanced Falls true: Bilanz-Differenz wird als Warning
 *   geloggt aber Carry-Forward läuft trotzdem. Default: false.
 */
export async function carryForward(
  tx: TxClient,
  params: {
    tenantId: string;
    fiscalYear: number;
    userId: string;
    allowUnbalanced?: boolean;
  },
): Promise<CarryForwardResult> {
  const { tenantId, fiscalYear, userId, allowUnbalanced = false } = params;
  const nextFiscalYear = fiscalYear + 1;

  // Idempotenz-Check: Folgejahr darf noch keine Vorträge haben.
  const existingCount = await tx.openingBalance.count({
    where: { tenantId, fiscalYear: nextFiscalYear },
  });
  if (existingCount > 0) {
    throw new OpeningBalanceAlreadyExistsError(nextFiscalYear);
  }

  // Bilanz zum Jahresende rechnen.
  // Note: computeBilanz nutzt prisma direkt (kein tx) — das ist ok, weil
  // wir die Schreibtransaktion noch nicht angefangen haben (zumindest
  // keine Bilanz-relevanten Änderungen).
  const asOf = new Date(Date.UTC(fiscalYear, 11, 31, 23, 59, 59));
  const bilanz = await computeBilanz(tenantId, fiscalYear, asOf);

  const balanced = Math.abs(bilanz.differenz) <= 0.01;
  if (!balanced && !allowUnbalanced) {
    throw new BilanzNotBalancedError(
      bilanz.summeAktiva,
      bilanz.summePassiva,
      bilanz.differenz,
    );
  }

  // Bilanz-Snapshot speichern (Audit).
  const snapshot = await tx.balanceSheetSnapshot.create({
    data: {
      tenantId,
      fiscalYear,
      asOf,
      snapshot: bilanz as unknown as object,
      createdById: userId,
    },
    select: { id: true },
  });

  // Vorträge berechnen: jede Bilanz-Konto-Position mit Saldo != 0.
  // Bei Aktiv-Sections: Soll-Saldo → debitAmount; bei Passiv-Sections: Haben → credit.
  const accountMap = await tx.ledgerAccount.findMany({
    where: { tenantId },
    select: { id: true, accountNumber: true },
  });
  const accountByNumber = new Map(accountMap.map((a) => [a.accountNumber, a.id]));

  type CarryRow = {
    tenantId: string;
    fiscalYear: number;
    ledgerAccountId: string;
    debitAmount: Decimal;
    creditAmount: Decimal;
    createdById: string;
  };
  const carryRows: CarryRow[] = [];

  for (const group of [...bilanz.aktiva, ...bilanz.passiva]) {
    const isAsset = isAssetSection(group.section);
    for (const line of group.accounts) {
      // Synthetisches "Jahresüberschuss" / "Jahresfehlbetrag" auf 9999 wird
      // NICHT vorgetragen — der User muss das Ergebnis manuell auf ein
      // echtes Eigenkapital-Konto buchen.
      if (line.accountNumber === "9999") continue;

      const accountId = accountByNumber.get(line.accountNumber);
      if (!accountId) continue;
      if (line.amount === 0) continue;

      const debit = isAsset
        ? new Decimal(line.amount)
        : new Decimal(0);
      const credit = isAsset
        ? new Decimal(0)
        : new Decimal(line.amount);

      carryRows.push({
        tenantId,
        fiscalYear: nextFiscalYear,
        ledgerAccountId: accountId,
        debitAmount: debit,
        creditAmount: credit,
        createdById: userId,
      });
    }
  }

  if (carryRows.length > 0) {
    await tx.openingBalance.createMany({
      data: carryRows,
    });
  }

  const warnings: string[] = [...bilanz.warnings];
  if (bilanz.jahresergebnis !== 0) {
    warnings.push(
      `Jahresergebnis ${bilanz.jahresergebnis.toFixed(2)} € wurde NICHT automatisch ins Eigenkapital vorgetragen. Bitte manuelle Umbuchung auf das Eigenkapital-Konto.`,
    );
  }

  return {
    fiscalYear,
    nextFiscalYear,
    carryForwardCount: carryRows.length,
    snapshotId: snapshot.id,
    bilanzBalanced: balanced,
    warnings,
  };
}
