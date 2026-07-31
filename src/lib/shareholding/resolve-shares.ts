/**
 * Gesellschafteranteile eines Fonds für einen Zeitraum ermitteln.
 *
 * A8 (Audit 2026-07). Wie bei den Verpächteranteilen (A5) ist der **Rückfall**
 * die wichtigste Stelle: solange niemand einen Anteilsverlauf erfasst hat,
 * kommen die Anteile aus dem Stammsatz.
 *
 * Der Unterschied zu A5: der Rückfall ist hier nicht bloss
 * abwärtskompatibel, er behebt bereits den Fehler. `Shareholder` hat
 * `entryDate` und `exitDate` — die Werte sind da, die Ausschüttung hat sie nur
 * nie gelesen. Wer zum 31.03. ausgetreten ist, bekommt damit ab sofort seine
 * 90 Tage, ohne dass eine einzige Zeile nachgepflegt werden müsste.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { ShareholderShare } from "./distribution-split";

export interface ResolvedShareholderShares {
  shares: ShareholderShare[];
  /** Woher die Anteile stammen — gehört in jede Herleitung. */
  source: "SHARE_HISTORY" | "MASTER_DATA_FALLBACK";
  warnings: string[];
}

type ShareholderRow = {
  id: string;
  entryDate: Date | null;
  exitDate: Date | null;
  ownershipPercentage: Prisma.Decimal | number | null;
  distributionPercentage: Prisma.Decimal | number | null;
  shareHistory?: {
    sharePercent: Prisma.Decimal | number;
    validFrom: Date | null;
    validTo: Date | null;
  }[];
};

/** Prisma-Select für den Anteilsverlauf, damit ihn niemand vergisst. */
export const SHAREHOLDER_SHARES_SELECT = {
  select: { sharePercent: true, validFrom: true, validTo: true },
  orderBy: { validFrom: "asc" },
} as const;

/**
 * Anteile aus bereits geladenen Gesellschafterzeilen aufbauen.
 *
 * Rein, damit Aufrufer ihre vorhandene Abfrage weiterverwenden können.
 */
export function resolveShareholderSharesFrom(
  shareholders: readonly ShareholderRow[],
): ResolvedShareholderShares {
  const warnings: string[] = [];
  const shares: ShareholderShare[] = [];
  let usedHistory = false;

  for (const shareholder of shareholders) {
    const history = shareholder.shareHistory ?? [];

    if (history.length > 0) {
      usedHistory = true;
      for (const row of history) {
        shares.push({
          shareholderId: shareholder.id,
          sharePercent: Number(row.sharePercent),
          validFrom: row.validFrom ?? shareholder.entryDate,
          validTo: row.validTo ?? shareholder.exitDate,
        });
      }
      continue;
    }

    // Rückfall auf den Stammsatz. `distributionPercentage` geht vor: bei
    // abweichender Gewinnverteilung ist sie die massgebliche Quote, die
    // Kapitalquote dagegen nur die Beteiligung.
    const percent =
      Number(shareholder.distributionPercentage) || Number(shareholder.ownershipPercentage) || 0;

    if (percent <= 0) {
      // Nicht stillschweigend mit 0 weiterrechnen — das sähe aus wie ein
      // Gesellschafter ohne Anspruch statt wie eine fehlende Angabe.
      warnings.push(
        `Für einen Gesellschafter ist keine Beteiligungsquote hinterlegt — er bleibt bei der Verteilung unberücksichtigt.`,
      );
      continue;
    }

    shares.push({
      shareholderId: shareholder.id,
      sharePercent: percent,
      // entryDate/exitDate SIND die Stichtage. Sie zu ignorieren war der
      // Fehler (Finding 4.1).
      validFrom: shareholder.entryDate,
      validTo: shareholder.exitDate,
    });
  }

  return {
    shares,
    source: usedHistory ? "SHARE_HISTORY" : "MASTER_DATA_FALLBACK",
    warnings,
  };
}

/** Anteile eines Fonds aus der Datenbank holen. */
export async function resolveShareholderShares(
  tenantId: string,
  fundId: string,
): Promise<ResolvedShareholderShares | null> {
  const fund = await prisma.fund.findFirst({
    where: { id: fundId, tenantId },
    select: {
      shareholders: {
        // BEWUSST ohne Filter auf `status: ACTIVE`: wer im Zeitraum
        // ausgetreten ist, steht auf INACTIVE und hat trotzdem Anspruch auf
        // seinen Zeitanteil. Der Filter war der eigentliche Fehler.
        select: {
          id: true,
          entryDate: true,
          exitDate: true,
          ownershipPercentage: true,
          distributionPercentage: true,
          shareHistory: SHAREHOLDER_SHARES_SELECT,
        },
      },
    },
  });

  if (!fund) return null;
  return resolveShareholderSharesFrom(fund.shareholders);
}
