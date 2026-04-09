/**
 * Verpaechter (Lessor) aggregation.
 *
 * Lists all persons that are either a direct lessor on at least one active lease,
 * or are linked via ContactLink with role VERPAECHTER.
 */

import { prisma } from "@/lib/prisma";

export interface VerpaechterRow {
  personId: string;
  name: string;
  email: string | null;
  phone: string | null;
  leaseCount: number;
  activeLeaseCount: number;
  nextExpiry: Date | null;
  lastActivityAt: Date | null;
  hasContactLink: boolean;
}

function personName(p: {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}): string {
  if (p.companyName) return p.companyName;
  return [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "—";
}

export async function getVerpaechterList(
  tenantId: string,
): Promise<VerpaechterRow[]> {
  // Fetch all persons who are either direct lessor or linked as VERPAECHTER
  const [directLessors, linkedLessors] = await Promise.all([
    prisma.person.findMany({
      where: {
        tenantId,
        leases: { some: { deletedAt: null } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        companyName: true,
        email: true,
        phone: true,
        lastActivityAt: true,
        leases: {
          where: { deletedAt: null },
          select: {
            id: true,
            status: true,
            endDate: true,
          },
        },
      },
    }),
    prisma.person.findMany({
      where: {
        tenantId,
        contactLinks: {
          some: { role: "VERPAECHTER" },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        companyName: true,
        email: true,
        phone: true,
        lastActivityAt: true,
        leases: {
          where: { deletedAt: null },
          select: {
            id: true,
            status: true,
            endDate: true,
          },
        },
      },
    }),
  ]);

  // Merge: linked lessors may also be direct lessors
  const merged = new Map<
    string,
    {
      row: Omit<VerpaechterRow, "hasContactLink">;
      hasContactLink: boolean;
    }
  >();

  for (const p of directLessors) {
    const leases = p.leases;
    const activeLeases = leases.filter((l) => l.status === "ACTIVE");
    const upcomingExpiries = leases
      .map((l) => l.endDate)
      .filter((d): d is Date => d !== null && d.getTime() > Date.now())
      .sort((a, b) => a.getTime() - b.getTime());

    merged.set(p.id, {
      row: {
        personId: p.id,
        name: personName(p),
        email: p.email,
        phone: p.phone,
        leaseCount: leases.length,
        activeLeaseCount: activeLeases.length,
        nextExpiry: upcomingExpiries[0] ?? null,
        lastActivityAt: p.lastActivityAt,
      },
      hasContactLink: false,
    });
  }

  for (const p of linkedLessors) {
    const existing = merged.get(p.id);
    if (existing) {
      existing.hasContactLink = true;
      continue;
    }
    const leases = p.leases;
    const activeLeases = leases.filter((l) => l.status === "ACTIVE");
    const upcomingExpiries = leases
      .map((l) => l.endDate)
      .filter((d): d is Date => d !== null && d.getTime() > Date.now())
      .sort((a, b) => a.getTime() - b.getTime());
    merged.set(p.id, {
      row: {
        personId: p.id,
        name: personName(p),
        email: p.email,
        phone: p.phone,
        leaseCount: leases.length,
        activeLeaseCount: activeLeases.length,
        nextExpiry: upcomingExpiries[0] ?? null,
        lastActivityAt: p.lastActivityAt,
      },
      hasContactLink: true,
    });
  }

  return Array.from(merged.values())
    .map((v) => ({ ...v.row, hasContactLink: v.hasContactLink }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}
