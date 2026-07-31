/**
 * Verpächteranteile eines Pachtvertrags ermitteln.
 *
 * A5 (Audit 2026-07). Diese Datei entscheidet, ob ein bestehender Vertrag
 * weiterrechnet wie bisher — deshalb ist sie kurz und der Rückfall ausdrücklich.
 *
 * ## Der Rückfall ist die wichtigste Zeile
 *
 * Bestandsverträge haben `lessorId` und keine `LeaseLessor`-Zeilen. Für sie
 * muss sich NICHTS ändern: ein Verpächter, 100 %, keine Stichtage. Würde diese
 * Datei stattdessen „keine Anteile hinterlegt" melden, bliebe jede
 * Bestandsabrechnung stehen — ein Feature, das alte Daten unbrauchbar macht,
 * ist kein Feature.
 *
 * Erst wenn jemand Anteile erfasst, gelten sie. Das ist auch die
 * Migrationsstrategie: kein Backfill, kein Stichtag, keine Umstellung. Wer die
 * Erbengemeinschaft braucht, erfasst sie; alle anderen merken nichts.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { LessorShare } from "./share-split";

export interface ResolvedShares {
  shares: LessorShare[];
  /** Woher die Anteile stammen — gehört in jede Herleitung. */
  source: "LEASE_LESSORS" | "SINGLE_LESSOR_FALLBACK";
}

/**
 * Anteile aus bereits geladenen Daten aufbauen.
 *
 * Als reine Funktion, damit die Aufrufer in der Settlement-Engine ihre
 * bestehenden Abfragen weiterverwenden können, statt je Vertrag eine weitere
 * abzusetzen.
 */
export function resolveSharesFrom(lease: {
  lessorId: string | null;
  lessorShares?: {
    personId: string;
    sharePercent: Prisma.Decimal | number;
    validFrom: Date | null;
    validTo: Date | null;
  }[];
}): ResolvedShares | null {
  const rows = lease.lessorShares ?? [];

  if (rows.length > 0) {
    return {
      shares: rows.map((row) => ({
        personId: row.personId,
        sharePercent: Number(row.sharePercent),
        validFrom: row.validFrom,
        validTo: row.validTo,
      })),
      source: "LEASE_LESSORS",
    };
  }

  // Rückfall: der Vertrag hat genau einen Verpächter wie bisher.
  if (lease.lessorId) {
    return {
      shares: [
        { personId: lease.lessorId, sharePercent: 100, validFrom: null, validTo: null },
      ],
      source: "SINGLE_LESSOR_FALLBACK",
    };
  }

  // Weder das eine noch das andere — ein Vertrag ohne Verpächter. Das ist ein
  // Datenfehler und kein Fall für eine stille Annahme.
  return null;
}

/** Anteile eines Vertrags aus der Datenbank holen. */
export async function resolveShares(
  tenantId: string,
  leaseId: string,
): Promise<ResolvedShares | null> {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, tenantId },
    select: {
      lessorId: true,
      lessorShares: {
        select: { personId: true, sharePercent: true, validFrom: true, validTo: true },
        orderBy: { validFrom: "asc" },
      },
    },
  });

  if (!lease) return null;
  return resolveSharesFrom(lease);
}

/**
 * Prisma-Select für die Anteile, damit die Aufrufer in der Settlement-Engine
 * nicht jedes Mal dieselbe Struktur abtippen — und keiner sie vergisst.
 */
export const LESSOR_SHARES_SELECT = {
  select: { personId: true, sharePercent: true, validFrom: true, validTo: true },
  orderBy: { validFrom: "asc" },
} as const;
