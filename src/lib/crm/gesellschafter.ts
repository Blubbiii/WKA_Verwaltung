/**
 * Gesellschafter (Shareholder) aggregation.
 *
 * Groups all Shareholder rows by person and aggregates capital, distribution
 * percentage and number of fund participations.
 */

import { prisma } from "@/lib/prisma";

export interface GesellschafterRow {
  personId: string;
  name: string;
  email: string | null;
  phone: string | null;
  fundCount: number;
  totalCapitalContribution: number;
  avgOwnershipPercentage: number | null;
  hasActiveExit: boolean;
  lastActivityAt: Date | null;
  funds: Array<{
    fundId: string;
    fundName: string;
    ownershipPercentage: number | null;
    capitalContribution: number | null;
    status: string;
    entryDate: Date | null;
    exitDate: Date | null;
  }>;
}

function personName(p: {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}): string {
  if (p.companyName) return p.companyName;
  return [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "—";
}

export async function getGesellschafterList(
  tenantId: string,
): Promise<GesellschafterRow[]> {
  const shareholders = await prisma.shareholder.findMany({
    where: { fund: { tenantId } },
    select: {
      id: true,
      fundId: true,
      status: true,
      entryDate: true,
      exitDate: true,
      ownershipPercentage: true,
      capitalContribution: true,
      fund: { select: { id: true, name: true } },
      person: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          companyName: true,
          email: true,
          phone: true,
          lastActivityAt: true,
        },
      },
    },
  });

  const byPerson = new Map<string, GesellschafterRow>();

  for (const s of shareholders) {
    const pid = s.person.id;
    let row = byPerson.get(pid);
    if (!row) {
      row = {
        personId: pid,
        name: personName(s.person),
        email: s.person.email,
        phone: s.person.phone,
        fundCount: 0,
        totalCapitalContribution: 0,
        avgOwnershipPercentage: null,
        hasActiveExit: false,
        lastActivityAt: s.person.lastActivityAt,
        funds: [],
      };
      byPerson.set(pid, row);
    }
    row.fundCount += 1;
    const capital = s.capitalContribution ? Number(s.capitalContribution) : 0;
    row.totalCapitalContribution += capital;
    if (s.exitDate) row.hasActiveExit = true;
    row.funds.push({
      fundId: s.fund.id,
      fundName: s.fund.name,
      ownershipPercentage: s.ownershipPercentage
        ? Number(s.ownershipPercentage)
        : null,
      capitalContribution: capital,
      status: s.status,
      entryDate: s.entryDate,
      exitDate: s.exitDate,
    });
  }

  // Compute avgOwnershipPercentage
  for (const row of byPerson.values()) {
    const pct = row.funds
      .map((f) => f.ownershipPercentage)
      .filter((p): p is number => p !== null);
    row.avgOwnershipPercentage = pct.length
      ? pct.reduce((a, b) => a + b, 0) / pct.length
      : null;
  }

  return Array.from(byPerson.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "de"),
  );
}
