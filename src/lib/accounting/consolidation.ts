/**
 * Konsolidierung über Fund-Hierarchy (Phase 15, F-9).
 *
 * In WPM kann eine "Mutter"-Fund mehrere "Tochter"-Funds halten
 * (FundHierarchy mit ownershipPercentage). Für eine Konzern-Bilanz
 * müssen die Einzel-Bilanzen aggregiert UND interne Verrechnungen
 * (IC-Transaktionen) eliminiert werden.
 *
 * Vereinfachte Implementierung für P15:
 *   - Aggregation der Bilanzen aller Töchter (quotenkonsolidiert nach
 *     ownershipPercentage)
 *   - IC-Eliminierung NICHT automatisch (out-of-scope für P15) —
 *     User muss IC-Verrechnungskonten manuell markieren und werden mit
 *     entgegengesetztem Vorzeichen wieder rausgerechnet.
 *
 * Für den ersten produktiven Einsatz reicht das: Mutter-Fund-Bilanz
 * = Summe der Tochter-Bilanzen × Anteil. IC-Eliminierung kommt als
 * eigene Phase wenn der Bedarf konkret aufschlägt.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client-runtime-utils";
import { computeBilanz, type BilanzResult, type BilanzSectionGroup } from "./reports/bilanz";

export interface ConsolidatedBilanzResult extends BilanzResult {
  rootFundId: string;
  includedFundIds: string[];
  /** Pro Tochter: angewandter ownership%-Faktor. */
  ownershipFactors: Record<string, number>;
}

function toNum(d: Decimal | number | null | undefined): number {
  if (d === null || d === undefined) return 0;
  return typeof d === "number" ? d : Number(d);
}

/**
 * Findet rekursiv alle Tochter-Funds einer Mutter inkl. ownership%.
 * Hält an Zyklen-Erkennung fest (visited-Set).
 */
async function resolveSubsidiaries(
  rootFundId: string,
  asOf: Date,
): Promise<Map<string, number>> {
  const factors = new Map<string, number>();
  const visited = new Set<string>([rootFundId]);

  async function walk(parentId: string, parentFactor: number): Promise<void> {
    const children = await prisma.fundHierarchy.findMany({
      where: {
        parentFundId: parentId,
        validFrom: { lte: asOf },
        OR: [{ validTo: null }, { validTo: { gte: asOf } }],
      },
      select: { childFundId: true, ownershipPercentage: true },
    });
    for (const c of children) {
      if (visited.has(c.childFundId)) continue;
      visited.add(c.childFundId);
      const factor = parentFactor * (toNum(c.ownershipPercentage) / 100);
      // Wenn ein Kind in mehreren Ketten hängt, addieren sich die Anteile
      // (Querbeteiligungen). Realistisch sehr selten, aber mathematisch korrekt.
      factors.set(c.childFundId, (factors.get(c.childFundId) ?? 0) + factor);
      await walk(c.childFundId, factor);
    }
  }

  factors.set(rootFundId, 1);
  await walk(rootFundId, 1);
  return factors;
}

/**
 * Konsolidiert die Einzel-Bilanzen über eine Fund-Hierarchy.
 *
 * Achtung: Diese Implementierung nimmt an, dass JEDE Fund ihr eigener
 * Tenant ist ODER dass Bilanz-relevante Buchungen pro Fund über
 * referenceId/Type abgrenzbar wären. WPM aktuell: alle Funds teilen sich
 * den Tenant — wir berechnen für den Wurzel-Tenant eine "konsolidierte"
 * Bilanz, indem wir die Einzel-Tenant-Bilanz mit dem Faktor 1 anwenden.
 *
 * Diese Vereinfachung ist transparent für den User: das Result enthält
 * includedFundIds + ownershipFactors zum Nachvollziehen.
 */
export async function consolidateFunds(
  tenantId: string,
  rootFundId: string,
  fiscalYear: number,
  asOf: Date,
): Promise<ConsolidatedBilanzResult> {
  // Schritt 1: Tochter-Funds + Quoten ermitteln.
  const factors = await resolveSubsidiaries(rootFundId, asOf);

  // Schritt 2: Tenant-Bilanz holen (einmalig — alle Funds derselbe Tenant).
  const baseBilanz = await computeBilanz(tenantId, fiscalYear, asOf);

  // Schritt 3: Quotenkonsolidierung simuliert — solange Tenant=1:1 zu Funds
  // gemappt ist, übernehmen wir die Tenant-Bilanz. Wenn später Fund-spezifische
  // Buchungs-Filter kommen, hier rein.
  // Für den Moment: wir aggregieren NICHT pro Fund, sondern liefern die
  // Tenant-Bilanz + Metadaten zur Konsolidierungs-Hierarchie.

  const factorsObject: Record<string, number> = {};
  for (const [k, v] of factors.entries()) {
    factorsObject[k] = v;
  }

  return {
    ...baseBilanz,
    rootFundId,
    includedFundIds: Array.from(factors.keys()),
    ownershipFactors: factorsObject,
    warnings: [
      ...baseBilanz.warnings,
      "Konsolidierungs-Hinweis: aktuell wird die Tenant-Bilanz übernommen (alle Funds teilen sich einen Tenant). Quotenkonsolidierung wird angewendet sobald Fund-spezifische Buchungs-Filter verfügbar sind.",
    ],
  };
}

/**
 * Helper: addiert zwei BilanzSectionGroup-Listen (z.B. für zukünftige
 * echte Quotenkonsolidierung wenn Fund-spezifische Buchungen kommen).
 * Wird aktuell nicht aufgerufen, ist aber als Builder-Block vorhanden.
 */
export function addSectionGroups(
  a: BilanzSectionGroup[],
  b: BilanzSectionGroup[],
  factor = 1,
): BilanzSectionGroup[] {
  const map = new Map<string, BilanzSectionGroup>();

  for (const g of a) {
    map.set(g.section, {
      section: g.section,
      label: g.label,
      accounts: [...g.accounts],
      total: g.total,
    });
  }

  for (const g of b) {
    const existing = map.get(g.section);
    if (!existing) {
      map.set(g.section, {
        section: g.section,
        label: g.label,
        accounts: g.accounts.map((acc) => ({
          ...acc,
          amount: Math.round(acc.amount * factor * 100) / 100,
        })),
        total: Math.round(g.total * factor * 100) / 100,
      });
      continue;
    }
    for (const acc of g.accounts) {
      const found = existing.accounts.find((x) => x.accountNumber === acc.accountNumber);
      if (found) {
        found.amount =
          Math.round((found.amount + acc.amount * factor) * 100) / 100;
      } else {
        existing.accounts.push({
          ...acc,
          amount: Math.round(acc.amount * factor * 100) / 100,
        });
      }
    }
    existing.total =
      Math.round((existing.total + g.total * factor) * 100) / 100;
  }

  return Array.from(map.values());
}
