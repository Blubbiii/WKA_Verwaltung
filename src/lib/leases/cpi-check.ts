/**
 * F-2 Sprint 4: CPI/Wertsicherungs-Anpassungs-Check für Pachtverträge.
 *
 * §9 PrKG (Preisklauselgesetz) erlaubt Wertsicherungsklauseln bei
 * Langzeitverträgen. Typisches Intervall: alle 24 Monate oder
 * bei +10% CPI-Veränderung gegenüber Basisjahr.
 *
 * Diese Lib findet überfällige Indexierungen für ein bestimmtes Datum
 * und liefert eine Liste für ein Cron-Job / Dashboard-Widget.
 */

import { prisma } from "@/lib/prisma";

export interface CpiDueLease {
  leaseId: string;
  lessorName: string;
  startDate: Date;
  cpiAdjustmentMonths: number;
  cpiLastAdjustedAt: Date | null;
  nextDueDate: Date;
  daysOverdue: number;
}

/**
 * Liefert alle Leases deren Wertsicherungs-Anpassung fällig ist.
 *
 * @param tenantId Mandant
 * @param asOf Stichtag (default: jetzt)
 * @param horizonDays optionaler Look-Ahead — auch in `horizonDays` fällige Pachten zurückliefern
 */
export async function findDueCpiAdjustments(
  tenantId: string,
  asOf: Date = new Date(),
  horizonDays: number = 30,
): Promise<CpiDueLease[]> {
  const leases = await prisma.lease.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: "ACTIVE",
      cpiAdjustmentMonths: { not: null },
    },
    select: {
      id: true,
      startDate: true,
      cpiAdjustmentMonths: true,
      cpiLastAdjustedAt: true,
      lessor: {
        select: { firstName: true, lastName: true, companyName: true },
      },
    },
  });

  const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
  const result: CpiDueLease[] = [];

  for (const l of leases) {
    if (!l.cpiAdjustmentMonths) continue;
    const baseline = l.cpiLastAdjustedAt ?? l.startDate;
    const nextDue = new Date(baseline);
    nextDue.setMonth(nextDue.getMonth() + l.cpiAdjustmentMonths);

    // Innerhalb des Horizonts?
    const diffMs = nextDue.getTime() - asOf.getTime();
    if (diffMs > horizonMs) continue;

    const daysOverdue = Math.floor(
      (asOf.getTime() - nextDue.getTime()) / (24 * 60 * 60 * 1000),
    );

    const name =
      l.lessor.companyName ||
      `${l.lessor.firstName ?? ""} ${l.lessor.lastName ?? ""}`.trim() ||
      "Unbekannt";

    result.push({
      leaseId: l.id,
      lessorName: name,
      startDate: l.startDate,
      cpiAdjustmentMonths: l.cpiAdjustmentMonths,
      cpiLastAdjustedAt: l.cpiLastAdjustedAt,
      nextDueDate: nextDue,
      daysOverdue: Math.max(0, daysOverdue),
    });
  }

  // Überfällige zuerst, dann nach nextDueDate
  result.sort((a, b) => {
    if (a.daysOverdue !== b.daysOverdue) return b.daysOverdue - a.daysOverdue;
    return a.nextDueDate.getTime() - b.nextDueDate.getTime();
  });

  return result;
}
