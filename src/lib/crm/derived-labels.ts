/**
 * Derived Labels
 *
 * A "Label" on a Person is either:
 *   - derived automatically from existing relations (Lease, Shareholder, Contract)
 *   - or custom, stored in the PersonTag model
 *
 * This module provides helpers to compute the derived set for one or many
 * persons, plus the fixed list of label keys so the list API can build a
 * filter drop-down.
 */

/**
 * Server-only module — never import from client components.
 * Client-safe constants live in ./label-constants.ts
 */
import { prisma } from "@/lib/prisma";
import { DERIVED_LABEL_KEYS, type DerivedLabel } from "./label-constants";

// Re-export for convenience so existing server-side imports from this module
// keep working after the client/server split.
export { DERIVED_LABEL_KEYS };
export type { DerivedLabel };

/**
 * Raw relation data needed to decide whether a person has a given derived label.
 * Kept flat so the caller can pick whichever subset it already fetched.
 */
export interface LabelSource {
  activeLeaseCount?: number;
  activeShareholderCount?: number;
  serviceContractCount?: number;
  insuranceContractCount?: number;
  gridContractCount?: number;
  marketingContractCount?: number;
}

export function computeDerivedLabels(src: LabelSource): DerivedLabel[] {
  const out: DerivedLabel[] = [];
  if ((src.activeLeaseCount ?? 0) > 0) out.push("LESSOR");
  if ((src.activeShareholderCount ?? 0) > 0) out.push("SHAREHOLDER");
  if ((src.serviceContractCount ?? 0) > 0) out.push("MAINTENANCE");
  if ((src.insuranceContractCount ?? 0) > 0) out.push("INSURANCE");
  if ((src.gridContractCount ?? 0) > 0) out.push("GRID_OPERATOR");
  if ((src.marketingContractCount ?? 0) > 0) out.push("DIRECT_MARKETING");
  return out;
}

// ---------------------------------------------------------------------------
// Bulk lookup — for the list endpoint
// ---------------------------------------------------------------------------

export interface PersonLabelBundle {
  personId: string;
  labels: string[]; // derived + custom tag names, deduped
  /** Context numbers — consumed by dynamic columns on the list UI. */
  context: {
    activeLeaseCount: number;
    activeShareholderCount: number;
    totalYearlyRentEur: number | null;
    totalCapitalContributionEur: number | null;
  };
}

/**
 * For a set of person IDs within a tenant, compute the union of derived +
 * custom labels plus the aggregate numbers needed for the dynamic list
 * columns. Runs queries in parallel.
 */
export async function loadLabelsForPersons(
  tenantId: string,
  personIds: string[],
): Promise<Map<string, PersonLabelBundle>> {
  if (personIds.length === 0) return new Map();

  const [
    leaseGroups,
    shareholderGroups,
    serviceGroups,
    insuranceGroups,
    gridGroups,
    marketingGroups,
    tagJoin,
    shareholderCapital,
  ] = await Promise.all([
    // Active leases by lessor
    prisma.lease.groupBy({
      by: ["lessorId"],
      where: {
        tenantId,
        lessorId: { in: personIds },
        status: "ACTIVE",
        deletedAt: null,
      },
      _count: { _all: true },
    }),

    // Active shareholders
    prisma.shareholder.groupBy({
      by: ["personId"],
      where: {
        personId: { in: personIds },
        status: "ACTIVE",
        fund: { tenantId },
      },
      _count: { _all: true },
    }),

    // Contract partners, by contractType
    prisma.contract.groupBy({
      by: ["partnerId"],
      where: {
        tenantId,
        partnerId: { in: personIds },
        contractType: "SERVICE",
        status: "ACTIVE",
        deletedAt: null,
      },
      _count: { _all: true },
    }),
    prisma.contract.groupBy({
      by: ["partnerId"],
      where: {
        tenantId,
        partnerId: { in: personIds },
        contractType: "INSURANCE",
        status: "ACTIVE",
        deletedAt: null,
      },
      _count: { _all: true },
    }),
    prisma.contract.groupBy({
      by: ["partnerId"],
      where: {
        tenantId,
        partnerId: { in: personIds },
        contractType: "GRID_CONNECTION",
        status: "ACTIVE",
        deletedAt: null,
      },
      _count: { _all: true },
    }),
    prisma.contract.groupBy({
      by: ["partnerId"],
      where: {
        tenantId,
        partnerId: { in: personIds },
        contractType: "MARKETING",
        status: "ACTIVE",
        deletedAt: null,
      },
      _count: { _all: true },
    }),

    // Custom tags (PersonTag — intern bleibt der Name "Tag")
    prisma.person.findMany({
      where: { id: { in: personIds }, tenantId },
      select: { id: true, tags: { select: { name: true } } },
    }),

    // Capital contribution sum per person (for dynamic column "Gesellschafter")
    prisma.shareholder.groupBy({
      by: ["personId"],
      where: {
        personId: { in: personIds },
        status: "ACTIVE",
        fund: { tenantId },
      },
      _sum: { capitalContribution: true },
    }),
  ]);

  // Build fast-lookup maps
  const countByPerson = <K extends string>(
    rows: Array<{ _count: { _all: number } } & Record<K, string | null>>,
    key: K,
  ): Map<string, number> => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const id = r[key];
      if (typeof id === "string") m.set(id, r._count._all);
    }
    return m;
  };

  const leaseCount = countByPerson(leaseGroups, "lessorId");
  const shareholderCount = countByPerson(shareholderGroups, "personId");
  const serviceCount = countByPerson(serviceGroups, "partnerId");
  const insuranceCount = countByPerson(insuranceGroups, "partnerId");
  const gridCount = countByPerson(gridGroups, "partnerId");
  const marketingCount = countByPerson(marketingGroups, "partnerId");

  const tagsByPerson = new Map<string, string[]>();
  for (const p of tagJoin) {
    tagsByPerson.set(
      p.id,
      p.tags.map((t) => t.name),
    );
  }

  const capitalByPerson = new Map<string, number>();
  for (const row of shareholderCapital) {
    if (row.personId) {
      capitalByPerson.set(
        row.personId,
        row._sum.capitalContribution
          ? Number(row._sum.capitalContribution)
          : 0,
      );
    }
  }

  // Build result map
  const out = new Map<string, PersonLabelBundle>();
  for (const id of personIds) {
    const derived = computeDerivedLabels({
      activeLeaseCount: leaseCount.get(id) ?? 0,
      activeShareholderCount: shareholderCount.get(id) ?? 0,
      serviceContractCount: serviceCount.get(id) ?? 0,
      insuranceContractCount: insuranceCount.get(id) ?? 0,
      gridContractCount: gridCount.get(id) ?? 0,
      marketingContractCount: marketingCount.get(id) ?? 0,
    });
    const custom = tagsByPerson.get(id) ?? [];
    // Derived keys are UPPER_SNAKE (LESSOR, ...) and custom labels are
    // user-typed free text — no collision risk. Concatenate directly.
    const labels = [...derived, ...custom];

    out.set(id, {
      personId: id,
      labels,
      context: {
        activeLeaseCount: leaseCount.get(id) ?? 0,
        activeShareholderCount: shareholderCount.get(id) ?? 0,
        totalYearlyRentEur: null, // future — lease yearly rent sum
        totalCapitalContributionEur: capitalByPerson.get(id) ?? null,
      },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// WHERE-clause builder for the list API filter
// ---------------------------------------------------------------------------

/**
 * Translates a list of label filters into a Prisma Person `where` fragment.
 * AND semantics: a person must match every label.
 *
 * Derived labels are translated into relation filters; custom labels into
 * a `tags.some` filter. Unknown labels fall back to custom (tag) matching.
 */
export function labelFilterToWhere(labels: string[]): object[] {
  const ands: object[] = [];
  for (const label of labels) {
    switch (label) {
      case "LESSOR":
        ands.push({
          leases: {
            some: { status: "ACTIVE", deletedAt: null },
          },
        });
        break;
      case "SHAREHOLDER":
        ands.push({
          shareholders: {
            some: { status: "ACTIVE" },
          },
        });
        break;
      case "MAINTENANCE":
        ands.push({
          contracts: {
            some: {
              contractType: "SERVICE",
              status: "ACTIVE",
              deletedAt: null,
            },
          },
        });
        break;
      case "INSURANCE":
        ands.push({
          contracts: {
            some: {
              contractType: "INSURANCE",
              status: "ACTIVE",
              deletedAt: null,
            },
          },
        });
        break;
      case "GRID_OPERATOR":
        ands.push({
          contracts: {
            some: {
              contractType: "GRID_CONNECTION",
              status: "ACTIVE",
              deletedAt: null,
            },
          },
        });
        break;
      case "DIRECT_MARKETING":
        ands.push({
          contracts: {
            some: {
              contractType: "MARKETING",
              status: "ACTIVE",
              deletedAt: null,
            },
          },
        });
        break;
      default:
        // Treat anything else as a custom label (PersonTag name)
        ands.push({
          tags: { some: { name: label } },
        });
    }
  }
  return ands;
}
