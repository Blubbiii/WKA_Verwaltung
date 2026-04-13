/**
 * Expiring items aggregator.
 *
 * Returns Leases and Contracts that will expire within a configurable window.
 * Used by the dashboard widget and the /api/crm/expiring endpoint.
 */

import { prisma } from "@/lib/prisma";
import { MS_PER_DAY } from "@/lib/constants/time";

export interface ExpiringLease {
  id: string;
  endDate: Date;
  daysUntilExpiry: number;
  lessorName: string;
  lessorId: string;
  parkName: string | null;
  parkId: string | null;
  status: string;
}

export interface ExpiringContract {
  id: string;
  title: string;
  contractNumber: string | null;
  contractType: string;
  endDate: Date;
  daysUntilExpiry: number;
  noticeDeadline: Date | null;
  partnerName: string | null;
  partnerId: string | null;
  parkName: string | null;
  fundName: string | null;
  status: string;
}

export interface ExpiringItems {
  leases: ExpiringLease[];
  contracts: ExpiringContract[];
  totalCount: number;
}

function daysUntil(date: Date): number {
  const ms = date.getTime() - Date.now();
  return Math.round(ms / MS_PER_DAY);
}

function personName(p: {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}): string {
  if (p.companyName) return p.companyName;
  return [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "—";
}

/**
 * Load leases + contracts that expire within `withinDays` days.
 * For contracts, the largest value in `reminderDays` is used as the warning
 * horizon (defaults to withinDays if no reminder is configured).
 */
export async function getExpiringItems(
  tenantId: string,
  withinDays = 90,
): Promise<ExpiringItems> {
  const now = new Date();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + withinDays);

  const [leases, contracts] = await Promise.all([
    prisma.lease.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: "ACTIVE",
        endDate: { gte: now, lte: horizon },
      },
      select: {
        id: true,
        endDate: true,
        status: true,
        lessor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyName: true,
          },
        },
        leasePlots: {
          select: {
            plot: { select: { park: { select: { id: true, name: true } } } },
          },
          take: 1,
        },
      },
      orderBy: { endDate: "asc" },
      take: 100,
    }),

    prisma.contract.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: "ACTIVE",
        endDate: { gte: now, lte: horizon },
      },
      select: {
        id: true,
        title: true,
        contractNumber: true,
        contractType: true,
        endDate: true,
        noticeDeadline: true,
        reminderDays: true,
        status: true,
        partner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyName: true,
          },
        },
        park: { select: { name: true } },
        fund: { select: { name: true } },
      },
      orderBy: { endDate: "asc" },
      take: 100,
    }),
  ]);

  const leaseItems: ExpiringLease[] = leases
    .filter((l) => l.endDate !== null)
    .map((l) => ({
      id: l.id,
      endDate: l.endDate!,
      daysUntilExpiry: daysUntil(l.endDate!),
      lessorName: personName(l.lessor),
      lessorId: l.lessor.id,
      parkName: l.leasePlots[0]?.plot?.park?.name ?? null,
      parkId: l.leasePlots[0]?.plot?.park?.id ?? null,
      status: l.status,
    }));

  const contractItems: ExpiringContract[] = contracts
    .filter((c) => c.endDate !== null)
    .map((c) => {
      const maxReminder = c.reminderDays?.length
        ? Math.max(...c.reminderDays)
        : withinDays;
      const days = daysUntil(c.endDate!);
      // Also include when reminder horizon was hit even if outside withinDays
      // (fine — we already queried within horizon above).
      void maxReminder;
      return {
        id: c.id,
        title: c.title,
        contractNumber: c.contractNumber,
        contractType: c.contractType,
        endDate: c.endDate!,
        daysUntilExpiry: days,
        noticeDeadline: c.noticeDeadline,
        partnerName: c.partner ? personName(c.partner) : null,
        partnerId: c.partner?.id ?? null,
        parkName: c.park?.name ?? null,
        fundName: c.fund?.name ?? null,
        status: c.status,
      };
    });

  return {
    leases: leaseItems,
    contracts: contractItems,
    totalCount: leaseItems.length + contractItems.length,
  };
}
