import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";
import { apiLogger as logger } from "@/lib/logger";
import { MS_PER_DAY } from "@/lib/constants/time";

export interface DeadlineEvent {
  id: string;
  entityType: "contract" | "lease";
  entityId: string;
  title: string;
  eventType: "end" | "notice" | "renewal";
  date: string;
  daysRemaining: number;
  urgency: "overdue" | "urgent" | "soon" | "ok";
  href: string;
}

function getUrgency(daysRemaining: number): DeadlineEvent["urgency"] {
  if (daysRemaining < 0) return "overdue";
  if (daysRemaining <= 30) return "urgent";
  if (daysRemaining <= 90) return "soon";
  return "ok";
}

function daysBetween(from: Date, to: Date): number {
  const diffMs = to.getTime() - from.getTime();
  return Math.floor(diffMs / MS_PER_DAY);
}

// GET /api/deadlines?from=2026-01-01&to=2026-12-31
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("leases:read");
    if (!check.authorized) return check.error!;

    const { searchParams } = new URL(request.url);
    const now = new Date();

    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");

    const from = fromStr ? new Date(fromStr) : now;
    const to = toStr
      ? new Date(toStr)
      : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const { tenantId } = check;
    const events: DeadlineEvent[] = [];

    // --- Contracts ---
    const contracts = await prisma.contract.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: "ACTIVE",
        OR: [
          { endDate: { gte: from, lte: to } },
          { noticeDeadline: { gte: from, lte: to } },
        ],
      },
      include: {
        park: { select: { name: true } },
        fund: { select: { name: true } },
      },
    });

    for (const c of contracts) {
      const label = c.title || c.contractNumber || "Vertrag";
      const parkInfo = c.park?.name ? ` (${c.park.name})` : "";

      if (c.endDate) {
        const days = daysBetween(now, c.endDate);
        events.push({
          id: `contract-end-${c.id}`,
          entityType: "contract",
          entityId: c.id,
          title: `${label}${parkInfo} — Vertragsende`,
          eventType: "end",
          date: c.endDate.toISOString().split("T")[0],
          daysRemaining: days,
          urgency: getUrgency(days),
          href: `/verwaltung/contracts/${c.id}`,
        });
      }

      if (c.noticeDeadline) {
        const days = daysBetween(now, c.noticeDeadline);
        events.push({
          id: `contract-notice-${c.id}`,
          entityType: "contract",
          entityId: c.id,
          title: `${label}${parkInfo} — Kündigungsfrist`,
          eventType: "notice",
          date: c.noticeDeadline.toISOString().split("T")[0],
          daysRemaining: days,
          urgency: getUrgency(days),
          href: `/verwaltung/contracts/${c.id}`,
        });
      }
    }

    // --- Leases ---
    const leases = await prisma.lease.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: "ACTIVE",
        endDate: { gte: from, lte: to },
      },
      include: {
        lessor: {
          select: { firstName: true, lastName: true, companyName: true },
        },
        contractPartnerFund: { select: { name: true } },
      },
    });

    for (const l of leases) {
      if (!l.endDate) continue;

      const lessorName = l.lessor.companyName
        ? l.lessor.companyName
        : `${l.lessor.firstName ?? ""} ${l.lessor.lastName ?? ""}`.trim();
      const fundInfo = l.contractPartnerFund?.name
        ? ` (${l.contractPartnerFund.name})`
        : "";

      const days = daysBetween(now, l.endDate);
      events.push({
        id: `lease-end-${l.id}`,
        entityType: "lease",
        entityId: l.id,
        title: `Pacht ${lessorName}${fundInfo} — Vertragsende`,
        eventType: "end",
        date: l.endDate.toISOString().split("T")[0],
        daysRemaining: days,
        urgency: getUrgency(days),
        href: `/verwaltung/leases/${l.id}`,
      });
    }

    // Sort by date ascending
    events.sort((a, b) => a.date.localeCompare(b.date));

    logger.info(
      { count: events.length, from: from.toISOString(), to: to.toISOString() },
      "Deadlines fetched"
    );

    return NextResponse.json(events);
  } catch (error) {
    logger.error({ error }, "Failed to fetch deadlines");
    return apiError("FETCH_FAILED", 500, { message: "Fehler beim Laden der Fristen" });
  }
}
